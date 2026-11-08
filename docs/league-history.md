# League history contracts and storage

## Consumer routes

| Route | Contents | Consumer contract |
| --- | --- | --- |
| `GET /v2/player/:tag/legend-history` | Observed Legend season rankings | Existing Bot endpoint; Expo `PlayerLegendHistoryEndpoint` is an alias to this same route |
| `GET /v2/player/:playerTag/ranked/history` | Ranked tournament history, without a mixed-mode discriminator | `PlayerRankedHistoryEndpoint` |
| `GET /v2/player/:playerTag/league/history` | Legend and Ranked history with the existing `mode` discriminator | Retained compatibility surface |

The single-player Legend route, initialization batch, season leaderboard and
mixed compatibility route share `workers/api/src/legend-history.ts`. The app
loads Legend history directly rather than fetching mixed history and filtering
it afterward. No third Legend route or duplicate source table is introduced.

## Existing storage and season systems

`legend_history` remains unchanged. Its existing `season` and `league_tier_id`
columns are sufficient for this split. No migration, new columns, snapshots or
historical rewrite are required.

Monthly source identifiers (`YYYY-MM`) identify the original single Legend league.
Dated identifiers on the newer 28-day calendar (`YYYY-MM-DD`) and official `v2-...`
identifiers identify the newer Legend system. The API interprets the existing
stored tier ID in that context. It never uses a legacy monthly ID to reconstruct
one of today's tiers. A reused ranking-category ID is not resolved as an unrelated
current Ranked tier.

The nullable response `league` describes that interpretation using `namespace`
(`legacy` or `tier`), `id` and a known name. The existing `leagueTier` compatibility
field remains only for dated/tier records. Missing or unrecognized metadata does
not invent a specific current tier. The API cannot return original source icons
or labels that were never stored. There is no new Tracking history writer or
importer change in this release, and the destructive one-shot importer must not be
run incidentally.

## Time and population

`seasonStart` and `seasonEnd` are nullable UTC timestamps. Known monthly and
`v2-...` seasons use the established Legend calendar, including the September 2025
transition. Known unfinished seasons are excluded. Date-only identifiers on established 28-day boundaries use that calendar.
Unrecognized identifiers remain raw with null bounds; unbounded history retains
them, while explicit `time[after]`/`time[before]` queries cannot match them.
For known seasons, the time filter compares the season end with the requested range.

`population` means the highest retained rank for that season. It is not a census
of every Legend player. The API uses a descending-rank lookup per requested season
against the existing `(season, rank)` index instead of aggregating all season rows.

Expo preserves the interpreted namespace and nullable calendar bounds. Its
history screen uses the matching known league name; the original monthly system
uses the original Legend badge. Unknown tiers never become Legend I. The screen displays only
API-proven date bounds, or the unchanged raw identifier when bounds are unknown.

## CWL is a separate history

Roster metric `cwl.performance_history` reads completed CWL war archives using CWL
group round identities. CWL season selection does not use the Legend calendar or
the month in which a delayed round ended.

| Parameter | Meaning |
| --- | --- |
| `season: "YYYY-MM"` | Exactly that historical CWL season; cannot be combined with `windowMonths` or `seasonCount` |
| `windowMonths: 1..24` | Calendar CWL months including the current month; missing months are not filled from older history |
| `seasonCount: 1..24` | Each player's latest observed participated seasons; default 6 |
| `familyOnly: true` | Player's historical side must be one of the server's currently configured family clans |

A zero-attack completed lineup counts as participation and a missed attack.
Bench-only registration does not. `attackDestruction` is the sum of attack
percentages, so it can exceed 100. `averageStarsPerWar` includes missed lineup
slots; `averageStars` uses attacks made. Historical clan/CWL league labels come
from the observed side/group, rather than the player's current clan or Ranked league.
Coverage is observed completed lineups; late-attack timing is unavailable.

## Local verification

`scripts/e2e/legend-day-performance.mjs` invokes the actual league-history check
against a local Worker and disposable Goose-migrated Timescale database. Set
`CLASHKING_E2E_APP_REPO` to include the actual Expo loader/presentation check.
`scripts/e2e/roster-assistant.mjs` verifies exact CWL season selection, cross-month
rounds, historical clan/league labels, rich-cell ordering and reusable view output.
These checks do not call OpenAI or perform production mutations. Local passing
checks do not imply a deployed API, published package, or app OTA.
