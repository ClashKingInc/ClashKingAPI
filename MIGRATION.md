# ClashKingAPI - Python to Go Migration

This document tracks the progress of migrating the ClashKingAPI from Python (FastAPI) to Go (Fiber), including the typed model coverage work completed in April 2026.

  ---

## Architecture Overview

| Layer | Python (legacy) | Go (current) |
  |---|---|---|
| Framework | FastAPI | Fiber v2 |
| Entry point | `main.py` / `startup.py` | `main.go` |
| Routers | `routers/v1/` and `routers/v2/` | `internal/routes/` and `internal/routes/` |
| Models | Pydantic | Go structs in `internal/models/` |
| Database | Motor (async MongoDB) | `go.mongodb.org/mongo-driver/v2` |
| CoC API client | `coc.py` / `coc` library | Internal `Clash` client wrapper |

Both servers currently coexist. The Go server handles migrated routes; the Python server handles the rest.
A catch-all proxy at `/v1/*` in Go forwards any unmigrated V1 requests back to the Python process.

  ---

## Migration Status

### V1 API

#### Migrated to Go

| Route | Handler |
  |---|---|
| `GET /assets` | Static assets |
| `GET /json/:data_type` | Static JSON data |
| `GET /bot/config` | Bot config |
| `POST /ck/bulk` | Proxy |
| `GET /boost-rate` | Boost rate |
| `GET /global/counts` | Global counts |
| `GET /list/townhalls` | Townhall list |
| `GET /list/seasons` | Seasons list |
| `GET /capital/stats/district` | Capital district stats |
| `GET /capital/stats/leagues` | Capital league stats |
| `GET /capital/:clan_tag` | Capital raid log |
| `POST /capital/bulk` | Bulk capital raids |
| `GET /clan/:clan_tag/basic` | Basic clan object |
| `GET /clan/:clan_tag/join-leave` | Clan join/leave history |
| `GET /clan/search` | Clan search |
| `GET /clan/:clan_tag/historical` | Clan historical data |
| `GET /player/:player_tag/stats` | Player stats |
| `GET /player/:player_tag/legends` | Player legend stats |
| `GET /player/:player_tag/historical/:season` | Player historical data |
| `GET /player/:player_tag/warhits` | Player war hits |
| `GET /player/:player_tag/raids` | Player capital raids |
| `GET /player/to-do` | Player to-do list |
| `GET /player/:player_tag/legend_rankings` | Legend ranking history |
| `GET /player/:player_tag/wartimer` | War timer |
| `GET /player/:player_tag/join-leave` | Player join/leave history |
| `GET /player/search/:name` | Player name search |
| `GET /war/:clan_tag/previous` | Previous wars |
| `GET /war/:clan_tag/previous/:end_time` | War at specific time |
| `GET /war/:clan_tag/basic` | Current war basic info |
| `GET /cwl/:clan_tag/group` | CWL group |
| `GET /cwl/:clan_tag/:season` | CWL season data |
| `GET /legends/clan/:clan_tag/:date` | Clan legend data by date |
| `GET /legends/streaks` | Legend streaks |
| `GET /legends/trophy-buckets` | Legend trophy buckets |
| `GET /legends/eos-winners` | End-of-season winners |
| `GET /ranking/live/legends` | Live legend rankings |
| `GET /ranking/legends/:player_tag` | Player legend ranking |
| `GET /ranking/:type/:location/:date` | Location rankings (trophies, builder, capital) |
| `GET /guild_links/:guild_id` | Guild links |
| `GET /shortner` / `GET /shortlink` | URL shortener |
| `POST /discord_links` | Discord links |
| `GET /donations`, `/activity`, `/clan-games`, `/war-stats`, `/capital` | Legacy aggregates |
| `GET /v1/*` (catch-all) | Forward proxy to Python |

#### Still in Python

| File | Lines | Key functionality |
  |---|---|---|
| `routers/v1/stats.py` | 853 | Heavy statistics and analytics aggregations |
| `routers/v1/player.py` | 648 | Extended player stats (partially covered by Go) |
| `routers/v1/giveaway.py` | 300 | Giveaway management |
| `routers/v1/utility.py` | 225 | Utility endpoints |
| `routers/v1/clan.py` | 211 | Clan-specific ops (partially covered by Go) |
| `routers/v1/war.py` | 188 | War endpoints (partially covered by Go) |
| `routers/v1/capital.py` | 171 | Capital endpoints (partially covered by Go) |
| `routers/v1/test.py` | 167 | Test/debug endpoints |
| `routers/v1/rosters.py` | 165 | Roster management |
| `routers/v1/internal.py` | 155 | Internal bot endpoints |
| `routers/v1/global_data.py` | 109 | Global stats |
| `routers/v1/leaderboards.py` | 103 | Leaderboard endpoints |
| `routers/v1/ranking.py` | 70 | Ranking endpoints (partially covered by Go) |
| `routers/v1/legends.py` | 70 | Legend endpoints (partially covered by Go) |
| `routers/v1/list.py` | 39 | List endpoints (partially covered by Go) |
| `routers/v1/server_info.py` | 34 | Server info |
| `routers/v1/leagues.py` | 32 | League data |
| `routers/v1/redirect.py` | 26 | Redirects |
| `routers/v1/game_data.py` | 24 | Game data |
| `routers/v1/helper.py` | 1 | Placeholder |
| `routers/v1/xlsx.py` | 0 | Placeholder |
| `routers/v1/hidden.py` | 0 | Placeholder |

  ---

### V2 API

#### Migrated to Go

All major feature domains are implemented in `internal/routes/` and `internal/routes/server/`:

- **Auth** - email, Discord OAuth, token refresh, password reset, account linking
- **Accounts** - CoC account add/verify/list/remove/reorder
- **Tracking** - player add/remove
- **Clan** - ranking, donations, composition, details, members, join-leave, capital raids
- **Player** - location, sorted, summary, extended, legend days, legend rankings
- **War** - previous wars, CWL history, thresholds, stats, summaries, warhits
- **Legends** - guild stats, daily tracking
- **Capital** - player stats, guild leaderboard
- **Activity** - guild summary, inactive players
- **Dates** - seasons, raid weekends, current dates, season bounds
- **Guilds** - user guilds, guild details
- **Search** - clans, banned players, bookmarks, groups
- **Static Data** - categories, items, max levels
- **Mobile** - config, initialization
- **Rosters** - full CRUD, members, groups, automation, categories
- **Server Settings** - settings, embed color
- **Server Logs** - log config, clan logs
- **Server Channels/Threads** - channel and thread listing
- **Server Clans** - add, remove, settings
- **Server Roles** - list, create, delete, settings, family roles
- **Server Autoboards** - create, update, delete, list
- **Server Countdowns** - enable, disable, list
- **Server Reminders** - create, update, delete, list
- **Server Panels** - get, update
- **Server Embeds** - CRUD
- **Server Tickets** - full CRUD (panels, buttons, open tickets)
- **Server Giveaways** - CRUD, reroll
- **Server Leaderboards** - 7 leaderboard types
- **Server Strikes/Bans** - add, delete, summary
- **Server Links** - get, delete, bulk unlink
- **Exports** - CWL summary (Excel), player stats (CSV)
- **Internal** - bot info

#### Still in Python

| File | Notes |
  |---|---|
| `routers/v2/clan_settings.py` | Stub / empty |
| `routers/v2/config.py` | Public config endpoint - stub exists in Go but not wired |
| `routers/v2/pl.py` | Legend players endpoint - incomplete implementation |
| `routers/v2/tracking.py` | Player tracking - partially migrated |

  ---

## Typed Model Coverage

### Before this work

- **V1**: 1 out of ~42 endpoints had a typed request model (`POST /capital/bulk`). Zero typed response models.
- **V2**: roughly 35% request coverage, 25% response coverage. Server-domain routes (tickets, giveaways, roles...) were well-typed; data-query routes returned raw `bson.M` or `map[string]any`.

### Models added (April 2026)

#### `internal/models/v2/` - new files

| File | Structs |
  |---|---|
| `player.go` | `PlayerTagsRequest`, `PlayerLocationItem`, `PlayerSortedItem`, `PlayerSummaryCategoryEntry`, `PlayerLegendDaysItem`, `PlayerLegendRankingItem` |
| `clan_responses.go` | `ClanRankingResponse`, `BoardTotalsResponse`, `DonationEntry`, `ClanCompositionResponse` |
| `war_responses.go` | `CWLThresholdItem`, `CWLRankingHistoryItem`, `WarStatsItem`, `WarSummaryResponse` |
| `legends_responses.go` | `GuildStatsResponse`, `GuildStatsTopPlayer`, `GuildStatsClanRow`, `DailyTrackingResponse`, `DailyTrackingPlayer` |
| `dates_responses.go` | `CurrentDatesResponse`, `SeasonBoundsResponse` |
| `activity_responses.go` | `GuildSummaryResponse`, `GuildSummaryClanRow`, `InactivePlayersResponse`, `InactivePlayerItem`, `CapitalPlayerStatsResponse`, `CapitalPlayerItem`, `CapitalLeaderboardResponse`,
  `CapitalClanLeaderboardItem` |

#### `internal/models/v1/` - new files

| File | Structs |
  |---|---|
| `player.go` | `PlayerStatsResponse`, `PlayerLegendsResponse`, `PlayerLootedData` |
| `war.go` | `CWLRankingEntry`, `CWLRankingRounds` |

#### Route files updated

| File | Models applied |
  |---|---|
| `routes/clan.go` | `ClanRankingResponse`, `BoardTotalsResponse`, `DonationEntry`, `ClanCompositionResponse` |
| `routes/war.go` | `CWLThresholdItem`, `CWLRankingHistoryItem`, `WarStatsItem`, `WarSummaryResponse` |
| `routes/legends.go` | `GuildStatsResponse`, `DailyTrackingResponse` |
| `routes/dates.go` | `CurrentDatesResponse`, `SeasonBoundsResponse` |
| `routes/activity.go` | `GuildSummaryResponse`, `InactivePlayersResponse` |
| `routes/capital.go` | `CapitalPlayerStatsResponse`, `CapitalLeaderboardResponse` |
| `routes/player.go` | `PlayerTagsRequest` (replaces inline struct), `PlayerSortedItem`, `PlayerLegendDaysItem`, `PlayerLegendRankingItem` |
| `routes/player.go` | `PlayerStatsResponse`, `PlayerLegendsResponse` |
| `routes/war.go` | `CWLRankingEntry` (typed function return) |

### What still needs typed models

The following Go endpoints still return raw `bson.M` or `map[string]any` because the data comes
directly from MongoDB documents (CoC API cache). Fully typing these requires mirroring the upstream
CoC API response schema:

- All `GET /clan/:tag/...` endpoints returning raw clan documents
- All `GET /war/:tag/...` and `GET /cwl/...` endpoints returning raw war documents
- All `GET /player/:tag/...` endpoints returning raw player documents
- `GET /v2/legends/players/...` - raw `player_stats` documents
- `GET /v2/search/...` - raw search result documents
- `GET /v2/server/:id/settings`, `/logs`, `/channels`, `/bans`, `/strikes` - raw database documents

  ---

## What Remains To Do

### 1. Complete V1 Python-to-Go migration

| Priority | File | Lines | Notes |
  |---|---|---|---|
| High | `routers/v1/stats.py` | 853 | Largest file - complex analytics pipeline queries |
| High | `routers/v1/player.py` | 648 | Core player data, overlap with Go handlers needs diffing |
| Medium | `routers/v1/giveaway.py` | 300 | Feature already exists in V2 Go - port V1 variant |
| Medium | `routers/v1/utility.py` | 225 | Utility helpers not yet covered |
| Medium | `routers/v1/internal.py` | 155 | Internal bot-facing endpoints |
| Medium | `routers/v1/rosters.py` | 165 | Already migrated in V2, port the V1 wrappers |
| Low | `routers/v1/leaderboards.py` | 103 | Partially covered by existing Go routes |
| Low | Small files under 100 lines | - | `ranking.py`, `legends.py`, `server_info.py`, `leagues.py`, `redirect.py`, `game_data.py` |
| Skip | Placeholders | 0-1 | `helper.py`, `xlsx.py`, `hidden.py` - empty files |

### 2. Complete V2 Python-to-Go migration

- Finish `routers/v2/tracking.py` - add missing endpoints to `routes/tracking.go`
- Implement `routers/v2/pl.py` (legend players) fully in Go
- Wire up and verify the `config.py` stub already present in Go

### 3. Create a CoC API type package

Create `internal/models/coc/` with structs mirroring the Clash of Clans API response schema.
This would unlock typed responses for all raw MongoDB pass-through endpoints.

Suggested structure:

internal/models/coc/
clan.go      - Clan, ClanMember, BadgeURL, League, Location, ...
player.go    - Player, Hero, Troop, Spell, Achievement, ...
war.go       - War, WarMember, Attack, ...
cwl.go       - CWLGroup, CWLRound, CWLClan, ...
capital.go   - RaidWeekend, RaidMember, District, ...
league.go    - League, LeagueSeason, ...

### 4. Swagger annotation cleanup

Once typed models are in place, update all godoc `@Success` annotations:

  ```go
  // Before
  // @Success 200 {object} map[string]interface{}

  // After
  // @Success 200 {object} modelsv2.ClanRankingResponse

  5. Consolidate duplicate helper functions

  The following helpers are copy-pasted across multiple route files and should be moved to internal/utils/:

  ┌─────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┐
  │                            Function                             │                         Duplicated in                          │
  ├─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ fixTag / clanFixTag / warFixTag / capitalFixTag                 │ v1/player.go, v1/clan.go, v2/clan.go, v2/war.go, v2/capital.go │
  ├─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ stripIDs / clanStripIDs / warStripIDs / legendsStripIDs         │ v1/clan.go, v2/clan.go, v2/war.go, v2/legends.go               │
  ├─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ parseIntDefault / clanParseIntDefault / activityParseIntDefault │ v1/clan.go, v2/clan.go, v2/activity.go, v2/capital.go          │
  └─────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────┘

  6. Generic paginated response wrapper

  Many endpoints return {"items": [...], "total": N, "limit": N, "offset": N} with no shared struct.
  A generic wrapper would standardize pagination across the API:

  // internal/models/common.go
  type ItemsResponse[T any] struct {
      Items []T `json:"items"`
  }

  type PaginatedResponse[T any] struct {
      Items  []T `json:"items"`
      Total  int `json:"total"`
      Limit  int `json:"limit,omitempty"`
      Offset int `json:"offset,omitempty"`
  }

  ---
  File Structure Reference

  internal/
    models/
      v1/
        capital.go              - V1CapitalClanTagsBody (original)
        player.go               - PlayerStatsResponse, PlayerLegendsResponse, PlayerLootedData
        war.go                  - CWLRankingEntry, CWLRankingRounds
      v2/
        accounts.go             - account request/response models
        activity_responses.go   - GuildSummaryResponse, InactivePlayersResponse, Capital*
        auth.go                 - AuthResponse, AuthUserInfo, all auth request models
        autoboards.go           - AutoBoard models
        bans.go                 - BanRequest
        clan.go                 - ClanTagsBody, ClanPlayerTagsBody
        clan_responses.go       - ClanRankingResponse, BoardTotalsResponse, DonationEntry, ClanCompositionResponse
        countdowns.go           - Countdown models
        dates_responses.go      - CurrentDatesResponse, SeasonBoundsResponse
        family_roles.go         - FamilyRole models
        giveaways.go            - Giveaway models
        guilds.go               - GuildInfo, GuildDetails
        legends_responses.go    - GuildStatsResponse, DailyTrackingResponse and sub-structs
        logs.go                 - ClanLog models
        mobile.go               - MobilePlayerTagsRequest
        player.go               - PlayerTagsRequest, Player* response models
        reminders.go            - Reminder models
        roles.go                - Role models
        server.go               - Server models
        server_clans.go         - AddClanRequest, ClanSettings models
        settings.go             - ServerSettingsUpdate, ServerSettingsResponse
        strikes.go              - StrikeRequest, StrikeSummaryResponse
        tickets.go              - Ticket panel/button models
        tracking.go             - TrackingPlayerListRequest
        war.go                  - WarClanTagsBody, WarPlayersBody
        war_responses.go        - CWLThresholdItem, CWLRankingHistoryItem, WarStatsItem, WarSummaryResponse
    routes/
      v1/                       - Go V1 route handlers
      v2/                       - Go V2 route handlers
        server/                 - Go V2 server-scoped route handlers
  routers/
    v1/                         - Python V1 routers (~3800 lines remaining to migrate)
    v2/                         - Python V2 routers (~4 files remaining to migrate)