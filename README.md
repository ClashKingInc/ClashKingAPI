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
npm test
npm run test:scripts
npm run test:archive-runtime
npm run lint
npm run openapi:check
npm run build
```

Build and Worker dry-run scripts do not deploy. The retained database test lane
requires the authoritative schema copy's disposable Goose/Timescale harness:
`npm run test:postgres:all -- /path/to/clashking_schemas`. It never uses an
inherited production connection. Deferred Bot tests are not active API acceptance.

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

### Army families and battle history (next release)

Army statistics identify permanent families with decimal-string `familyId`, a
nullable manually assigned `name`, and their fixed representative `shareCode`.
Detail/timeline requests accept `armyLink` (full Clash link or canonical code).
Hero/equipment filters match the representative, not individual attacks. Usage
is `attacks / totalLegendAttacks`; the denominator includes uncoded attacks.
Known duration averages divide by the number of non-null durations.

Aggregate date-only `time[after]` and `time[before]` select inclusive Legend day
labels. Day `2026-09-08` covers `[2026-09-08T05:10:00Z,
2026-09-09T05:10:00Z)`. Timestamp ranges must align to those boundaries and use
an exclusive `time[before]`; partial-day aggregate requests return 400. Public
search defaults to 30 completed days (one-day limit 250; multi-day limit 10).
Admin defaults to the latest completed day; timelines support 365 day labels.
Unrelated raw history keeps its existing inclusive UTC time filters.

Daily player counts are exact for the collected daily population. Multi-day
`players` is a distinct union from retained raw attacks only when every selected
completed day has a global closeout row and matching raw attack count, including
zero-attack days and uncoded attacks. Otherwise `players` is null and an active
`minimumPlayers` filter returns 400. This checks preservation of the closeout
population, not whether every real game attack was collected. Raw coverage and
player unions share one bounded scan; no permanent player set is stored.

Admin family browsing supports search by name/ID/code/link, named/unnamed,
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

Deployment requires DevKit migrations 014 and 015, with the separately approved
bounded defense-loot cleanup between them and old writers paused through the
cutover. This API reads the new `*_daily_stats_v2` generation, preserving the old
aggregates separately. Do not merge into the auto-deployed branch before the
coordinated production schema gate is satisfied. Local tests and candidate
package archives do not imply production readiness or publication.
