import { env } from "cloudflare:workers";
import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";

import {
	AVIF_QUALITY,
	assetCacheKey,
	handleBadgeRequest,
	parseBadgePath,
	tokenCacheKey,
	type BadgeDependencies,
} from "../src/index";

declare module "cloudflare:workers" {
	interface ProvidedEnv extends Env {}
}

const PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function pngResponse(): Response {
	const bytes = Uint8Array.from(atob(PNG_BASE64), (character) =>
		character.charCodeAt(0),
	);
	return new Response(bytes, {
		headers: { "Content-Type": "image/png" },
	});
}

function dependencies(
	token: string,
): BadgeDependencies & {
	fetchBadge: ReturnType<typeof vi.fn>;
	queryBadgeToken: ReturnType<typeof vi.fn>;
} {
	return {
		cache: caches.default,
		fetchBadge: vi.fn(async () => pngResponse()),
		queryBadgeToken: vi.fn(async () => token),
	};
}

describe("badge path parsing", () => {
	it("keeps bare and .png paths as PNG and recognizes AVIF", () => {
		expect(parseBadgePath("/%23p0y")).toEqual({
			clanTag: "P0Y",
			format: "png",
		});
		expect(parseBadgePath("/P0Y.png")).toEqual({
			clanTag: "P0Y",
			format: "png",
		});
		expect(parseBadgePath("/p0y.AVIF")).toEqual({
			clanTag: "P0Y",
			format: "avif",
		});
		expect(parseBadgePath("/P0Y.webp")).toBeNull();
	});
});

describe("badge asset caching", () => {
	it("encodes AVIF badges at the configured quality", () => {
		expect(AVIF_QUALITY).toBe(65);
	});

	it("stores PNGs by token and size and shares the normalized response cache", async () => {
		const mocks = dependencies("png-token");
		const firstContext = createExecutionContext();
		const first = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P0Y?size=small"),
			env,
			firstContext,
			mocks,
		);
		expect(first.status).toBe(200);
		expect(first.headers.get("Content-Type")).toBe("image/png");
		expect(first.headers.get("Cache-Control")).toBe(
			"public, max-age=86400, s-maxage=86400",
		);
		expect(new Uint8Array(await first.arrayBuffer()).slice(0, 4)).toEqual(
			new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		);
		await waitOnExecutionContext(firstContext);

		expect(await env.BADGE_CACHE.get(tokenCacheKey("P0Y"))).toBe(
			"png-token",
		);
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("png", 70, "png-token"),
				"arrayBuffer",
			),
		).not.toBeNull();

		const secondContext = createExecutionContext();
		const second = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P0Y.png?size=small"),
			env,
			secondContext,
			mocks,
		);
		expect(second.status).toBe(200);
		await second.arrayBuffer();
		await waitOnExecutionContext(secondContext);
		expect(mocks.queryBadgeToken).toHaveBeenCalledTimes(1);
		expect(mocks.fetchBadge).toHaveBeenCalledTimes(1);
	});

	it("converts AVIF once and reuses permanent token assets across clan tags", async () => {
		const mocks = dependencies("shared-avif-token");

		for (const clanTag of ["P2Y", "P8Y"]) {
			const context = createExecutionContext();
			const response = await handleBadgeRequest(
				new Request(
					`https://badges.clashk.ing/${clanTag}.avif?size=medium`,
				),
				env,
				context,
				mocks,
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("image/avif");
			const bytes = new Uint8Array(await response.arrayBuffer());
			expect(new TextDecoder().decode(bytes.slice(4, 12))).toContain("ftyp");
			await waitOnExecutionContext(context);
		}

		expect(mocks.queryBadgeToken).toHaveBeenCalledTimes(2);
		expect(mocks.fetchBadge).toHaveBeenCalledTimes(1);
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("png", 200, "shared-avif-token"),
				"arrayBuffer",
			),
		).not.toBeNull();
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("avif", 200, "shared-avif-token"),
				"arrayBuffer",
			),
		).not.toBeNull();
	});

	it("does not cache a database-error placeholder response", async () => {
		const mocks = dependencies("unused-token");
		mocks.queryBadgeToken.mockRejectedValueOnce(new Error("database offline"));
		const context = createExecutionContext();
		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P9Y.png?size=large"),
			env,
			context,
			mocks,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await response.arrayBuffer();
		await waitOnExecutionContext(context);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("P9Y"))).toBeNull();
	});
});
