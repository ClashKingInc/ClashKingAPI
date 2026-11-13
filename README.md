# ClashKing API

The ClashKing API provides Clash of Clans history, statistics, and the shared data used by ClashKing's app, dashboard, and bot.

You can browse the live API at [api.clashk.ing](https://api.clashk.ing). The service is actively developed, so check the API reference before relying on an endpoint or response that is not documented.

## What is available

The API covers:

- player and clan history, rankings, leaderboards, and game statistics
- wars, Clan War Leagues, roster tools, and downloadable reports
- ClashKing server settings, reminders, roles, tickets, giveaways, and other bot features
- accounts, linked players, notifications, app content, and privacy controls

Some routes are public. Routes that read or change account and server data require the access shown in the API reference.

## API reference

- [Interactive API reference](https://api.clashk.ing/)
- [OpenAPI JSON](https://api.clashk.ing/openapi.json)
- [OpenAPI YAML](https://api.clashk.ing/openapi.yaml)
- [Swagger UI](https://api.clashk.ing/swagger)

The interactive reference shows the available routes, what to send, what comes back, and whether you need to sign in.

### League history and CWL periods

`GET /v2/player/:tag/legend-history` returns Legend seasons. Ranked tournament
history uses `GET /v2/player/:playerTag/ranked/history`. The existing mixed
`/league/history` route remains a compatibility surface. Recorded historical
league IDs, names and icon URLs retain their source namespace; missing metadata
stays unknown.

Roster metric `cwl.performance_history` accepts an exact `season` such as
`"2026-10"`, a rolling `windowMonths` window, or a `seasonCount` participation
count. A named month is never replaced with the latest rolling month. The metric
includes historical clan/CWL league, total stars, destruction, missed attacks and
averages from observed completed lineups. `familyOnly` checks the player's actual
historical side against the server's configured clans.

### Manual reminder requests

`POST /v2/server/:serverId/reminders/:reminderId/send` requires a signed-in user with reminder-management access. It accepts no actor override. The authenticated bot route `/v2/bot/server/:serverId/reminders/manual` accepts `{ "clanTag": "#PYLQRRJC", "type": "War" }`. The signed Discord command checks Manage Server permission before calling that route; the API separately requires bot authentication. No caller-supplied actor ID is needed.

Both return HTTP202 with `{ "accepted": 1 }` for accepted requests, not delivered messages. The API reads enabled reminders belonging to that server and emits one PostgreSQL notification per reminder through `clashking_tracking_wake_v1`, containing only `kind`, `serverId`, and `reminderId`. Tracking rechecks configuration and uses the existing sender. War, Clan Capital, Clan Games and roster reminders are supported. A disabled, missing or unsupported destination is not accepted.

This path is deliberately best-effort: there is no request table, delivery lease, durable retry queue or exactly-once guarantee. A notification can be missed if the worker is disconnected, and repeated requests can produce repeated sends.

## Project layout

- `workers/api` contains the Effect v4 / TypeScript Cloudflare Worker API.
- `packages/api-contracts` owns shared request/response schemas and endpoint definitions.
- `packages/api-client` provides the typed request client used by the separate consumers.
- `scripts/generate-openapi.mjs` generates the complete internal schema from
  shared contracts. `npm run docs:build` produces the public documentation assets
  served by the Worker.
- `locales` contains messages sent to users in supported languages.

## Operational read freshness

Production caches only GET routes that are explicitly public Clash data contracts (player, clan, statistics, ranking, army, league, war and esports data) through `HYPERDRIVE`. Every other request uses `HYPERDRIVE_FRESH`, a separate connection to the same database with query caching disabled. Dashboard settings, rosters, moderation, permissions, authentication, Admin and app posts therefore stay fresh. New endpoints default to fresh reads; adding an operational route cannot silently enable caching.

Hyperdrive does not invalidate matching cached reads after database writes. Do not route editable settings, moderation lists, or newly published posts through the cached binding. Deploy the cache-disabled configuration and bind it before publishing this Worker. The local service runner supplies both bindings to its disposable database; it does not emulate Cloudflare's cache.

## Local development

The API runs on Cloudflare Workers with Effect and TypeScript. It stays on
`/v2`, uses POST for the six former QUERY operations, retains Dashboard business
handlers, and owns Admin business handlers. Dashboard and Admin frontends are
separate Workers; the Bot Worker sends signed command and component requests to this API.

Use Node 26 and npm 12, with the pinned Effect/TypeScript versions:

```sh
npm ci
npm run typecheck
npm run e2e:roster-assistant
npm run lint
npm run openapi:check
npm run build
```

Build and Worker dry-run scripts do not deploy. Real database/service checks use
the authoritative schema copy's disposable Goose/Timescale harness and the
retained scripts documented in `clashking_bot/tooling/e2e/README.md`. Unit and
isolated-helper suites are not retained. Never inherit a production connection
for mutating verification.

`node scripts/e2e/search-nullability.mjs`, under the disposable Timescale
harness, starts an owned Elasticsearch 8.19.17 container and the real local
Worker. Set `CLASHKING_E2E_SCHEMA_ROOT` to the authoritative DevKit checkout.
The check covers nullable search fields, clan enrichment, and cursor paging.
Its optional `CLASHKING_LOCAL_ELASTICSEARCH_ORIGIN` binding accepts only an
explicit loopback port and defaults to unavailable outside that setup.

For interactive Dashboard/App development, use `npm run dev`. It generates the
contracts and API documentation before starting the persistent local database;
the disposable harness above is for tests only.

Publishing a GitHub release attaches version-matched API contracts and client
archives plus their integrity manifest. Cloudflare builds production from
`main` with `npx wrangler deploy`; preview branches use
`npx wrangler versions upload`. The root Wrangler configuration regenerates the
OpenAPI and documentation assets before either upload.

## Using ClashKing data

Historical data takes real storage and processing to maintain. If you use it in another project, please make it clear that the data comes from ClashKing. A visible mention or link to [clashk.ing](https://clashk.ing) is enough.

Do not present ClashKing's collected data as if your project collected it independently.

## Assets

Game images and other Clash of Clans assets are available from [assets.clashk.ing](https://assets.clashk.ing). The tools used to prepare them live in the [ClashKing Assets repository](https://github.com/ClashKingInc/ClashKingAssets).

## Contributing

Bug fixes and useful improvements are welcome. Keep changes focused, follow the
owning module's patterns, and include tests when behavior changes. Shared schema
changes must be checked against the Dashboard, Admin, App and Bot consumers.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

## Supercell notice

This project is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Clash of Clans and its related assets belong to Supercell. Use this API in line with Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/) and Terms of Service.

### Army setups and battle history

Current army statistics use `/v2/stats/army-setups` and its `/timeline` and
`/rank-history` routes. Daily observations identify troop groups and supported
variants with `groupKey` and `variantKey`. The retired `/v2/stats/armies`,
`/detail`, and `/timeline` family routes return an explicit 404. No numeric family
ID is mapped to a new group key. Player Legend comparisons return overall
cohort results only, not stale legacy-family comparisons. Supported current
cohorts are all Legend I, top 1,000, and top 200.

Aggregate date-only `time[after]` and `time[before]` select inclusive Legend day
labels. Day `2026-09-08` covers `[2026-09-08T05:00:00Z,
2026-09-09T05:00:00Z)`. Timestamp ranges must align to those boundaries and use
an exclusive `time[before]`; partial-day aggregate requests return 400.
Unrelated raw history keeps its existing inclusive UTC time filters.

Current setup responses expose completed days, total observed attacks, and
classified attacks. Missing observations stay missing rather than becoming
zero usage. Usage denominators include attacks without a classified army.

Admin uses the same daily troop-group and setup observations as the App. Legacy
permanent-family browsing, manual names, and numeric family IDs are removed.
Raw battle history and stored historical data are retained.

Detailed Ranked tournament and Legend-day battle responses omit loot on both
attacks and defenses. GET `/v2/player/:playerTag/battlelog/history` returns all
observed farming, ranked and legend attacks, globally ordered newest first,
with required `battleMode` and stored `lootedResources`. The API does not add
extra loot a second time. Opponent data is not invented for farming records.

`/v2/stats/ranked` now measures non-Legend Ranked attacks within their actual
Unix-second tournament membership period. This corrects the old `battlelogs`
query's obsolete YYYYMM join; it is an explicit population correction, not
unchanged mixed-mode behavior. Legend daily statistics have no tier/TH grouping.
Ranked `metrics` and each UTC `daily` point now include `airCount`, `groundCount`,
`mixedCount`, `unknownCount`, `classifiedCount`, and `classificationCoverage`
(a fraction from 0 to 1). Main-army troop housing determines type: at least
70% air or ground is that type, and the middle is mixed. Missing compositions,
empty armies, and armies with unmapped troop IDs are unknown. The four type
counts sum to `sampleSize`; castle troops, spells, and heroes do not affect type.

Current closeout writes `legend_daily_stats` and `army_setup_daily_stats`
atomically. Historical family aggregates remain available only to historical
admin tooling; no current family writer runs. Do not merge into the auto-deployed
branch before the coordinated production schema gate is satisfied. Local
verification and candidate archives do not imply deployment or publication.

### Server clan verification

Dashboard clan creation can open verification immediately, and clan settings can start it later. The API issues a description marker from 20 rotating familiar five- or six-letter words suffixed with `ck` (for example, `appleck`) after checking that it is absent from the current Clash description. Progress is stored in `server_clan_verifications` (the consolidated Goose migration 022): the first check is due after two minutes, subsequent checks are leased for one minute, and challenges expire after 30 minutes. The API Worker's one-minute cron checks bounded batches; the open dashboard also checks due challenges so local development works without a cron emulator.

Verification belongs to a configured `(server_id, clan_tag)` pair and is deleted when that clan is removed. Only the verified server's clan-roster Links response reveals hidden link identities; unverified clans retain the Hidden label without revealing ownership. Changing ordinary clan settings cannot grant verification. Active verification words are distinct for the same clan across servers. Production needs migration 022 and the updated Worker/cron; local migration or tests do not deploy these changes.

## Manual server limits

Migration 051 adds per-server defaults: 10 clans, 5 AutoBoards, and $0.05 of AI
spend per UTC calendar month. Admin can change these through `/v2/admin/server-limits`;
ordinary server settings cannot raise them. Reductions retain existing clans and boards.
All quota writes and AI admissions lock the server row. Limit messages direct users to
https://discord.gg/clashking; purchases no longer raise limits.

AI admission checks recorded monthly spend. Pending calls and unknown provider
outcomes do not reserve money or block another prompt. Only the trusted assistant
holds the private AI-metering secret. Reported usage, including reasoning tokens,
is recorded idempotently for each provider call; duplicate settlement cannot charge
twice. Unknown usage remains in the call audit instead of becoming an invented cost.
Model retries and provider-side compaction remain disabled. A call already admitted
can finish slightly above the monthly limit; later prompts check the updated spend.
These private service contracts are exported but excluded from public endpoint discovery.

The old billing implementation and historical records are retained, but `/v2/billing/*`
returns 410. Do not reactivate old subscription projection jobs to control manual limits.

Bot profile customization is off by default. Admin grants or revokes it per server
on the Server limits page. The API checks the grant on every profile edit;
existing profile values remain unchanged when access is revoked.

Admin's Server limits page also offers an explicit, confirmed Reset to default
operation for the bot profile. It clears the server's name, avatar, banner and
bio overrides, restoring global inheritance. It works while customization access
is disabled, leaves that grant unchanged, and audits only a successful reset.
Revoke and save separately if further customization should also be prevented.

Email account lookup uses `EMAIL_HASH_SECRET` when configured, otherwise `JWT_ACCESS_SECRET`. Preserve the key used to create existing `auth_users.email_hash` values when rotating session-signing secrets. Setting the dedicated lookup key does not change passwords or invalidate sessions.

### Published post filtering

`GET /v2/app/posts` accepts optional `presentation_type=article|story` alongside
its existing target, locale, limit and offset query. The filter runs before
pagination. A nonblank legacy `story_url` counts as a story, matching the native
app. Omitting the filter retains the mixed feed. Publication status and platform
checks still apply. The app uses separate cursors for the article archive and
five recent story replays; no schema migration is required.

Run the real local HTTP check against disposable SQL with:
`bash <schema-repo>/scripts/with-test-timescale.sh --profile retained-api -- node scripts/e2e/post-story-filter.mjs`.
