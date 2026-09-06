# Dashboard Discord cache boundaries

The Dashboard endpoints stay in the API. This change reduces supported read
calls without changing their routes, permissions or Discord mutations.

## Restored read authorization and request coordination

The pre-Effect Go API kept successful server access for sixty seconds, seeded
that cache from `/v2/guilds`, combined simultaneous permission lookups, and
bypassed the cache for writes. The rewrite now restores those behaviors through
schema migration `028_discord_coordination.sql`. This uses shared SQL rows, not
Worker-global promises or eventually consistent KV authorization.

`discord_cache.dashboard_access` stores only the successful Discord manager and
member-role claims for at most sixty seconds. Keys hash the user, device, bot,
application and Discord origin. The logged-in API identity is still verified on
every request. Dashboard grants are read fresh from SQL, so removing a delegated
grant immediately takes effect without waiting for the Discord claim to expire.
All non-GET/HEAD requests and any explicit write requirement verify Discord live;
a live denial replaces an older positive cached observation. Expired/corrupt
claims never authorize requests or act as an outage fallback.

Short, expiring lookup leases combine concurrent reads across Worker isolates.
No SQL transaction or advisory lock spans a Discord request. Publication checks
the lease token, so a slow old lookup cannot overwrite a newer live observation
or guild-list seed. Unavailable cache storage falls back to live authorization;
provider failures are never stored as permission decisions.

`discord_cache.request_limits` coordinates outgoing request spacing and shared
cooldowns using hashed provider/credential/route keys. OAuth requests keep the
old extra 500 ms spacing; bot routes use 50 ms and credential-wide requests use
25 ms spacing. Provider exhausted-bucket reset headers and route/global 429
delays extend the shared cooldown. A request retries at most once, never before
that cooldown, and returns a typed temporary limit if the delay exceeds its
15-second request budget. These values are conservative implementation choices,
not a promise that Discord will never return 429. Inactive rows are pruned in
bounded batches. Coordination SQL failure stops new outbound requests instead
of turning a database outage into an unpaced Discord burst.

Migration 028 must be applied before running the updated API. It was validated
only on disposable local PostgreSQL, not applied to production. The running
local API must be restarted after its intended development database has the
migration. No public contracts or client packages changed for this fix.

## Implemented reads

`serverThreads` first asks Discord for active threads. For the exact parent IDs
in that response, `readDashboardThreadParentNames` reads names from the existing
`discord_cache.channels` table. A hit skips the second Discord call that would
otherwise load the guild's channels for their names. It cannot invent a thread
or infer that a channel/member is absent.

The query binds the guild ID and requested IDs. Every requested parent must have
exactly one valid row with matching relational and JSON identity, a name, and a
non-future update time less than sixty seconds old. Missing, duplicate, foreign,
malformed or stale rows discard the whole cached answer and use the existing
live guild-channel read. Cache errors or a 250 ms timeout also fall back. An
empty thread/parent list needs no lookup. A request cancellation stays canceled.

The sixty-second age, 250 ms read budget and 2,000-parent limit are conservative
implementation choices, not values supplied by the old API or proof of Gateway
health. A recently renamed parent can display an older name within that window;
no access or mutation decision uses it. Old unchanged rows intentionally miss.
No new schema, Gateway writer, cache invalidation service or infrastructure was
introduced. The query has code/mock coverage but has not yet run against a
disposable PostgreSQL fixture in this restored checkout.

The bot-profile helper separately caches read-only global application fallback
fields for the original fifteen minutes in `API_CACHE`. Its keys isolate the
configured application, live bot identity and Discord origin. A cache entry
for another bot is rejected; a mismatched live application returns a typed
failure instead of mixing profiles. Decoded values have their age checked in
addition to KV expiry. The mutable guild profile stays live via the original
empty PATCH, and edits return the live PATCH response. The old five-minute guild
cache is deliberately not copied into eventually consistent KV, which cannot
guarantee a subsequent read sees the completed edit. This preserves results at
the cost of more guild-profile reads; it does not claim exact caching parity.
Each optional global-profile KV read/write has a 250 ms wait budget. A hung
read falls back to Discord; a hung write does not block a valid profile response.
This is an implementation-selected wait limit, not a change to the fifteen-minute
freshness rule. A timed-out KV write may still finish remotely. Tests cover
never-settling reads and writes as well as rejected promises.

## Reads deliberately kept live

- Complete role and channel lists, including role dropdowns. The stored guild
  JSON has neither a role nor channel manifest, so a recent guild timestamp and
  individually valid rows cannot establish a complete list.
- Active threads themselves; the inspected Gateway writer does not handle all
  thread lifecycle events.
- Live write permission checks, role-grant validation, membership/presence
  decisions outside the bounded read-authorization cache above, connection tests
  and webhook reads.
- Existing member-list behavior and its separate fifteen-minute API cache,
  5,000-member cap and bot filtering; asynchronous Gateway chunks are not a
  substitute for a complete source list.
- All Dashboard Discord writes. No cache result authorizes a write or replaces
  its live response.

## Source evidence and tests

The existing schema was inspected only at the authorized
`database/timescale/008_discord_cache.sql` path in the saved Schema revision
`4608b2af8c4321f8c76d44e697ffbd0f0fe7f713`. No migration was modified or applied.
Tracking revision `6b061aec8ab4ef76ae266b008b7ad43e194c7dd2`,
`scripts/discord_gateway.go`, stores the base `discord.Guild` JSON plus separate
channel/role/member rows. Disgo v0.19.6's base Guild omits the collection fields
on RestGuild/GatewayGuild. Startup snapshots are transactional, but ordinary
guild updates share the same timestamp column; it is not a completeness marker.
Deployment, matching bot identity and actual cache population remain unverified.

`dashboard-discord-cache.test.ts` checks exact IDs, bounded input, freshness,
schema failures, missing/duplicate/foreign rows, SQL failure, timeout and
cancellation. `dashboard-server-core.test.ts` checks live-first thread reads,
cache hits and fallback, and proves full lists, connection checks and grant
mutations stay live. `discord-bot-profile.test.ts` checks inheritance and
read-after-edit behavior with isolated cache/provider fixtures.
