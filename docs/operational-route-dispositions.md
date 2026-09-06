# Operational routes and Tracking reconciliation — September 4, 2026

This review uses freshly fetched API main `cf7371e4a32b4a37afd7c80ff83c72ef29b425e4` and Admin main `1346c43d3c6bf77bbe775991e1accde003b077e1`, not the saved rewrite as source authority. The accepted API's additional Capital Gold and uncommitted release work remain preserved separately. These are implementation dispositions and local tests, not claims about deployed auth or infrastructure.

## Original Admin runtime routes

The original `src/routes/api.$.ts` strips `/api` before `handleAdminApiRequest`. Source is [Admin main's dispatcher and readiness function](https://github.com/ClashKingInc/ClashKingAdminPanel/blob/1346c43d3c6bf77bbe775991e1accde003b077e1/src/server/adminApi.ts#L324), with the browser behavior in `src/lib/auth.tsx`.

| Original route | Actual original behavior | Current disposition |
| --- | --- | --- |
| `POST /api/auth/logout` | Requires Access, returns an empty 204, changes no server session/cookie/data. The browser's `finally` clears its local user and navigates to `/cdn-cgi/access/logout`, or reloads localhost. | Retire the no-op transport endpoint. The current Admin clears its local user and performs the same top-level same-host logout directly through `logoutAccess`. Existing tests cover production/staging hostnames and localhost without making a live request. |
| `GET /api/healthz` | Public no-store JSON `{status:"ok"}`; no database call. | Replaced by the Admin's static `/healthz` asset (`ok\n`). This is frontend liveness, not byte-for-byte endpoint compatibility. Static-asset tests and earlier local HTTP checks cover it. |
| `GET /api/readyz` | Public `SELECT 1` on the Admin server's own database connection, returning ready/ok or 503 not_ready/unavailable. | Retired with the separate Admin database/server. No fake database-readiness result is added to the static frontend. The API's `/v2/health` is also only liveness; actual database connectivity must be checked in release setup. |

These are runtime adaptations under the separate frontend Worker/no-compatibility direction. Current Admin has no same-origin API handler; an old API URL can hit SPA fallback when navigated to, which is not a functioning JSON API. Live Access cookies, cross-origin API admission, logout behavior at Cloudflare, and external uptime-monitor configuration still need separately authorized deployment checks.

## Tracking was a real missing reader, now corrected

The original chain was Admin browser → Access-protected Admin backend → bot-authenticated API `/v2/admin/tracking/summary` or `/timeseries` → SQL. Tracking writes observations; it does not serve these reads. Source: API [`register.go`](https://github.com/ClashKingInc/ClashKingAPI/blob/cf7371e4a32b4a37afd7c80ff83c72ef29b425e4/internal/routes/register.go#L123), `internal/routes/tracking_operations.go`, and `internal/models/v2/tracking_operations.go`; Admin `src/server/adminApi.ts` forwards with its server token and passes window/script/domain. The current Admin screen still uses summary and script/window chart requests.

The rewrite incorrectly forwarded those same URLs to the Tracking VPC service. It also admitted only Access users, omitted the domain filter, copied an obsolete frontend error-string type and required target progress on queue-only domains. These were not duplicate URLs that could be retired.

`workers/api/src/tracking-operations.ts` now reads the existing `tracking_process_stats` and `tracking_domain_stats` tables and computes the original health, rates, target-cycle deltas, ETA and chart buckets. `admin-operations.ts` delegates to it instead of calling Tracking. The dispatcher admits either the original configured bot bearer or a valid Admin Access identity for these two GETs only; no fabricated human principal or broader bot Admin access is introduced.

Preserved boundaries:

- Four windows: 15m/1h/6h/24h, with 15/60/300/900-second buckets and 60/60/72/96 maximum points per series. Empty window defaults to 1h; window case and whitespace are normalized.
- Script/domain are trimmed exact-match names with the original 100-character character restriction and validation messages. Queries remain parameterized, bounded to the chosen interval and limited to 20,000 rows each. A domain-filtered request omits process series.
- One prior domain bucket supplies target progress delta but is not returned. The current incomplete bucket is excluded. Latest observations are ordered by interval end and run ID; failed domains make their fresh process unhealthy. Staleness begins strictly after 120 seconds.
- `latest_error` is the original `{message,timestamp}` object or null. `targets` is null for queue-only domains. The invented optional `globalclans` shortcut is removed. Admin renders the error message as ordinary text and null-checks target progress using the existing layout.

The authoritative schema was checked at `clashking_schemas/database/timescale/001_initial_stats.sql:721–778` and `003_tracking_observability.sql`. Migration003 deliberately makes the three target fields nullable. The port treats those existing nulls as no target progress instead of copying Go's incompatible scan into non-null integers. No schema, runtime table or new collection endpoint was added.

Errors follow the Worker boundary: original invalid-query messages remain 400; unavailable, failed or timed-out SQL is `DatabaseFailure`/503. Original Go returned 503 for a missing store, while raw query errors reached its generic 500 handler. This difference is explicit, not claimed as exact error parity. Reads retain a ten-second deadline and never contact a provider.

Verification: 20 focused calculation/query/contract tests passed, and three tests against a fresh local Goose-migrated Timescale database passed. They exercise actual latest-row SQL, structured errors, null targets, process health, bucket alignment/lookback, domain filtering, empty results and zero provider calls. Full Worker TypeScript and touched-file lint passed. The root's separate auth tests prove admission ordering; neither set proves live Access or production DB reachability. The SQL suite is explicitly classified as retained.

## Non-v2 compatibility and public documentation

API main's `registerCompatibilityRoutes` calls the intentionally isolated `internal/routes/legacy/register.go`, then adds two more compatibility routes. These nine paths are retired under the explicit no-backward-compatibility direction; they are not recreated as forwarding aliases:

- `GET /player/:player_tag/warhits`
- `GET /player/:player_tag/join-leave`
- `GET /clan/:clan_tag/join-leave`
- `GET /war/:clan_tag/previous`
- `GET /war/:clan_tag/previous/:end_time`
- `GET /cwl/:clan_tag/group`
- `GET /cwl/:clan_tag/:season`
- `GET /global/counts`
- `GET /builderbaseleagues`

This disposition does not call legacy payloads identical to their v2 counterparts. Required active v2 operations are inventoried separately. Old external callers must change for the coordinated cutover; this review is not evidence that no such caller exists.

Public API documentation is a separate retained feature, not part of the retired compatibility module. `internal/swaggerdocs/swaggerdocs.go:50–87` serves `/`, `/docs`, `/docs/*`, three OpenAPI artifacts, and Swagger/Redoc UI or redirects. These routes are restored through the same Worker's generated public assets, with original feature navigation, no QUERY workaround and no expanded private Admin schema exposure. See [API documentation implementation](api-documentation.md) for the source mapping, public projection and generation/actual-Workerd tests; a local OpenAPI file alone was not sufficient.

## Scheduled work

Original API `main.go:153–198` starts one materialized-view loop immediately, then every five minutes with a four-minute per-run context. The Worker keeps the same two database refreshes (`api_global_counts` and `api_league_tier_counts`) behind `MaterializedViewRefresher`, a five-minute scheduled event and a concurrency lease. The entrypoint test confirms scheduled calls target only this retained refresher, not deferred bot recovery.

There is no process-start refresh in a Worker. Initial materialized-view creation/population is an explicit release/prewarm step; the cron must be enabled and verified before relying on populated data. The lease prevents overlapping refreshes but is not proof of production timing or a preserved four-minute query deadline. This review did not create a warmup HTTP endpoint, invoke production refreshes or deploy a schedule.
