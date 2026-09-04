# Cloudflare API Worker deployment gate

The TypeScript Worker is a staged replacement and must not receive the production
`api.clashk.ing` route until the route-parity checklist, schema prerequisites,
consumer builds, and coordinator approval are complete.

## Required infrastructure

- Before first traffic on a freshly migrated database, explicitly populate
  `api_global_counts`, `api_league_tier_counts`, `townhall_counts`, and
  `war_league_counts` using ordinary `REFRESH MATERIALIZED VIEW`. Goose creates
  these snapshots `WITH NO DATA`, so the scheduled concurrent refresh cannot
  initialize them. The disposable PostgreSQL test lane exercises this initial
  population before verifying the normal concurrent refresh and all count reads.
  This is a deployment prerequisite, not a request-time fallback.

- Replace every zero-valued Hyperdrive and VPC service ID in the config.
  Dedicated KV namespace `clashking-api-v2-cache`
  (`c453223f6f344d3086c2a15877d1ad51`) was created on 2026-09-03 and is bound as
  `API_CACHE`. No keys were written, no Worker was deployed, and existing badge
  and OAuth namespaces were left unchanged.
  Live verification on 2026-09-03 traced the production `ck-api` database to
  `timescale:5432` on `152.53.82.182`, published only on host loopback. Existing
  VPC service `01a03d1c-6094-7342-82bf-9bbd1d0eb363` targets that loopback through
  healthy tunnel `12ee1000-f012-4631-84e1-57d405f92809`. The shared Hyperdrive
  `aca44651f2604a208a96cae255265d0b` caches reads for 3600 seconds; do not use it
  for API authorization/configuration reads or change its shared policy. The
  proposed API-specific `clashking-api-v2-postgres` must disable query caching.
  Creation is currently approval-blocked because it transfers the existing
  production database credential to the new Cloudflare configuration; no
  resource was created.
- `CLASH_PROXY`, `TRACKING`, and `ELASTICSEARCH` are private HTTP VPC bindings,
  not Workers Service Bindings to imaginary Go Worker deployments. Production
  API origins are `http://ck-proxy:8011` and `http://elasticsearch:9200` on the
  `coolify` Docker network. Native cloudflared cannot use Docker-only DNS names
  without an explicit resolver/origin arrangement. Resolve stable private
  origins and validate connectivity before provisioning the real VPC IDs;
  do not use transient container IPs as an undocumented deployment assumption.
  Tracking's new authenticated internal HTTP ingress is not yet deployed.
- The existing tunnel also serves Admin, Coolify, Dozzle, and staging hostnames.
  Do not start its token on another host or alter shared ingress as part of this
  migration. A disabled installation on `152.53.39.145` was inspected first but
  is not the active connector or production API database target.
- Live R2 inventory confirms `clashking-posts` and `clashking-wars`. The configured
  `clashking-app-updates` bucket was absent; reconcile the existing release
  storage workflow and bind its actual bucket before enabling manifests/uploads.
  The App release workflow selects the beta/production GitHub environment and
  reads its `R2_UPDATES_BUCKET_NAME` secret and `R2_UPDATES_PUBLIC_ORIGIN` variable.
  Its publisher writes immutable `releases/<track>/<version>/release.json`
  objects to that configured bucket. No source hard-codes the proposed Worker
  bucket, so an authenticated operator must confirm both environments' bucket
  names, public origins, and existing marker objects before changing this binding.
See Cloudflare's [private Hyperdrive with Workers VPC guide](https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/)
for the current tunnel, VPC service, and Hyperdrive creation sequence.
- Create `admin_access_principals` through the authoritative `clashking_schemas` Goose
  migration, then bootstrap the first owner explicitly. The Worker has no
  claim-only or email-domain authorization fallback.
- Configure one Access application for `admin.clashk.ing/*` and
  `api.clashk.ing/v2/admin/*`, enable eager redirect cookies, and bypass only
  unauthenticated `OPTIONS`. Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, and an
  exact comma-separated `ADMIN_ALLOWED_ORIGINS` list.
- Set `WEB_ALLOWED_ORIGINS` to exact Dashboard/App origins. Credentialed CORS
  never permits `*`, suffix matches, or reflected unknown origins.
  Browser preflights cover both `/v2/*` and `/proxy/v1/*`, and allow the shared
  client's request-ID and tracing metadata. Allowed origins can read the
  response request ID, retry delay, and export filename headers.
- Add `API_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DATA_ENCRYPTION_KEY`, `ELASTICSEARCH_API_KEY`, both JWT secrets, and the
  remaining provider credentials with `wrangler secret put`; do not commit
  them as vars. `DISCORD_API_ORIGIN` is the non-secret
  `https://discord.com/api/v10` endpoint. The Worker Discord service uses the
  bot credential for guild resources and OAuth bearer credentials only for
  user-scoped calls; no Discord snowflake is converted to a JavaScript number.
  New uploads use the private `MEDIA` R2 binding and narrow `/v2/media/:filename` serving; ticket content uses separate `TICKETING`.
  No Bunny credential is used by the Worker. Historical media transfer/reference cutover remains a separate release prerequisite.
  Push delivery additionally requires `MOBILE_PUSH_FCM_PROJECT_ID` and
  `MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON`. Provision secrets separately from
  generated non-secret bindings; `WorkerBindings` derives resource types from
  Wrangler's generated `Cloudflare.Env` and augments only secret settings.
  Email authentication additionally requires `SMTP_USERNAME` and `SMTP_PASSWORD`.
  The public SMTP settings retain the existing Gmail port 587 STARTTLS defaults
  and `noreply@clashk.ing` sender/reply-to addresses. No real email or production
  SMTP credential transfer is part of local validation.
  The mounted mailer uses Nodemailer for MIME generation only; its native SMTP
  exchange enforces verified TLS, bounded replies before and after STARTTLS,
  and a whole-exchange deadline. Local workerd fixtures exercise the actual
  transport, but do not establish delivery through the production provider.

## Browser refresh-cookie contract

The Dashboard uses `createBrowserApiClient`, which sets Fetch
`credentials: "include"` without adding the Admin-only `X-Requested-With`
header. The API's `/v2/auth/web/*` handlers must issue the refresh cookie as
host-only for `api.clashk.ing` (omit `Domain`), `Path=/v2/auth/web`, `Secure`,
`HttpOnly`, and `SameSite=None`. Logout clears the same cookie using identical
scope attributes and an expired `Max-Age`; JavaScript never reads the token.
Every cookie-consuming or mutating web-auth handler must require an exact
configured Origin, reject missing, null, and unknown origins, and require JSON
for JSON requests. The coordinator explicitly approved `SameSite=None` instead
of Go's non-loopback `Strict` so allowlisted cross-site previews can authenticate.
Refresh failures must not emit `Set-Cookie`: a delayed failure must not clear a
newly rotated cookie. Logout still clears the cookie.

`DISCORD_REDIRECT_URI` is currently configured as
`https://dash.clashk.ing/auth/callback`, derived from the existing Dashboard origin
and Go callback path. Confirm this exact URI in the Discord application before
the staging login test; a configured value is not evidence of provider registration.

## Data and cutover prerequisites

The current local integration runner explicitly targets authoritative Goose
version 027. This is a test baseline, not approval to apply production migrations
or a final release schema floor: remaining runtime/schema gates must close first.
Earlier migrations include the Admin access bootstrap, managed Discord-resource
ledger, and durable subject-mutation mutex rows. New mobile writers serialize on those rows, including bot-owned subjects
without authentication accounts. Do not fabricate auth users or use global table
locks to coordinate those subjects.

The switch is coordinated, not a mixed Go/Worker compatibility period. Drain old
in-flight writes before directing traffic to the Worker. The old Go account
deleter uses independent statements; eventual new account deletion must share
the new writers' identity/subject locks and transaction boundaries. That deletion
implementation remains approval-blocked, so this is still a release gate.

CWL statistics read the additive schema-owned `stats.cwl` version 1 histogram.
Apply and verify the schema-owned offline backfill before enabling those reads
against historical packs that may contain CWL wars. A missing coverage marker
returns an explicit unavailable error, never a misleading zero. Global totals
include unknown leagues, but league-filtered queries require complete league
attribution. No production backfill has been run. Uploaded-pack totals, coverage,
and pending attacks are queried in one PostgreSQL snapshot to avoid a gap or
double count when the archiver finalizes a pack.

Necessary source-data corrections are covered by disposable PostgreSQL tests:
regular war statistics use actual `byDay.regularHitRates`, rather than the stale
Go `attacks.byDayTypeMatchup` path; calendar-day bindings and grouping are explicit
UTC; empty item-stat intervals return zero/unavailable metrics; and army daily
points use the same requested ranking as their overall selection.

Run the full database lane with `npm run test:postgres:all -- /path/to/clashking_schemas`.
Each test file gets a fresh schema-owned Goose/Timescale fixture, so deterministic
test identities and count snapshots cannot contaminate another file. CI checks
out `ClashKingInc/DevKit` at `API_SCHEMA_TEST_REF` (default `main`); set that variable
to the published, reviewed schema revision supporting the runner's explicit
version 027 and the fixture harness. The schema Go module is
`database/go.mod`, which CI uses for Go setup. `bash scripts/test-postgres.sh
--check /path/to/clashking_schemas` validates only the checkout layout without
starting a database; `npm run test:scripts` exercises discovery, argument
preservation and fail-fast behavior with a fake harness. The real runner discovers
nested test files and gives each its own fresh database. A private repository also needs a read-only
`SCHEMA_REPO_TOKEN` with access to DevKit. Until those schema changes and access
are available remotely, this new CI lane is not verified; local targeted harness
passes are not a claim that remote CI has run.

## Placement and release verification

Production container configuration and Cloudflare connector inventory on
2026-09-03 confirm Timescale on Netcup host `152.53.82.182` (`clashking-server`),
PostgreSQL on `127.0.0.1:5432`, and SSH publicly on port 22. The active connector
has four Cloudflare `iad` connections; the eastern North America DO hint is
consistent with that observed network locality, not inferred from the earlier
unrelated host. Because Netcup is outside the supported AWS, GCP, and Azure region
hint providers,
the Worker uses Cloudflare's experimental TCP host placement against that
existing SSH endpoint. PostgreSQL remains private and is never exposed for
probing. Reconfirm this topology before each environment's first deployment and
change the hint if the database moves.
Cloudflare's [placement guide](https://developers.cloudflare.com/workers/configuration/placement/)
documents `placement.host` as the targeted option for known,
single-homed infrastructure outside those cloud providers; `mode: "smart"` is
reserved for unknown or multiple backends.
This is an experimental latency-based placement hint, not an absolute residency
pin. It applies to fetch handlers, not RPC or named entrypoints, so Bot traffic
must use the default Service Binding fetch entrypoint. Verify actual database
roundtrip latency and `cf-placement` where available in the staged environment.

The five-minute Cron trigger calls the single `MaterializedViewRefresher`
Durable Object instance. Its in-memory guard plus persistent fifteen-minute
crash-recovery lease prevents overlapping
refreshes across Worker isolates, and the PostgreSQL work uses `REFRESH
MATERIALIZED VIEW CONCURRENTLY` without advisory locks because Hyperdrive does
not support PostgreSQL advisory-lock operations.
That limitation is documented in Cloudflare's [supported database features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/).
The DO namespace and SQLite-backed class migration are declared in
`workers/api/wrangler.jsonc`; the deterministic `stats-materialized-views`
instance name is the coordination atom, and its `enam` location hint keeps the
Cron coordinator in eastern North America because Worker placement does not
apply to Durable Object RPC. A successful run clears its lease and
records completion, an overlapping invocation returns `already_running`, and a
failure clears the active lease, logs the failure, and rejects the Cron promise
so Cloudflare records the scheduled invocation as failed. The fifteen-minute
persistent lease is retained only as crash recovery if an isolate terminates
between acquisition and cleanup.

The same Cron handler also wakes `RUNTIME_RECOVERY` at the deterministic name
`persistent-runtime-recovery`. Its separate SQLite coordinator scans ticket
operations and panel publications in bounded, alternating keyset pages. Exact
PostgreSQL timestamp cursors and a fixed watermark survive eviction. Page
inventory and a retryable outgoing wake backlog commit together before cursor
advancement; rejected per-ticket coordinator RPCs rotate without blocking later
pages. Existing `TICKET_RUNTIME` objects still perform external delivery. Failed
inventory/RPC batches retry after 30 seconds; successful pages continue after one
second. Repeated Cron wakes rearm alarms without resetting an active scan.
Each external read/wake has a ten-second deadline capped by a shared
thirty-second alarm budget. Exhaustion leaves unattempted wakes durable, and
failure retry is scheduled thirty seconds after the attempt finishes. SQL
receives cancellation signaling; a timed-out RPC is ambiguous and remains
retryable, never treated as proof that the target did not accept its wake.
The local `v4-runtime-recovery` migration and generated binding types prepare
this class for a future authorized deployment; no live namespace exists as a
result of this work. Roster operation and terminal-role-repair feeds must be
integrated separately before claiming roster recovery parity.

Deploy to a non-production Worker name and route first. Verify Wrangler's
placement output, `cf-placement` on test responses where supported, Hyperdrive
connectivity, Access 401/403 behavior, exact-origin preflights, all route parity
tests, and consumer builds. Roll back by removing the staged route or restoring
the prior route target; the Go deployment remains intact until the coordinator
authorizes final cutover.
