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

## Local development

The API runs on Cloudflare Workers with Effect and TypeScript. It stays on
`/v2`, uses POST for the six former QUERY operations, retains Dashboard business
handlers, and owns Admin business handlers. Dashboard and Admin frontends are
separate Workers; Bot runtime work remains a separate plan.

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

### Army setups and battle history (next release)

Current army statistics use `/v2/stats/army-setups` and its `/timeline` and
`/rank-history` routes. Daily observations identify troop groups and supported
variants with `groupKey` and `variantKey`. The retired `/v2/stats/armies`,
`/detail`, and `/timeline` family routes return an explicit404. No numeric family
ID is mapped to a new group key. Player Legend comparisons return overall
cohort results only, not stale legacy-family comparisons. Supported current
cohorts are all Legend I, top1,000, and top200.

Aggregate date-only `time[after]` and `time[before]` select inclusive Legend day
labels. Day `2026-09-08` covers `[2026-09-08T05:10:00Z,
2026-09-09T05:10:00Z)`. Timestamp ranges must align to those boundaries and use
an exclusive `time[before]`; partial-day aggregate requests return 400.
Unrelated raw history keeps its existing inclusive UTC time filters.

Current setup responses expose completed days, total observed attacks, and
classified attacks. Missing observations stay missing rather than becoming
zero usage. Usage denominators include attacks without a classified army.

Historical admin family browsing supports search by name/ID/code/link, named/unnamed,
representative filters, sorting, and `page`/`limit`/`hasMore`. Inactive families
remain discoverable. PATCH `/v2/admin/stats/armies/:familyId` accepts a manual
name or null to clear it. GET `/:familyId/members` lists codes and similarity
scores; `includeStats=true` returns retained-window results, or null when
coverage is unavailable.

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

Dashboard clan creation can open verification immediately, and clan settings can start it later. The API issues a description marker from 20 rotating familiar five- or six-letter words suffixed with `ck` (for example, `appleck`) after checking that it is absent from the current Clash description. Progress is stored in `server_clan_verifications` (Goose migrations 058–059): the first check is due after two minutes, subsequent checks are leased for one minute, and challenges expire after 30 minutes. The API Worker's one-minute cron checks bounded batches; the open dashboard also checks due challenges so local development works without a cron emulator.

Verification belongs to a configured `(server_id, clan_tag)` pair and is deleted when that clan is removed. Only the verified server's clan-roster Links response reveals hidden link identities; unverified clans retain the Hidden label without revealing ownership. Changing ordinary clan settings cannot grant verification. Active verification words are distinct for the same clan across servers. Production needs migrations 058–059 and the updated Worker/cron; local migration or tests do not deploy these changes.
