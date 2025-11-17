import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Annotated, Optional
from datetime import datetime

from utils.database import MongoClient, OldMongoClient
from utils.security import check_authentication
from utils.config import Config
from utils.utils import fix_tag
from utils.sentry_utils import capture_endpoint_errors
from .capital_models import (
    CapitalPlayerStatsResponse,
    PlayerRaidStats,
    RaidAttack,
    CapitalGuildLeaderboardResponse,
    ClanRaidLeaderboard
)

config = Config()
security = HTTPBearer()

router = APIRouter(prefix="/v2/capital", tags=["Capital Raids"], include_in_schema=True)


@router.get("/player-stats",
            name="Get capital player statistics",
            response_model=CapitalPlayerStatsResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_capital_player_stats(
    guild_id: int,
    clan_tags: Annotated[List[str], Query()],
    season: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> CapitalPlayerStatsResponse:
    """
    Get capital raid player statistics across specified clans.

    Aggregates raid stats by player including:
    - Total attacks and destruction
    - Capital gold looted and raid medals earned
    - Individual attack details

    Args:
        guild_id: Discord server ID
        clan_tags: List of clan tags to include
        season: Optional raid season (format: YYYY-MM). If not provided, returns current/latest season
        limit: Maximum number of players to return (default 100)
        offset: Number of players to skip for pagination (default 0)

    Returns:
        Player statistics aggregated across all specified clans
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Normalize clan tags
    normalized_tags = [fix_tag(tag) for tag in clan_tags]

    # Verify clans belong to this server
    clans = await mongo.clan_db.find({
        "server": guild_id,
        "tag": {"$in": normalized_tags}
    }).to_list(length=None)

    if not clans:
        raise HTTPException(status_code=404, detail="No clans found for this server")

    clan_tags_set = {clan["tag"] for clan in clans}
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Build query for raid weekends
    match_query = {"data.clan.tag": {"$in": list(clan_tags_set)}}

    if season:
        # Season format: YYYY-MM
        try:
            year, month = season.split('-')
            # Get raids for specific month/year
            start_date = datetime(int(year), int(month), 1)
            if int(month) == 12:
                end_date = datetime(int(year) + 1, 1, 1)
            else:
                end_date = datetime(int(year), int(month) + 1, 1)
            match_query["data.endTime"] = {
                "$gte": start_date.strftime("%Y%m%dT%H%M%S.000Z"),
                "$lt": end_date.strftime("%Y%m%dT%H%M%S.000Z")
            }
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid season format. Use YYYY-MM")

    # Aggregate player statistics from raid weekends
    pipeline = [
        {"$match": match_query},
        {"$unwind": "$data.members"},
        {
            "$group": {
                "_id": "$data.members.tag",
                "player_name": {"$first": "$data.members.name"},
                "clans": {"$addToSet": "$data.clan.tag"},
                "total_attacks": {"$sum": "$data.members.attacks"},
                "total_capital_gold_looted": {"$sum": "$data.members.capitalResourcesLooted"},
                "attacks_details": {"$push": "$data.members.attackLog"}
            }
        },
        {
            "$project": {
                "_id": 0,
                "player_tag": "$_id",
                "player_name": 1,
                "total_attacks": 1,
                "total_capital_gold_looted": 1,
                "clans": 1,
                "attacks_details": 1
            }
        },
        {"$sort": {"total_capital_gold_looted": -1}},
        {"$skip": offset},
        {"$limit": limit}
    ]

    # Execute aggregation
    results = await OldMongoClient.raid_weekend_db.aggregate(pipeline).to_list(length=None)

    # Get total count for pagination
    count_pipeline = [
        {"$match": match_query},
        {"$unwind": "$data.members"},
        {"$group": {"_id": "$data.members.tag"}},
        {"$count": "total"}
    ]
    count_result = await OldMongoClient.raid_weekend_db.aggregate(count_pipeline).to_list(length=1)
    total_count = count_result[0]["total"] if count_result else 0

    # Format response
    players = []
    for player_data in results:
        # Calculate average destruction and process attacks
        attacks = []
        total_destruction = 0.0

        for attack_log in player_data.get("attacks_details", []):
            if not attack_log:
                continue
            for attack in attack_log:
                if not attack:
                    continue
                attacks.append(RaidAttack(
                    attacker_tag=player_data["player_tag"],
                    attacker_name=player_data["player_name"],
                    defender_tag=attack.get("defenderTag"),
                    defender_name=attack.get("defenderName"),
                    destruction=attack.get("destructionPercent", 0),
                    stars=attack.get("stars", 0)
                ))
                total_destruction += attack.get("destructionPercent", 0)

        avg_destruction = total_destruction / len(attacks) if attacks else 0.0

        # Get primary clan (first one in list)
        primary_clan_tag = player_data["clans"][0] if player_data["clans"] else ""

        players.append(PlayerRaidStats(
            player_tag=player_data["player_tag"],
            player_name=player_data["player_name"],
            clan_tag=primary_clan_tag,
            clan_name=clan_name_map.get(primary_clan_tag, "Unknown"),
            total_attacks=player_data["total_attacks"],
            total_destruction=total_destruction,
            total_capital_gold_looted=player_data["total_capital_gold_looted"],
            total_raid_medals=0,  # Raid medals are not tracked in attack logs
            average_destruction=avg_destruction,
            attacks=attacks
        ))

    return CapitalPlayerStatsResponse(
        season=season,
        players=players,
        total_count=total_count,
        limit=limit,
        offset=offset
    )


@router.get("/guild-leaderboard",
            name="Get capital guild leaderboard",
            response_model=CapitalGuildLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_capital_guild_leaderboard(
    guild_id: int,
    season: Optional[str] = None,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> CapitalGuildLeaderboardResponse:
    """
    Get server-specific capital raid leaderboard.

    Shows aggregate statistics for all clans in the server including:
    - Total raids participated
    - Capital gold looted and raid medals earned
    - Average performance metrics

    Args:
        guild_id: Discord server ID
        season: Optional raid season (format: YYYY-MM). If not provided, returns current/latest season

    Returns:
        Leaderboard of clans ranked by capital gold looted
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": guild_id}).to_list(length=None)
    if not clans:
        return CapitalGuildLeaderboardResponse(
            guild_id=guild_id,
            season=season,
            clans=[],
            total_count=0
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Build query for raid weekends
    match_query = {"data.clan.tag": {"$in": clan_tags}}

    if season:
        try:
            year, month = season.split('-')
            start_date = datetime(int(year), int(month), 1)
            if int(month) == 12:
                end_date = datetime(int(year) + 1, 1, 1)
            else:
                end_date = datetime(int(year), int(month) + 1, 1)
            match_query["data.endTime"] = {
                "$gte": start_date.strftime("%Y%m%dT%H%M%S.000Z"),
                "$lt": end_date.strftime("%Y%m%dT%H%M%S.000Z")
            }
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid season format. Use YYYY-MM")

    # Aggregate clan statistics
    pipeline = [
        {"$match": match_query},
        {
            "$group": {
                "_id": "$data.clan.tag",
                "total_raids": {"$sum": 1},
                "total_capital_gold_looted": {"$sum": "$data.capitalTotalLoot"},
                "total_raid_medals": {"$sum": "$data.totalRaidMedals"},
                "total_attacks": {"$sum": "$data.attackLog.attackCount"},
                "total_destruction": {"$sum": "$data.destructionPercent"}
            }
        },
        {
            "$project": {
                "_id": 0,
                "clan_tag": "$_id",
                "total_raids": 1,
                "total_capital_gold_looted": 1,
                "total_raid_medals": 1,
                "total_attacks": 1,
                "average_capital_gold_per_raid": {
                    "$cond": [
                        {"$eq": ["$total_raids", 0]},
                        0,
                        {"$divide": ["$total_capital_gold_looted", "$total_raids"]}
                    ]
                },
                "average_raid_medals_per_raid": {
                    "$cond": [
                        {"$eq": ["$total_raids", 0]},
                        0,
                        {"$divide": ["$total_raid_medals", "$total_raids"]}
                    ]
                },
                "average_destruction": {
                    "$cond": [
                        {"$eq": ["$total_attacks", 0]},
                        0,
                        {"$divide": ["$total_destruction", "$total_attacks"]}
                    ]
                }
            }
        },
        {"$sort": {"total_capital_gold_looted": -1}}
    ]

    results = await OldMongoClient.raid_weekend_db.aggregate(pipeline).to_list(length=None)

    # Format response
    clan_leaderboard = []
    for clan_data in results:
        clan_leaderboard.append(ClanRaidLeaderboard(
            clan_tag=clan_data["clan_tag"],
            clan_name=clan_name_map.get(clan_data["clan_tag"], "Unknown"),
            total_raids=clan_data["total_raids"],
            total_capital_gold_looted=clan_data["total_capital_gold_looted"],
            total_raid_medals=clan_data["total_raid_medals"],
            average_capital_gold_per_raid=clan_data["average_capital_gold_per_raid"],
            average_raid_medals_per_raid=clan_data["average_raid_medals_per_raid"],
            total_attacks=clan_data["total_attacks"],
            average_destruction=clan_data["average_destruction"]
        ))

    return CapitalGuildLeaderboardResponse(
        guild_id=guild_id,
        season=season,
        clans=clan_leaderboard,
        total_count=len(clan_leaderboard)
    )
