import coc
import hikari
import linkd

from fastapi import Request, Response, HTTPException, Depends
from fastapi import APIRouter, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Annotated, List, Optional
from datetime import timedelta, datetime
from utils.utils import remove_id_fields
from utils.database import MongoClient, OldMongoClient
from utils.security import check_authentication
from utils.config import Config
from utils.custom_coc import CustomClashClient
from utils.sentry_utils import capture_endpoint_errors
from .legends_models import (
    GuildLegendsStats,
    ClanLegendsStats,
    LegendsDailyTrackingResponse,
    PlayerDailyTracking,
    DailyTrackingData
)

config = Config()
security = HTTPBearer()

router = APIRouter(prefix="/v2", tags=["Bot Legends Endpoints"], include_in_schema=False)


@router.get("/legends/players/day/{day}",
            name="Get legends stats for a specific day")
@linkd.ext.fastapi.inject
@capture_endpoint_errors
async def legend_stats_day(
    day: str,
    players: Annotated[List[str], Query()],
    *,
    mongo: MongoClient
):
    """
    Get legends statistics for players on a specific day.

    Public endpoint - no authentication required.
    """

    pipeline = [
        {
            "$match": {"tag": {"$in": players}}
        },
        {
            "$project": {
                "name": 1,
                "townhall": 1,
                "legends.streak": 1,
                f"legends.{day}": 1,
                "tag": 1,
                "_id": 0
            }
        },
        {
            "$lookup": {
                "from": "leaderboard_db",
                "localField": "tag",
                "foreignField": "tag",
                "as": "leaderboard_data"
            }
        },
        {
            "$unwind": {
                "path": "$leaderboard_data",
                "preserveNullAndEmptyArrays": True
            }
        },
        {
            "$lookup": {
                "from": "legend_rankings",
                "localField": "tag",
                "foreignField": "tag",
                "as": "global_ranking_data"
            }
        },
        {
            "$unwind": {
                "path": "$global_ranking_data",
                "preserveNullAndEmptyArrays": True
            }
        },
        {
            "$addFields": {
                "leaderboard_data": {"$ifNull": ["$leaderboard_data", {}]},
                "global_ranking_data": {"$ifNull": ["$global_ranking_data", {}]}
            }
        }
    ]

    # Execute the aggregation
    combined_data = await mongo.player_stats.aggregate(pipeline).to_list(length=None)

    return remove_id_fields(combined_data)


@router.get("/legends/players/season/{season}",
            name="Get legends stats for a specific season")
@linkd.ext.fastapi.inject
@capture_endpoint_errors
async def legend_stats_season(
    season: str,
    players: Annotated[List[str], Query()],
    *,
    mongo: MongoClient
):
    """
    Get legends statistics for players for an entire season.

    Public endpoint - no authentication required.
    """
    pipeline = [
        {
            "$match": {"tag": {"$in": players}}
        },
        {
            "$project": {
                "name": 1,
                "townhall": 1,
                "legends": 1,
                "tag": 1,
                "_id": 0
            }
        },
        {
            "$lookup": {
                "from": "leaderboard_db",
                "localField": "tag",
                "foreignField": "tag",
                "as": "leaderboard_data"
            }
        },
        {
            "$unwind": {
                "path": "$leaderboard_data",
                "preserveNullAndEmptyArrays": True
            }
        },
        {
            "$lookup": {
                "from": "legend_rankings",
                "localField": "tag",
                "foreignField": "tag",
                "as": "global_ranking_data"
            }
        },
        {
            "$unwind": {
                "path": "$global_ranking_data",
                "preserveNullAndEmptyArrays": True
            }
        },
        {
            "$addFields": {
                "leaderboard_data": {"$ifNull": ["$leaderboard_data", {}]},
                "global_ranking_data": {"$ifNull": ["$global_ranking_data", {}]}
            }
        }
    ]

    # Execute the aggregation
    combined_data = await mongo.player_stats.aggregate(pipeline).to_list(length=None)
    year, month = season.split('-')
    season_start = coc.utils.get_season_start(month=int(month) - 1, year=int(year))
    season_end = coc.utils.get_season_end(month=int(month) - 1, year=int(year))
    delta = season_end - season_start
    days = [season_start + timedelta(days=i) for i in range(delta.days)]
    days = set([day.strftime('%Y-%m-%d') for day in days])

    for player in combined_data:
        player['streak'] = player.get('legends', {}).get('streak', 0)
        new_data = {}
        for key, value in player.get("legends", {}).items():
            if key not in days:
                continue
            if 'new_defenses' in value or 'new_attacks' in value:
                value["defenses"] = value.pop('new_defenses', [])
                value["attacks"] = value.pop('new_attacks', [])
            new_data[key] = value
        player['legends'] = new_data
    return remove_id_fields(combined_data)


@router.get("/legends/guild-stats",
            name="Get guild legends statistics",
            response_model=GuildLegendsStats,
            include_in_schema=True)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_guild_legends_stats(
        guild_id: int,
        season: Optional[str] = None,
        limit_top_players: int = 10,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp,
        coc_client: CustomClashClient
) -> GuildLegendsStats:
    """
    Get aggregate legend statistics for a guild.

    Provides server-wide legends statistics including:
    - Total players in legends league
    - Average trophies across all players
    - Top performing players
    - Clan-by-clan breakdown

    Args:
        guild_id: Discord server ID
        season: Optional season (format: YYYY-MM). If not provided, uses current season
        limit_top_players: Number of top players to include (default 10)

    Returns:
        Comprehensive legends statistics for the guild
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": guild_id}).to_list(length=None)
    if not clans:
        return GuildLegendsStats(
            guild_id=guild_id,
            season=season,
            total_players_in_legends=0,
            total_clans=0,
            average_trophies=0.0,
            total_trophies=0,
            top_players=[],
            clans=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Collect all players in legends league
    all_players = []
    clan_stats = []

    for clan_tag in clan_tags:
        try:
            # Fetch current clan data
            clan = await coc_client.get_clan(clan_tag)

            # Filter players in legends league
            legends_players = [member for member in clan.members if
                               member.league and member.league.name == "Legend League"]

            if not legends_players:
                continue

            # Calculate clan statistics
            total_trophies_clan = sum(p.trophies for p in legends_players)
            avg_trophies_clan = total_trophies_clan / len(legends_players) if legends_players else 0.0
            highest_trophies_clan = max(p.trophies for p in legends_players) if legends_players else 0
            lowest_trophies_clan = min(p.trophies for p in legends_players) if legends_players else 0

            # Get attack/defense stats from player_stats collection
            player_tags = [p.tag for p in legends_players]
            player_stats = await OldMongoClient.player_stats.find(
                {"tag": {"$in": player_tags}}
            ).to_list(length=None)

            # Map player stats
            player_stats_map = {p["tag"]: p for p in player_stats}

            total_attacks = 0
            total_defenses = 0

            for player in legends_players:
                stats = player_stats_map.get(player.tag, {})
                legends_data = stats.get("legends", {})

                # Count attacks and defenses from current season
                if season:
                    # Get specific season data
                    year, month = season.split('-')
                    season_start = coc.utils.get_season_start(month=int(month) - 1, year=int(year))
                    season_end = coc.utils.get_season_end(month=int(month) - 1, year=int(year))
                    delta = season_end - season_start
                    days = [season_start + timedelta(days=i) for i in range(delta.days)]
                    days_set = set([day.strftime('%Y-%m-%d') for day in days])

                    for day_key, day_data in legends_data.items():
                        if day_key in days_set and isinstance(day_data, dict):
                            attacks = day_data.get('attacks', day_data.get('new_attacks', []))
                            defenses = day_data.get('defenses', day_data.get('new_defenses', []))
                            if isinstance(attacks, list):
                                total_attacks += len(attacks)
                            if isinstance(defenses, list):
                                total_defenses += len(defenses)
                else:
                    # Use current/latest data
                    for day_data in legends_data.values():
                        if isinstance(day_data, dict):
                            attacks = day_data.get('attacks', day_data.get('new_attacks', []))
                            defenses = day_data.get('defenses', day_data.get('new_defenses', []))
                            if isinstance(attacks, list):
                                total_attacks += len(attacks)
                            if isinstance(defenses, list):
                                total_defenses += len(defenses)

                # Add to all players list
                all_players.append({
                    "tag": player.tag,
                    "name": player.name,
                    "trophies": player.trophies,
                    "townhall": player.town_hall,
                    "clan_tag": clan_tag,
                    "clan_name": clan_name_map.get(clan_tag, clan.name)
                })

            avg_attacks = total_attacks / len(legends_players) if legends_players else 0.0
            avg_defenses = total_defenses / len(legends_players) if legends_players else 0.0

            clan_stats.append(ClanLegendsStats(
                clan_tag=clan_tag,
                clan_name=clan_name_map.get(clan_tag, clan.name),
                total_players_in_legends=len(legends_players),
                average_trophies=avg_trophies_clan,
                total_trophies=total_trophies_clan,
                highest_trophies=highest_trophies_clan,
                lowest_trophies=lowest_trophies_clan,
                total_attacks=total_attacks,
                total_defenses=total_defenses,
                average_attacks_per_player=avg_attacks,
                average_defenses_per_player=avg_defenses
            ))

        except coc.NotFound:
            continue
        except Exception as e:
            print(f"Error fetching clan {clan_tag}: {e}")
            continue

    # Calculate guild-wide statistics
    total_players = len(all_players)
    total_trophies = sum(p["trophies"] for p in all_players)
    avg_trophies = total_trophies / total_players if total_players > 0 else 0.0

    # Get top players
    top_players = sorted(all_players, key=lambda p: p["trophies"], reverse=True)[:limit_top_players]

    return GuildLegendsStats(
        guild_id=guild_id,
        season=season,
        total_players_in_legends=total_players,
        total_clans=len(clan_stats),
        average_trophies=avg_trophies,
        total_trophies=total_trophies,
        top_players=top_players,
        clans=clan_stats
    )


@router.get("/legends/daily-tracking",
            name="Get legends daily tracking",
            response_model=LegendsDailyTrackingResponse,
            include_in_schema=True)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_legends_daily_tracking(
        guild_id: int,
        start_date: str,
        end_date: str,
        clan_tag: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> LegendsDailyTrackingResponse:
    """
    Get daily trophy progression for legends players.

    Tracks day-by-day trophy changes for players in legends league.

    Args:
        guild_id: Discord server ID
        start_date: Start date (format: YYYY-MM-DD)
        end_date: End date (format: YYYY-MM-DD)
        clan_tag: Optional specific clan to filter (defaults to all server clans)
        limit: Maximum number of players to return (default 100)
        offset: Number of players to skip for pagination (default 0)

    Returns:
        Daily tracking data for legends players
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get clans to check
    if clan_tag:
        clans = await mongo.clan_db.find({"server": guild_id, "tag": clan_tag}).to_list(length=None)
    else:
        clans = await mongo.clan_db.find({"server": guild_id}).to_list(length=None)

    if not clans:
        return LegendsDailyTrackingResponse(
            guild_id=guild_id,
            start_date=start_date,
            end_date=end_date,
            players=[],
            total_count=0
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Parse dates
    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Generate list of dates in range
    delta = end_dt - start_dt
    dates = [start_dt + timedelta(days=i) for i in range(delta.days + 1)]
    date_strings = [d.strftime('%Y-%m-%d') for d in dates]

    # Query player stats for players in these clans
    # First, get all current members of these clans
    player_tags_set = set()
    clan_map = {}

    # We need to query the player history to get clan associations over time
    # For simplicity, we'll use current clan membership
    pipeline = [
        {"$match": {"tag": {"$in": clan_tags}}},
        {"$project": {"tag": 1, "name": 1, "memberList": 1}}
    ]

    # Note: This assumes memberList is stored in clan_cache or similar collection
    # Adjust based on actual schema
    # For now, we'll query player_stats directly and filter

    # Build projection for legends data
    projection = {
        "tag": 1,
        "name": 1,
        "townhall": 1,
        "trophies": 1,
    }
    for date_str in date_strings:
        projection[f"legends.{date_str}"] = 1

    # Query player stats
    player_stats = await OldMongoClient.player_stats.find(
        {},
        projection
    ).to_list(length=None)

    # Filter players who have legends data in the date range
    players_with_data = []

    for player in player_stats:
        legends_data = player.get("legends", {})

        # Check if player has any data in the date range
        has_data = any(date_str in legends_data for date_str in date_strings)

        if not has_data:
            continue

        # Build daily tracking
        daily_data = []
        for date_str in date_strings:
            day_data = legends_data.get(date_str, {})

            if not day_data or not isinstance(day_data, dict):
                continue

            starting_trophies = day_data.get('start', 0)
            ending_trophies = day_data.get('end', 0)
            net_change = ending_trophies - starting_trophies

            attacks = day_data.get('attacks', day_data.get('new_attacks', []))
            defenses = day_data.get('defenses', day_data.get('new_defenses', []))

            attack_count = len(attacks) if isinstance(attacks, list) else 0
            defense_count = len(defenses) if isinstance(defenses, list) else 0

            # Count wins
            attack_wins = 0
            defense_wins = 0

            if isinstance(attacks, list):
                for attack in attacks:
                    if isinstance(attack, dict) and attack.get('stars', 0) >= 1:
                        attack_wins += 1

            if isinstance(defenses, list):
                for defense in defenses:
                    if isinstance(defense, dict) and defense.get('stars', 0) == 0:
                        defense_wins += 1

            daily_data.append(DailyTrackingData(
                date=date_str,
                starting_trophies=starting_trophies,
                ending_trophies=ending_trophies,
                net_change=net_change,
                attacks=attack_count,
                defenses=defense_count,
                attack_wins=attack_wins,
                defense_wins=defense_wins
            ))

        if daily_data:
            players_with_data.append(PlayerDailyTracking(
                player_tag=player["tag"],
                player_name=player["name"],
                clan_tag=None,  # Would need to look up current clan
                clan_name=None,
                townhall_level=player.get("townhall", 0),
                current_trophies=player.get("trophies", 0),
                daily_data=daily_data
            ))

    # Apply pagination
    total_count = len(players_with_data)
    paginated_players = players_with_data[offset:offset + limit]

    return LegendsDailyTrackingResponse(
        guild_id=guild_id,
        start_date=start_date,
        end_date=end_date,
        players=paginated_players,
        total_count=total_count
    )
