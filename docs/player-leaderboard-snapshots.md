# Player leaderboard snapshot rollout

The Town Hall and league endpoints keep their existing response shape and 500-row maximum. Instead of sorting `basic_player` per request, they read DevKit migration 020's `player_townhall_leaderboards` and `player_league_leaderboards`. Tracking refreshes both every six hours, with an extra refresh after its guarded Monday trophy reset. Clan display data still comes from `basic_clan`.

Deploy in this order: DevKit migration 020, Tracking population, then this API. Both materialized views must report `ispopulated=true` in `pg_matviews` first. There is no fallback to a live sorting query if the migration/population is missing. No production changes are performed by this PR.

TH snapshots sort ranked league descending, trophies descending, then tag. Exact league snapshots sort trophies descending, then tag. Unknown and unranked leagues are excluded; zero-trophy ranked players remain eligible. The snapshots cover TH 7–18 and league IDs 105000001–105000036. Live Legend endpoints are unchanged.

Army-link normalization now accepts and preserves Warden mode, for example `h2m1p16e5_41`. This fixes the API's matching validation gap alongside Tracking's fix. Family matching still ignores mode; no new response fields or database mode columns are introduced.

Validation: full unit suite, workspace typecheck/lint, and `public-data.test.ts` against the schema-owned disposable Timescale harness. The PostgreSQL test proves that a profile change does not alter the board until refresh, then does after refresh. Cloudflare guidance was followed by retaining the existing request-scoped SQL layer and parameterized values; no Worker bindings were added.
