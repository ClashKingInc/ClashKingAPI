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
- [OpenAPI file](https://api.clashk.ing/openapi.json)
- [Swagger UI](https://api.clashk.ing/swagger)

The interactive reference shows the available routes, what to send, what comes back, and whether you need to sign in.

## Project layout

- `internal/routes` contains the API routes and their tests.
- `internal/models` contains the request and response formats.
- `internal/utils` contains shared setup for the database, cache, authentication, email, and outside services.
- `internal/docs` contains the generated API description used by the live reference.
- `locales` contains messages sent to users in supported languages.

## Using ClashKing data

Historical data takes real storage and processing to maintain. If you use it in another project, please make it clear that the data comes from ClashKing. A visible mention or link to [clashk.ing](https://clashk.ing) is enough.

Do not present ClashKing's collected data as if your project collected it independently.

## Assets

Game images and other Clash of Clans assets are available from [assets.clashk.ing](https://assets.clashk.ing). The tools used to prepare them live in the [ClashKing Assets repository](https://github.com/ClashKingInc/ClashKingAssets).

## Contributing

Bug fixes and useful improvements are welcome. Keep changes focused, follow the existing Go style, and include tests when behavior changes.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

## Supercell notice

This project is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Clash of Clans and its related assets belong to Supercell. Use this API in line with Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/) and Terms of Service.
