const RESPONSE_CACHE_SECONDS = 518400; // 6 days fresh in Cloudflare Tiered Cache
const RESPONSE_SWR_SECONDS = 86400; // 1 day background refresh (stale-while-revalidate)
const RESPONSE_SIE_SECONDS = 2592000; // 30 days error fallback (stale-if-error)
const ASSET_KV_EDGE_CACHE_TTL_SECONDS = 2592000; // 30 days KV PoP cache for immutable badge assets
const ASSET_CACHE_VERSION = "v1";
const MAX_BADGE_TOKEN_LENGTH = 512;
const BADGE_TOKEN_HEADER = "X-ClashKing-Badge-Token";
export const AVIF_QUALITY = 45;

// Supercell natively serves 70px (small), 200px (medium), and 512px (large) PNGs.
// PNGs are never transformed; AVIFs encode those exact three native sizes with no resize step.
const CANONICAL_BADGE_PIXELS = {
	small: 70,
	medium: 200,
	large: 512,
} as const;

export type BadgeSize = keyof typeof CANONICAL_BADGE_PIXELS;

// Legacy numeric sizes remain accepted during migration and map to the three canonical sizes.
const BADGE_SIZE_ALIASES: Readonly<Record<string, BadgeSize>> = {
	small: "small",
	medium: "medium",
	large: "large",
	"64": "small",
	"128": "medium",
	"256": "medium",
	"512": "large",
};

type BadgeFormat = "png" | "avif";

type ParsedBadgePath = {
	clanTag: string;
	format: BadgeFormat;
};

type BadgeTokenResolution = {
	token: string;
	cacheable: boolean;
};

type BadgeAsset = {
	token: string;
	stream: ReadableStream;
};

export type BadgeDependencies = {
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

	let format: BadgeFormat;
	if (/\.avif$/i.test(value)) {
		format = "avif";
		value = value.slice(0, -5);
	} else if (/\.png$/i.test(value)) {
		format = "png";
		value = value.slice(0, -4);
	} else {
		return null;
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

	return Object.hasOwn(BADGE_SIZE_ALIASES, value)
		? BADGE_SIZE_ALIASES[value]!
		: null;
}

export function badgePixelsForSize(size: BadgeSize): number {
	return CANONICAL_BADGE_PIXELS[size];
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

function isValidBadgeToken(token: string): boolean {
	return (
		token !== "null" &&
		token.length <= MAX_BADGE_TOKEN_LENGTH &&
		/^[A-Za-z0-9_-]+$/.test(token)
	);
}

function readBadgeHint(request: Request): string | null {
	const token = request.headers.get(BADGE_TOKEN_HEADER);
	return token && isValidBadgeToken(token) ? token : null;
}

async function resolveBadgeToken(
	request: Request,
	clanTag: string,
	env: Env,
	dependencies: BadgeDependencies,
): Promise<BadgeTokenResolution> {
	// A valid caller-supplied token skips Postgres completely; the public URL
	// response is cached by Cloudflare's Tiered Cache.
	const hintedToken = readBadgeHint(request);
	if (hintedToken) {
		return { token: hintedToken, cacheable: true };
	}

	try {
		const token = await dependencies.queryBadgeToken(clanTag, env);
		// Missing clan tags ("null") use the same 6d + 1d SWR tiered cache as known tags.
		return { token, cacheable: true };
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "badge_database_error",
				clanTag,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		// Never cache a transient database error as a default shield.
		return { token: "null", cacheable: false };
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
		return await env.BADGE_CACHE.get(key, {
			type: "stream",
			cacheTtl: ASSET_KV_EDGE_CACHE_TTL_SECONDS,
		});
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

async function fetchAndStoreSourcePng(
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const upstream = await dependencies.fetchBadge(token, pixels);
	if (!upstream.ok || !upstream.body) {
		return null;
	}

	const [responseStream, cacheStream] = upstream.body.tee();
	storeAsset(env, ctx, "png", pixels, token, cacheStream);
	return { token, stream: responseStream };
}

async function loadSourcePngForToken(
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

	return fetchAndStoreSourcePng(token, pixels, env, ctx, dependencies);
}

async function encodeAvifBadge(
	stream: ReadableStream,
	env: Env,
): Promise<Response> {
	return env.IMAGES.input(stream)
		.output({ format: "image/avif", quality: AVIF_QUALITY })
		.then((result) => result.response());
}

async function loadBadgeAsset(
	format: BadgeFormat,
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const cached = await readAsset(env, format, pixels, token);
	if (cached) {
		return { token, stream: cached };
	}

	// PNGs are never transformed: on a miss, go straight to Supercell without a
	// duplicate KV read for the same key.
	if (format === "png") {
		const fetched = await fetchAndStoreSourcePng(
			token,
			pixels,
			env,
			ctx,
			dependencies,
		);
		if (fetched || token === "null") {
			return fetched;
		}
		return loadSourcePngForToken("null", pixels, env, ctx, dependencies);
	}

	// AVIF missed KV: pull the native source PNG from KV (or Supercell), then encode.
	let source = await loadSourcePngForToken(
		token,
		pixels,
		env,
		ctx,
		dependencies,
	);
	if (!source && token !== "null") {
		const fallbackAvif = await readAsset(env, "avif", pixels, "null");
		if (fallbackAvif) {
			return { token: "null", stream: fallbackAvif };
		}
		source = await loadSourcePngForToken(
			"null",
			pixels,
			env,
			ctx,
			dependencies,
		);
	}
	if (!source) {
		return null;
	}

	const transformed = await encodeAvifBadge(source.stream, env);
	if (!transformed.ok || !transformed.body) {
		return null;
	}

	const [responseStream, cacheStream] = transformed.body.tee();
	storeAsset(env, ctx, "avif", pixels, source.token, cacheStream);
	return { token: source.token, stream: responseStream };
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": BADGE_TOKEN_HEADER,
} as const;

function buildETag(token: string, format: BadgeFormat, pixels: number): string {
	const formatVersion =
		format === "avif" ? `${format}-q${AVIF_QUALITY}` : format;
	return `"${ASSET_CACHE_VERSION}-${token}-${formatVersion}-${pixels}"`;
}

function matchesIfNoneMatch(header: string | null, etag: string): boolean {
	if (!header) {
		return false;
	}
	return header
		.split(",")
		.map((part) => part.trim().replace(/^W\//, ""))
		.some((candidate) => candidate === "*" || candidate === etag);
}

function cacheControlHeader(cacheable: boolean): string {
	return cacheable
		? `public, max-age=${RESPONSE_CACHE_SECONDS}, s-maxage=${RESPONSE_CACHE_SECONDS}, stale-while-revalidate=${RESPONSE_SWR_SECONDS}, stale-if-error=${RESPONSE_SIE_SECONDS}`
		: "no-store";
}

function textResponse(
	body: string | null,
	status: number,
	extraHeaders = {},
): Response {
	return new Response(body, {
		status,
		headers: {
			...CORS_HEADERS,
			"Cache-Control": "no-store",
			...extraHeaders,
		},
	});
}

function imageResponse(
	stream: ReadableStream | null,
	format: BadgeFormat,
	cacheable: boolean,
	etag: string,
	status: 200 | 304 = 200,
): Response {
	const headers = new Headers({
		...CORS_HEADERS,
		"Cache-Control": cacheControlHeader(cacheable),
		"X-Content-Type-Options": "nosniff",
	});

	if (cacheable) {
		headers.set("ETag", etag);
	}
	if (status === 200) {
		headers.set("Content-Type", format === "avif" ? "image/avif" : "image/png");
	}

	return new Response(status === 304 ? null : stream, { status, headers });
}

const DEFAULT_DEPENDENCIES = {
	fetchBadge,
	queryBadgeToken,
} satisfies BadgeDependencies;

export async function handleBadgeRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies = DEFAULT_DEPENDENCIES,
): Promise<Response> {
	if (request.method === "OPTIONS") {
		return textResponse(null, 204, { "Access-Control-Max-Age": "86400" });
	}

	if (request.method !== "GET") {
		return textResponse("Method not allowed", 405, { Allow: "GET, OPTIONS" });
	}

	const url = new URL(request.url);
	const parsed = parseBadgePath(url.pathname);
	if (!parsed) {
		return textResponse("Invalid badge path. Use /TAG.png or /TAG.avif.", 400);
	}

	const queryKeys = [...url.searchParams.keys()];
	const sizeValues = url.searchParams.getAll("size");
	if (queryKeys.some((key) => key !== "size") || sizeValues.length > 1) {
		return textResponse("Only one size query parameter is supported.", 400);
	}

	const size = parseSize(sizeValues[0] ?? null);
	if (!size) {
		return textResponse(
			'Invalid size. Use "small", "medium", or "large".',
			400,
		);
	}

	const pixels = badgePixelsForSize(size);
	const resolution = await resolveBadgeToken(
		request,
		parsed.clanTag,
		env,
		dependencies,
	);

	// Short-circuit matching revalidations before reading image bytes from KV.
	const expectedETag = buildETag(resolution.token, parsed.format, pixels);
	if (
		resolution.cacheable &&
		matchesIfNoneMatch(request.headers.get("If-None-Match"), expectedETag)
	) {
		return imageResponse(null, parsed.format, true, expectedETag, 304);
	}

	let asset: BadgeAsset | null;
	try {
		asset = await loadBadgeAsset(
			parsed.format,
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
		return textResponse("Badge unavailable", 502);
	}

	if (!asset) {
		return textResponse("Badge unavailable", 502);
	}

	// If a real token failed upstream at Supercell and fell back to "null",
	// do not cache that empty shield for 6 days.
	const fellBackFromUpstreamError =
		asset.token === "null" && resolution.token !== "null";
	const cacheable = resolution.cacheable && !fellBackFromUpstreamError;
	const etag = buildETag(asset.token, parsed.format, pixels);

	return imageResponse(asset.stream, parsed.format, cacheable, etag, 200);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleBadgeRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
