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
	parseSize,
	tokenCacheKey,
	type BadgeDependencies,
} from "../src/index";

declare module "cloudflare:workers" {
	interface ProvidedEnv extends Env {}
}

const PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const HINT_SECRET = "badge-hint-test-secret-that-is-at-least-32-characters";

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
	getBadgeHintSecret: ReturnType<typeof vi.fn>;
} {
	return {
		fetchBadge: vi.fn(async () => pngResponse()),
		queryBadgeToken: vi.fn(async () => token),
		getBadgeHintSecret: vi.fn(() => HINT_SECRET),
	};
}

async function signHint(clanTag: string, token: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(HINT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(`v1\n${clanTag}\n${token}`),
		),
	);
	return btoa(String.fromCharCode(...signature))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function hintedRequest(url: string, clanTag: string, token: string): Promise<Request> {
	return signHint(clanTag, token).then(
		(signature) =>
			new Request(url, {
				headers: {
					"X-ClashKing-Badge-Token": token,
					"X-ClashKing-Badge-Signature": signature,
				},
			}),
	);
}

describe("badge request parsing", () => {
	it("requires a PNG or AVIF extension", () => {
		expect(parseBadgePath("/%23p0y")).toBeNull();
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

	it("supports named and numeric sizes without upscaling", () => {
		for (const size of [
			"small",
			"medium",
			"large",
			"64",
			"128",
			"256",
			"512",
		]) {
			expect(parseSize(size)).toBe(size);
		}
		expect(parseSize(null)).toBe("small");
		expect(parseSize("1024")).toBeNull();
	});

	it("rejects cache-fragmenting query parameters", async () => {
		const mocks = dependencies("unused-token");
		for (const url of [
			"https://badges.clashk.ing/P0Y.png?token=junk",
			"https://badges.clashk.ing/P0Y.png?size=64&size=128",
		]) {
			const response = await handleBadgeRequest(
				new Request(url),
				env,
				createExecutionContext(),
				mocks,
			);
			expect(response.status).toBe(400);
		}
		expect(mocks.queryBadgeToken).not.toHaveBeenCalled();
	});
});

describe("badge asset caching", () => {
	it("versions AVIF assets by encoding quality", () => {
		expect(AVIF_QUALITY).toBe(45);
		expect(assetCacheKey("avif", 200, "token")).toBe(
			"asset:v1:avif:q45:200:token",
		);
		expect(assetCacheKey("png", 200, "token")).toBe(
			"asset:v1:png:200:token",
		);
	});

	it("stores source PNGs by token and reuses them across requests", async () => {
		const mocks = dependencies("png-token");

		for (const clanTag of ["P0Y", "P2Y"]) {
			const context = createExecutionContext();
			const response = await handleBadgeRequest(
				new Request(
					`https://badges.clashk.ing/${clanTag}.png?size=small`,
				),
				env,
				context,
				mocks,
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("image/png");
			expect(response.headers.get("Cache-Control")).toBe(
				"public, max-age=86400, s-maxage=86400",
			);
			expect(response.headers.get("Vary")).toBeNull();
			await response.arrayBuffer();
			await waitOnExecutionContext(context);
		}

		expect(mocks.queryBadgeToken).toHaveBeenCalledTimes(2);
		expect(mocks.fetchBadge).toHaveBeenCalledTimes(1);
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("png", 70, "png-token"),
				"arrayBuffer",
			),
		).not.toBeNull();
	});

	it("fetches the nearest upstream size and stores an exact numeric PNG", async () => {
		const mocks = dependencies("numeric-token");
		const context = createExecutionContext();
		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P8Y.png?size=64"),
			env,
			context,
			mocks,
		);
		expect(response.status).toBe(200);
		await response.arrayBuffer();
		await waitOnExecutionContext(context);

		expect(mocks.fetchBadge).toHaveBeenCalledWith("numeric-token", 70);
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("png", 64, "numeric-token"),
				"arrayBuffer",
			),
		).not.toBeNull();
	});

	it("converts AVIF once and reuses it across clan tags", async () => {
		const mocks = dependencies("shared-avif-token");

		for (const clanTag of ["P9Y", "PGY"]) {
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

		expect(mocks.fetchBadge).toHaveBeenCalledTimes(1);
		expect(
			await env.BADGE_CACHE.get(
				assetCacheKey("avif", 200, "shared-avif-token"),
				"arrayBuffer",
			),
		).not.toBeNull();
	});
});

describe("signed token hints", () => {
	it("does not inspect or overwrite a positive cached mapping", async () => {
		await env.BADGE_CACHE.put(tokenCacheKey("PQL"), "cached-token");
		const mocks = dependencies("database-token");
		const request = await hintedRequest(
			"https://badges.clashk.ing/PQL.png?size=small",
			"PQL",
			"different-token",
		);
		const context = createExecutionContext();
		const response = await handleBadgeRequest(request, env, context, mocks);
		await response.arrayBuffer();
		await waitOnExecutionContext(context);

		expect(mocks.queryBadgeToken).not.toHaveBeenCalled();
		expect(mocks.getBadgeHintSecret).not.toHaveBeenCalled();
		expect(mocks.fetchBadge).toHaveBeenCalledWith("cached-token", 70);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("PQL"))).toBe(
			"cached-token",
		);
	});

	it("replaces a recent missing mapping with a valid signed hint", async () => {
		await env.BADGE_CACHE.put(tokenCacheKey("PJC"), "null", {
			expirationTtl: 300,
		});
		const mocks = dependencies("unused-token");
		const request = await hintedRequest(
			"https://badges.clashk.ing/PJC.png?size=128",
			"PJC",
			"hinted-token",
		);
		const context = createExecutionContext();
		const response = await handleBadgeRequest(request, env, context, mocks);
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=86400, s-maxage=86400",
		);
		expect(response.headers.get("Vary")).toBeNull();
		await response.arrayBuffer();
		await waitOnExecutionContext(context);

		expect(mocks.queryBadgeToken).not.toHaveBeenCalled();
		expect(mocks.fetchBadge).toHaveBeenCalledWith("hinted-token", 200);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("PJC"))).toBe(
			"hinted-token",
		);
	});

	it("ignores an invalid signature and keeps the short missing-tag cache", async () => {
		const mocks = dependencies("null");
		const context = createExecutionContext();
		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/PVY.avif?size=small", {
				headers: {
					"X-ClashKing-Badge-Token": "untrusted-token",
					"X-ClashKing-Badge-Signature": "invalid",
				},
			}),
			env,
			context,
			mocks,
		);
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=300, s-maxage=300",
		);
		await response.arrayBuffer();
		await waitOnExecutionContext(context);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("PVY"))).toBe("null");
		expect(mocks.fetchBadge).toHaveBeenCalledWith("null", 70);
	});

	it("uses and stores a valid hint when the database is unavailable", async () => {
		const mocks = dependencies("unused-token");
		mocks.queryBadgeToken.mockRejectedValueOnce(new Error("database offline"));
		const request = await hintedRequest(
			"https://badges.clashk.ing/PQY.png?size=256",
			"PQY",
			"outage-token",
		);
		const context = createExecutionContext();
		const response = await handleBadgeRequest(request, env, context, mocks);
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=86400, s-maxage=86400",
		);
		await response.arrayBuffer();
		await waitOnExecutionContext(context);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("PQY"))).toBe(
			"outage-token",
		);
		expect(mocks.fetchBadge).toHaveBeenCalledWith("outage-token", 512);
	});

	it("does not cache a database-error placeholder response without a hint", async () => {
		const mocks = dependencies("unused-token");
		mocks.queryBadgeToken.mockRejectedValueOnce(new Error("database offline"));
		const context = createExecutionContext();
		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P2U.png?size=large"),
			env,
			context,
			mocks,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await response.arrayBuffer();
		await waitOnExecutionContext(context);
		expect(await env.BADGE_CACHE.get(tokenCacheKey("P2U"))).toBeNull();
	});
});

describe("CORS", () => {
	it("allows callers to send optional badge hint headers", async () => {
		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P0Y.png", {
				method: "OPTIONS",
			}),
			env,
			createExecutionContext(),
			dependencies("unused-token"),
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
			"X-ClashKing-Badge-Token",
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});
