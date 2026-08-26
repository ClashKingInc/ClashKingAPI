import { Client } from "pg";

const CACHE_SECONDS = 3600;

const BADGE_SIZES = {
	small: 70,
	medium: 200,
	large: 512,
} as const;

type BadgeSize = keyof typeof BADGE_SIZES;

function parseClanTag(pathname: string): string | null {
	let value: string;

	try {
		value = decodeURIComponent(pathname.slice(1));
	} catch {
		return null;
	}

	value = value.replace(/\.png$/i, "").replace(/^#/, "").toUpperCase();

	if (!value || !/^[0289PYLQGRJCUV]+$/.test(value)) {
		return null;
	}

	return value;
}

function parseSize(value: string | null): BadgeSize | null {
	if (value === null || value === "") {
		return "small";
	}

	if (value === "small" || value === "medium" || value === "large") {
		return value;
	}

	return null;
}

function badgeUrl(token: string, pixels: number): string {
	return `https://api-assets.clashofclans.com/badges/${pixels}/${encodeURIComponent(token)}.png`;
}

async function fetchBadge(token: string, pixels: number): Promise<Response> {
	return fetch(badgeUrl(token, pixels));
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method !== "GET") {
			return new Response("Method not allowed", {
				status: 405,
				headers: { Allow: "GET" },
			});
		}

		const url = new URL(request.url);
		const clanTag = parseClanTag(url.pathname);
		const size = parseSize(url.searchParams.get("size"));

		if (!clanTag) {
			return new Response("Invalid clan tag", { status: 400 });
		}

		if (!size) {
			return new Response(
				'Invalid size. Use "small", "medium", or "large".',
				{ status: 400 },
			);
		}

		const cacheKey = new Request(
			`${url.origin}/${clanTag}?size=${size}`,
			{ method: "GET" },
		);
		const cache = caches.default;
		const cached = await cache.match(cacheKey);

		if (cached) {
			return cached;
		}

		let badgeToken = "null";
		const client = new Client({
			connectionString: env.HYPERDRIVE.connectionString,
		});

		try {
			await client.connect();
			const result = await client.query<{ badge_token: string | null }>(
				`SELECT badge_token FROM basic_clan WHERE tag = $1 LIMIT 1`,
				[`#${clanTag}`],
			);
			badgeToken = result.rows[0]?.badge_token || "null";
		} catch (error) {
			console.error(
				JSON.stringify({
					event: "badge_database_error",
					clanTag,
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			await client.end().catch(() => undefined);
		}

		const pixels = BADGE_SIZES[size];
		let upstream = await fetchBadge(badgeToken, pixels);

		if (!upstream.ok && badgeToken !== "null") {
			upstream = await fetchBadge("null", pixels);
		}

		if (!upstream.ok || !upstream.body) {
			return new Response("Badge unavailable", { status: 502 });
		}

		const headers = new Headers(upstream.headers);
		headers.delete("Age");
		headers.set("Content-Type", "image/png");
		headers.set(
			"Cache-Control",
			`public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
		);
		headers.set("X-Content-Type-Options", "nosniff");

		const response = new Response(upstream.body, {
			status: 200,
			headers,
		});

		ctx.waitUntil(cache.put(cacheKey, response.clone()));
		return response;
	},
} satisfies ExportedHandler<Env>;
