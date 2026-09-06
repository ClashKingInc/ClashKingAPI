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
npm run test:durable
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
archives plus their integrity manifest. Cloudflare builds `main` with
`npm run worker:deploy`, which regenerates the OpenAPI and documentation assets
before deploying the Worker.

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
