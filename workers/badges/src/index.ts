const RESPONSE_CACHE_SECONDS = 86400;
const TAG_TOKEN_TTL_SECONDS = 86400;
const NULL_TOKEN_TTL_SECONDS = 300;
const MISSING_RESPONSE_CACHE_SECONDS = 3600;
const ASSET_CACHE_VERSION = "v1";
const MAX_BADGE_TOKEN_LENGTH = 512;
const BADGE_TOKEN_HEADER = "X-ClashKing-Badge-Token";
export const AVIF_QUALITY = 45;

const BADGE_SIZES = {
	small: { outputPixels: 70, sourcePixels: 70 },
	medium: { outputPixels: 200, sourcePixels: 200 },
	large: { outputPixels: 512, sourcePixels: 512 },
	"64": { outputPixels: 64, sourcePixels: 70 },
	"128": { outputPixels: 128, sourcePixels: 200 },
	"256": { outputPixels: 256, sourcePixels: 512 },
	"512": { outputPixels: 512, sourcePixels: 512 },
} as const;

type BadgeSize = keyof typeof BADGE_SIZES;
type BadgeFormat = "png" | "avif";
type BadgeRecipe = (typeof BADGE_SIZES)[BadgeSize];

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

	return Object.hasOwn(BADGE_SIZES, value) ? (value as BadgeSize) : null;
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
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeTokenResolution> {
	const key = tokenCacheKey(clanTag);
	let cached: string | null = null;

	try {
		cached = await env.BADGE_CACHE.get(key);
		if (cached && cached !== "null") {
			return { token: cached, responseCacheSeconds: RESPONSE_CACHE_SECONDS };
		}
	} catch (error) {
		logCacheError("badge_token_cache_read_error", key, error);
	}

	if (cached === "null") {
		const hintedToken = readBadgeHint(request);
		if (hintedToken) {
			storeToken(env, ctx, key, hintedToken);
			return {
				token: hintedToken,
				responseCacheSeconds: RESPONSE_CACHE_SECONDS,
			};
		}

		return { token: "null", responseCacheSeconds: MISSING_RESPONSE_CACHE_SECONDS };
	}

	try {
		const token = await dependencies.queryBadgeToken(clanTag, env);
		if (token !== "null") {
			storeToken(env, ctx, key, token);
			return { token, responseCacheSeconds: RESPONSE_CACHE_SECONDS };
		}

		const hintedToken = readBadgeHint(request);
		if (hintedToken) {
			storeToken(env, ctx, key, hintedToken);
			return {
				token: hintedToken,
				responseCacheSeconds: RESPONSE_CACHE_SECONDS,
			};
		}

		storeToken(env, ctx, key, "null");
		return { token: "null", responseCacheSeconds: MISSING_RESPONSE_CACHE_SECONDS };
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "badge_database_error",
				clanTag,
				error: error instanceof Error ? error.message : String(error),
			}),
		);

		const hintedToken = readBadgeHint(request);
		if (hintedToken) {
			storeToken(env, ctx, key, hintedToken);
			return {
				token: hintedToken,
				responseCacheSeconds: RESPONSE_CACHE_SECONDS,
			};
		}

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

	const upstream = await dependencies.fetchBadge(token, pixels);
	if (!upstream.ok || !upstream.body) {
		return null;
	}

	const [responseStream, cacheStream] = upstream.body.tee();
	storeAsset(env, ctx, "png", pixels, token, cacheStream);
	return { token, stream: responseStream };
}

async function loadSourcePng(
	token: string,
	pixels: number,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const asset = await loadSourcePngForToken(
		token,
		pixels,
		env,
		ctx,
		dependencies,
	);
	if (asset || token === "null") {
		return asset;
	}

	return loadSourcePngForToken("null", pixels, env, ctx, dependencies);
}

async function transformBadge(
	stream: ReadableStream,
	format: BadgeFormat,
	recipe: BadgeRecipe,
	env: Env,
): Promise<Response> {
	let transformer = env.IMAGES.input(stream);
	if (recipe.outputPixels !== recipe.sourcePixels) {
		transformer = transformer.transform({
			width: recipe.outputPixels,
			height: recipe.outputPixels,
			fit: "scale-down",
		});
	}

	return transformer
		.output(
			format === "avif"
				? { format: "image/avif", quality: AVIF_QUALITY }
				: { format: "image/png" },
		)
		.then((result) => result.response());
}

async function loadBadgeAsset(
	format: BadgeFormat,
	token: string,
	recipe: BadgeRecipe,
	env: Env,
	ctx: ExecutionContext,
	dependencies: BadgeDependencies,
): Promise<BadgeAsset | null> {
	const cached = await readAsset(env, format, recipe.outputPixels, token);
	if (cached) {
		return { token, stream: cached };
	}

	const source = await loadSourcePng(
		token,
		recipe.sourcePixels,
		env,
		ctx,
		dependencies,
	);
	if (!source) {
		return null;
	}

	if (source.token !== token) {
		const fallbackCached = await readAsset(
			env,
			format,
			recipe.outputPixels,
			source.token,
		);
		if (fallbackCached) {
			return { token: source.token, stream: fallbackCached };
		}
	}

	if (
		format === "png" &&
		recipe.outputPixels === recipe.sourcePixels
	) {
		return source;
	}

	const transformed = await transformBadge(source.stream, format, recipe, env);
	if (!transformed.ok || !transformed.body) {
		return null;
	}

	const [responseStream, cacheStream] = transformed.body.tee();
	storeAsset(
		env,
		ctx,
		format,
		recipe.outputPixels,
		source.token,
		cacheStream,
	);
	return { token: source.token, stream: responseStream };
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": BADGE_TOKEN_HEADER,
} as const;

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
	stream: ReadableStream,
	format: BadgeFormat,
	cacheSeconds: number,
): Response {
	const headers = new Headers({
		...CORS_HEADERS,
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
			'Invalid size. Use "small", "medium", "large", 64, 128, 256, or 512.',
			400,
		);
	}

	const resolution = await resolveBadgeToken(
		request,
		parsed.clanTag,
		env,
		ctx,
		dependencies,
	);

	let asset: BadgeAsset | null;
	try {
		asset = await loadBadgeAsset(
			parsed.format,
			resolution.token,
			BADGE_SIZES[size],
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

	return imageResponse(
		asset.stream,
		parsed.format,
		resolution.responseCacheSeconds,
	);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleBadgeRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
