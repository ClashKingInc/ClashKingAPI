const RESPONSE_CACHE_SECONDS = 86400;
const TAG_TOKEN_TTL_SECONDS = 86400;
const NULL_TOKEN_TTL_SECONDS = 300;
const ASSET_CACHE_VERSION = "v1";
export const AVIF_QUALITY = 45;

const BADGE_SIZES = {
	small: 70,
	medium: 200,
	large: 512,
} as const;

type BadgeSize = keyof typeof BADGE_SIZES;
type BadgeFormat = "png" | "avif";

type ParsedBadgePath = {
	clanTag: string;
	format: BadgeFormat;
};

type BadgeTokenResolution = {
	token: string;
	responseCacheSeconds: number;
};

type BadgeAsset = {
	token: string;
	stream: ReadableStream;
};

export type BadgeDependencies = {
	cache: Cache;
	fetchBadge: (token: string, pixels: number) => Promise<Response>;
	queryBadgeToken: (clanTag: string, env: Env) => Promise<string>;
};

export function parseBadgePath(pathname: string): ParsedBadgePath | null {
	let value: string;

	try {
		value = decodeURIComponent(pathname.slice(1));
	} catch {
		return null;
	}

	let format: BadgeFormat = "png";
	if (/\.avif$/i.test(value)) {
		format = "avif";
		value = value.slice(0, -5);
	} else if (/\.png$/i.test(value)) {
		value = value.slice(0, -4);
	}

	value = value.replace(/^#/, "").toUpperCase();

	if (!value || !/^[0289PYLQGRJCUV]+$/.test(value)) {
		return null;
	}

	return { clanTag: value, format };
}

export function parseSize(value: string | null): BadgeSize | null {
	if (value === null || value === "") {
		return "small";
	}

	if (value === "small" || value === "medium" || value === "large") {
		return value;
	}

	return null;
}

export function assetCacheKey(
	format: BadgeFormat,
	pixels: number,
	token: string,
): string {
	const formatVersion =
		format === "avif" ? `${format}:q${AVIF_QUALITY}` : format;
	return `asset:${ASSET_CACHE_VERSION}:${formatVersion}:${pixels}:${token}`;
}

export function tokenCacheKey(clanTag: string): string {
	return `clan-token:${ASSET_CACHE_VERSION}:${clanTag}`;
}

function responseCacheKey(
	url: URL,
	clanTag: string,
	size: BadgeSize,
	format: BadgeFormat,
): Request {
	const cacheVersion =
		format === "avif" ? `q${AVIF_QUALITY}` : ASSET_CACHE_VERSION;
	return new Request(
		`${url.origin}/${clanTag}.${format}?size=${size}&v=${cacheVersion}`,
		{ method: "GET" },
	);
}

function badgeUrl(token: string, pixels: number): string {
	return `https://api-assets.clashofclans.com/badges/${pixels}/${encodeURIComponent(token)}.png`;
}

async function fetchBadge(token: string, pixels: number): Promise<Response> {
	return fetch(badgeUrl(token, pixels));
}

async function queryBadgeToken(clanTag: string, env: Env): Promise<string> {
	const { Client } = await import("pg");
	const client = new Client({
		connectionString: env.HYPERDRIVE.connectionString,
	});

	try {
		await client.connect();
		const result = await client.query<{ badge_token: string | null }>(
			`SELECT badge_token FROM basic_clan WHERE tag = $1 LIMIT 1`,
			[`#${clanTag}`],
		);
		return result.rows[0]?.badge_token || "null";
	} finally {
		await client.end().catch(() => undefined);
	}
}

function logCacheError(event: string, key: string, error: unknown): void {
	console.error(
		JSON.stringify({
			event,
			key,
			error: error instanceof Error ? error.message : String(error),
		}),
	);
}

function storeToken(
	env: Env,
	ctx: ExecutionContext,
	key: string,
	token: string,
): void {
	const expirationTtl =
		token === "null" ? NULL_TOKEN_TTL_SECONDS : TAG_TOKEN_TTL_SECONDS;
	ctx.waitUntil(
		env.BADGE_CACHE.put(key, token, { expirationTtl }).catch((error) => {
			logCacheError("badge_token_cache_write_error", key, error);
		}),
	);
}

async function resolveBadgeToken(
	clanTag: string,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeTokenResolution> {
	const key = tokenCacheKey(clanTag);

	try {
		const cached = await env.BADGE_CACHE.get(key);
		if (cached) {
			return {
				token: cached,
				responseCacheSeconds:
					cached === "null"
						? NULL_TOKEN_TTL_SECONDS
						: RESPONSE_CACHE_SECONDS,
			};
		}
	} catch (error) {
		logCacheError("badge_token_cache_read_error", key, error);
	}

	try {
		const token = await dependencies.queryBadgeToken(clanTag, env);
		storeToken(env, ctx, key, token);
		return {
			token,
			responseCacheSeconds:
				token === "null" ? NULL_TOKEN_TTL_SECONDS : RESPONSE_CACHE_SECONDS,
		};
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "badge_database_error",
				clanTag,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return { token: "null", responseCacheSeconds: 0 };
	}
}

async function readAsset(
	env: Env,
	format: BadgeFormat,
	pixels: number,
	token: string,
): Promise<ReadableStream | null> {
	const key = assetCacheKey(format, pixels, token);
	try {
		return await env.BADGE_CACHE.get(key, "stream");
	} catch (error) {
		logCacheError("badge_asset_cache_read_error", key, error);
		return null;
	}
}

function storeAsset(
	env: Env,
	ctx: ExecutionContext,
	format: BadgeFormat,
	pixels: number,
	token: string,
	stream: ReadableStream,
): void {
	const key = assetCacheKey(format, pixels, token);
	ctx.waitUntil(
		env.BADGE_CACHE.put(key, stream).catch((error) => {
			logCacheError("badge_asset_cache_write_error", key, error);
		}),
	);
}

async function loadPngForToken(
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const cached = await readAsset(env, "png", pixels, token);
	if (cached) {
		return { token, stream: cached };
	}

	const upstream = await dependencies.fetchBadge(token, pixels);
	if (!upstream.ok || !upstream.body) {
		return null;
	}

	const [responseStream, cacheStream] = upstream.body.tee();
	storeAsset(env, ctx, "png", pixels, token, cacheStream);
	return { token, stream: responseStream };
}

async function loadPng(
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const asset = await loadPngForToken(
		token,
		pixels,
		env,
		ctx,
		dependencies,
	);
	if (asset || token === "null") {
		return asset;
	}

	return loadPngForToken("null", pixels, env, ctx, dependencies);
}

async function loadAvif(
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const cached = await readAsset(env, "avif", pixels, token);
	if (cached) {
		return { token, stream: cached };
	}

	const png = await loadPng(token, pixels, env, ctx, dependencies);
	if (!png) {
		return null;
	}

	if (png.token !== token) {
		const fallbackCached = await readAsset(env, "avif", pixels, png.token);
		if (fallbackCached) {
			return { token: png.token, stream: fallbackCached };
		}
	}

	const transformed = await env.IMAGES.input(png.stream)
		.output({ format: "image/avif", quality: AVIF_QUALITY })
		.then((result) => result.response());
	if (!transformed.ok || !transformed.body) {
		return null;
	}

	const [responseStream, cacheStream] = transformed.body.tee();
	storeAsset(env, ctx, "avif", pixels, png.token, cacheStream);
	return { token: png.token, stream: responseStream };
}

function imageResponse(
	stream: ReadableStream,
	format: BadgeFormat,
	cacheSeconds: number,
): Response {
	const headers = new Headers({
		"Content-Type": format === "avif" ? "image/avif" : "image/png",
		"X-Content-Type-Options": "nosniff",
	});

	if (cacheSeconds > 0) {
		headers.set(
			"Cache-Control",
			`public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
		);
	} else {
		headers.set("Cache-Control", "no-store");
	}

	return new Response(stream, { status: 200, headers });
}

const DEFAULT_DEPENDENCIES = {
	get cache(): Cache {
		return caches.default;
	},
	fetchBadge,
	queryBadgeToken,
} satisfies BadgeDependencies;

export async function handleBadgeRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies = DEFAULT_DEPENDENCIES,
): Promise<Response> {
	if (request.method !== "GET") {
		return new Response("Method not allowed", {
			status: 405,
			headers: { Allow: "GET" },
		});
	}

	const url = new URL(request.url);
	const parsed = parseBadgePath(url.pathname);
	const size = parseSize(url.searchParams.get("size"));

	if (!parsed) {
		return new Response("Invalid clan tag", { status: 400 });
	}

	if (!size) {
		return new Response(
			'Invalid size. Use "small", "medium", or "large".',
			{ status: 400 },
		);
	}

	const cacheKey = responseCacheKey(
		url,
		parsed.clanTag,
		size,
		parsed.format,
	);
	const cached = await dependencies.cache.match(cacheKey);
	if (cached) {
		return cached;
	}

	const resolution = await resolveBadgeToken(
		parsed.clanTag,
		env,
		ctx,
		dependencies,
	);
	const pixels = BADGE_SIZES[size];

	let asset: BadgeAsset | null;
	try {
		asset =
			parsed.format === "avif"
				? await loadAvif(
						resolution.token,
						pixels,
						env,
						ctx,
						dependencies,
					)
				: await loadPng(
						resolution.token,
						pixels,
						env,
						ctx,
						dependencies,
					);
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "badge_asset_error",
				clanTag: parsed.clanTag,
				format: parsed.format,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return new Response("Badge unavailable", { status: 502 });
	}

	if (!asset) {
		return new Response("Badge unavailable", { status: 502 });
	}

	const response = imageResponse(
		asset.stream,
		parsed.format,
		resolution.responseCacheSeconds,
	);
	if (resolution.responseCacheSeconds > 0) {
		ctx.waitUntil(
			dependencies.cache.put(cacheKey, response.clone()).catch((error) => {
				logCacheError("badge_response_cache_write_error", cacheKey.url, error);
			}),
		);
	}

	return response;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleBadgeRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
