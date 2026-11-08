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

## Original league metadata

The response's nullable `league` identifies its `namespace` (`legacy` or `tier`),
original `id`, and any recorded `name` and `iconUrls`. Recorded names/icons take
precedence over the current tier catalog. Only a recorded tier ID can use the
matching tier-catalog fallback. A legacy ID is never resolved through that catalog.
The old `leagueTier` field remains compatible for an actually recorded tier.

The official ranking endpoint's category ID is not evidence of a player's original
league. Missing source IDs remain null. Tracking preserves the original `league`
and `leagueTier` objects before typed decoding can lose omitted fields. The legacy
importer also retains those objects when supplied, but it must not be run as an
incidental historical repair: that importer rebuilds its destination.

The authoritative schema is Goose migration `072_legend_history_source.sql` in
`clashking_schemas/database/timescale`. It adds nullable `league_id integer` and
`league_snapshot jsonb` columns to `legend_history`. The snapshot is an object
containing the recorded `league` and/or `leagueTier` source objects. Missing new
source fields do not erase retained metadata during upsert. Raw `season` is unchanged.

Apply migration 072 before releasing the updated writer or API. A reader/writer
rollback should retain both columns. Goose Down deliberately refuses to erase
populated source metadata; export/preserve it before any deliberate schema rollback.

## Time and population

`seasonStart` and `seasonEnd` are nullable UTC timestamps. Known monthly and
`v2-...` seasons use the established Legend calendar, including the September 2025
transition. Known unfinished seasons are excluded. Date-only legacy identifiers
with unproven boundary semantics remain raw with null bounds; unbounded history
retains them, while explicit `time[after]`/`time[before]` queries cannot match them.
For known seasons, the time filter compares the season end with the requested range.

`population` means the highest retained rank for that season. It is not a census
of every Legend player. The API uses a descending-rank lookup per requested season
against the existing `(season, rank)` index instead of aggregating all season rows.

Expo preserves the namespace, source icon URLs and nullable calendar bounds. Its
history screen prefers a recorded icon, then a matching recorded tier name. Unknown
metadata omits the badge; a date never implies Legend I. The screen displays only
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
