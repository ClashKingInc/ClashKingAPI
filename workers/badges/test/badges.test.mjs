import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	AVIF_QUALITY,
	assetCacheKey,
	badgePixelsForSize,
	handleBadgeRequest,
	parseBadgePath,
	parseSize,
} from "../src/index.ts";

function streamFromText(text) {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

async function readStreamText(stream) {
	return new Response(stream).text();
}

function createHarness() {
	const kvStore = new Map();
	const kvGets = [];
	const kvPuts = [];
	const imageCalls = [];
	const pending = [];

	const env = {
		HYPERDRIVE: { connectionString: "postgres://unused" },
		BADGE_CACHE: {
			async get(key, options) {
				kvGets.push({ key, options });
				const value = kvStore.get(key);
				return value === undefined ? null : streamFromText(value);
			},
			async put(key, value, options) {
				const text =
					typeof value === "string"
						? value
						: value instanceof ReadableStream
							? await readStreamText(value)
							: new TextDecoder().decode(value);
				kvPuts.push({ key, text, options });
				kvStore.set(key, text);
			},
		},
		IMAGES: {
			input(stream) {
				const call = { transforms: [], output: null };
				imageCalls.push(call);
				return {
					transform(options) {
						call.transforms.push(options);
						return this;
					},
					async output(options) {
						call.output = options;
						const sourceText = await readStreamText(stream);
						return {
							response() {
								return new Response(`avif(${sourceText})`, {
									status: 200,
									headers: { "Content-Type": "image/avif" },
								});
							},
						};
					},
				};
			},
		},
	};

	const ctx = {
		waitUntil(promise) {
			pending.push(promise);
		},
		passThroughOnException() {},
	};

	async function flush() {
		await Promise.all(pending.splice(0));
	}

	return { env, ctx, kvStore, kvGets, kvPuts, imageCalls, flush };
}

const EXPECTED_CACHE_CONTROL =
	"public, max-age=518400, s-maxage=518400, stale-while-revalidate=86400, stale-if-error=2592000";

describe("parseSize and parseBadgePath", () => {
	it("maps named sizes and legacy numeric aliases to canonical sizes", () => {
		assert.equal(parseSize(null), "small");
		assert.equal(parseSize(""), "small");
		assert.equal(parseSize("small"), "small");
		assert.equal(parseSize("64"), "small");
		assert.equal(parseSize("medium"), "medium");
		assert.equal(parseSize("128"), "medium");
		assert.equal(parseSize("256"), "medium");
		assert.equal(parseSize("large"), "large");
		assert.equal(parseSize("512"), "large");
		assert.equal(parseSize("200"), null);
		assert.equal(parseSize("huge"), null);

		assert.equal(badgePixelsForSize("small"), 70);
		assert.equal(badgePixelsForSize("medium"), 200);
		assert.equal(badgePixelsForSize("large"), 512);
	});

	it("validates badge paths", () => {
		assert.deepEqual(parseBadgePath("/p0y.png"), {
			clanTag: "P0Y",
			format: "png",
		});
		assert.deepEqual(parseBadgePath("/%23P0Y.avif"), {
			clanTag: "P0Y",
			format: "avif",
		});
		assert.equal(parseBadgePath("/P0Y.webp"), null);
		assert.equal(parseBadgePath("/INVALID!.png"), null);
	});
});

describe("handleBadgeRequest", () => {
	it("serves PNG with 6d+1d SWR cache, 30d KV cacheTtl, single KV read on miss, and 0 image transforms", async () => {
		const h = createHarness();
		let dbCalls = 0;
		const fetched = [];

		const deps = {
			async queryBadgeToken(tag) {
				dbCalls += 1;
				assert.equal(tag, "P0Y");
				return "tok_abc";
			},
			async fetchBadge(token, pixels) {
				fetched.push({ token, pixels });
				return new Response(`png:${token}:${pixels}`, { status: 200 });
			},
		};

		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P0Y.png?size=medium"),
			h.env,
			h.ctx,
			deps,
		);
		const body = await response.text();
		await h.flush();

		assert.equal(response.status, 200);
		assert.equal(body, "png:tok_abc:200");
		assert.equal(response.headers.get("Cache-Control"), EXPECTED_CACHE_CONTROL);
		assert.equal(response.headers.get("Content-Type"), "image/png");
		assert.equal(response.headers.get("ETag"), '"v1-tok_abc-png-200"');
		assert.equal(dbCalls, 1);
		assert.deepEqual(fetched, [{ token: "tok_abc", pixels: 200 }]);
		assert.equal(h.imageCalls.length, 0);

		// Exactly one KV read (no duplicate read on miss, no clan-token KV read).
		assert.equal(h.kvGets.length, 1);
		assert.equal(h.kvGets[0].key, assetCacheKey("png", 200, "tok_abc"));
		assert.deepEqual(h.kvGets[0].options, { type: "stream", cacheTtl: 2592000 });

		// Permanent KV write (no expirationTtl).
		assert.equal(h.kvPuts.length, 1);
		assert.equal(h.kvPuts[0].key, assetCacheKey("png", 200, "tok_abc"));
		assert.equal(h.kvPuts[0].options, undefined);

		// Legacy size=256 maps to 200px and reuses the KV asset without hitting Supercell.
		const aliasResponse = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/P0Y.png?size=256"),
			h.env,
			h.ctx,
			deps,
		);
		assert.equal(aliasResponse.status, 200);
		assert.equal(await aliasResponse.text(), "png:tok_abc:200");
		assert.equal(dbCalls, 2);
		assert.equal(fetched.length, 1);
	});

	it("skips DB when valid X-ClashKing-Badge-Token is supplied and short-circuits 304 before KV", async () => {
		const h = createHarness();
		let dbCalls = 0;

		const deps = {
			async queryBadgeToken() {
				dbCalls += 1;
				return "db_tok";
			},
			async fetchBadge(token, pixels) {
				return new Response(`png:${token}:${pixels}`, { status: 200 });
			},
		};

		const first = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/2PP.avif?size=large", {
				headers: { "X-ClashKing-Badge-Token": "hint_tok" },
			}),
			h.env,
			h.ctx,
			deps,
		);
		assert.equal(first.status, 200);
		assert.equal(await first.text(), "avif(png:hint_tok:512)");
		assert.equal(dbCalls, 0);
		assert.equal(
			first.headers.get("ETag"),
			`"v1-hint_tok-avif-q${AVIF_QUALITY}-512"`,
		);
		assert.equal(first.headers.get("Cache-Control"), EXPECTED_CACHE_CONTROL);
		assert.equal(h.imageCalls.length, 1);
		assert.deepEqual(h.imageCalls[0].transforms, []);
		assert.deepEqual(h.imageCalls[0].output, {
			format: "image/avif",
			quality: AVIF_QUALITY,
		});
		await h.flush();

		const kvReadsBefore304 = h.kvGets.length;
		const revalidated = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/2PP.avif?size=large", {
				headers: {
					"X-ClashKing-Badge-Token": "hint_tok",
					"If-None-Match": `"v1-hint_tok-avif-q${AVIF_QUALITY}-512"`,
				},
			}),
			h.env,
			h.ctx,
			deps,
		);
		assert.equal(revalidated.status, 304);
		assert.equal(revalidated.headers.get("Cache-Control"), EXPECTED_CACHE_CONTROL);
		assert.equal(h.kvGets.length, kvReadsBefore304);
		assert.equal(dbCalls, 0);
	});

	it("caches missing DB clans with the same 6d+1d SWR tiered cache", async () => {
		const h = createHarness();
		const deps = {
			async queryBadgeToken() {
				return "null";
			},
			async fetchBadge(token, pixels) {
				assert.equal(token, "null");
				return new Response(`fallback:${pixels}`, { status: 200 });
			},
		};

		const response = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/999.png?size=small"),
			h.env,
			h.ctx,
			deps,
		);
		assert.equal(response.status, 200);
		assert.equal(await response.text(), "fallback:70");
		assert.equal(response.headers.get("Cache-Control"), EXPECTED_CACHE_CONTROL);
		assert.equal(response.headers.get("ETag"), '"v1-null-png-70"');
		await h.flush();
	});

	it("returns no-store on transient DB errors and upstream Supercell fallback errors", async () => {
		const h = createHarness();
		const dbErrorDeps = {
			async queryBadgeToken() {
				throw new Error("db down");
			},
			async fetchBadge(token, pixels) {
				return new Response(`fallback:${token}:${pixels}`, { status: 200 });
			},
		};

		const dbErrRes = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/PYL.png?size=small"),
			h.env,
			h.ctx,
			dbErrorDeps,
		);
		assert.equal(dbErrRes.status, 200);
		assert.equal(dbErrRes.headers.get("Cache-Control"), "no-store");
		assert.equal(dbErrRes.headers.get("ETag"), null);
		await h.flush();

		const upstreamErrDeps = {
			async queryBadgeToken() {
				return "real_tok";
			},
			async fetchBadge(token, pixels) {
				if (token === "real_tok") {
					return new Response("upstream error", { status: 500 });
				}
				return new Response(`fallback:${pixels}`, { status: 200 });
			},
		};

		const upstreamErrRes = await handleBadgeRequest(
			new Request("https://badges.clashk.ing/QGR.png?size=medium"),
			h.env,
			h.ctx,
			upstreamErrDeps,
		);
		assert.equal(upstreamErrRes.status, 200);
		assert.equal(upstreamErrRes.headers.get("Cache-Control"), "no-store");
		assert.equal(upstreamErrRes.headers.get("ETag"), null);
		await h.flush();
	});
});
