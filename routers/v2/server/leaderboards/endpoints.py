import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional

from utils.database import MongoClient
from utils.security import check_authentication
from utils.sentry_utils import capture_endpoint_errors
from utils.custom_coc import CustomClashClient
from .models import (
    PlayerLeaderboardEntry,
    ClanLeaderboardEntry,
    ServerLeaderboardResponse
)

security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Server Leaderboards"], include_in_schema=True)


@router.get("/{server_id}/leaderboards",
            name="Get server leaderboards",
            response_model=ServerLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_leaderboards(
        server_id: int,
        limit_players: int = Query(default=100, le=500, ge=1),
        limit_clans: int = Query(default=50, le=200, ge=1),
        sort_by: str = Query(default="global_rank", enum=["global_rank", "local_rank", "trophies", "legend_trophies"]),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp,
        coc_client: CustomClashClient
) -> ServerLeaderboardResponse:
    """
    Get comprehensive leaderboards for a Discord server.

    Returns top players and clans based on various ranking metrics.

    Args:
        server_id: Discord server ID
        limit_players: Maximum number of players to return (default 100, max 500)
        limit_clans: Maximum number of clans to return (default 50, max 200)
        sort_by: Sort criterion (global_rank, local_rank, trophies, legend_trophies)

    Returns:
        Leaderboards showing top players and clans from the server
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    if not clans:
        return ServerLeaderboardResponse(
            server_id=server_id,
            total_players=0,
            total_clans=0,
            players=[],
            clans=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    # Fetch player rankings from leaderboard_db
    player_rankings = await mongo.leaderboard_db.find(
        {"tag": {"$in": player_tags}}
    ).to_list(length=None)

    # Create map for quick lookup
    player_ranking_map = {p["tag"]: p for p in player_rankings}

    # Fetch player stats to get current info
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "trophies": 1, "clan": 1}
    ).to_list(length=None)

    # Build player leaderboard entries
    player_entries = []

    for player in player_stats:
        player_tag = player.get("tag")
        ranking = player_ranking_map.get(player_tag, {})

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = player_clan.get("name") if isinstance(player_clan, dict) else None

        entry = PlayerLeaderboardEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            trophies=player.get("trophies"),
            global_rank=ranking.get("global_rank"),
            local_rank=ranking.get("local_rank"),
            country_code=ranking.get("country_code"),
            country_name=ranking.get("country_name"),
            legend_trophies=ranking.get("legend_trophies")
        )

        player_entries.append(entry)

    # Sort players based on sort_by parameter
    if sort_by == "global_rank":
        # Sort by global rank (lower is better), None values go to end
        player_entries.sort(key=lambda x: (x.global_rank is None, x.global_rank or float('inf')))
    elif sort_by == "local_rank":
        player_entries.sort(key=lambda x: (x.local_rank is None, x.local_rank or float('inf')))
    elif sort_by == "trophies":
        player_entries.sort(key=lambda x: -(x.trophies or 0))
    elif sort_by == "legend_trophies":
        player_entries.sort(key=lambda x: -(x.legend_trophies or 0))

    # Limit players
    player_entries = player_entries[:limit_players]

    # Fetch clan rankings from clan_leaderboard_db
    clan_rankings = await mongo.clan_leaderboard_db.find(
        {"tag": {"$in": clan_tags}}
    ).to_list(length=None)

    clan_ranking_map = {c["tag"]: c for c in clan_rankings}

    # Fetch clan stats
    clan_stats_list = await mongo.clan_stats.find(
        {"tag": {"$in": clan_tags}}
    ).to_list(length=None)

    clan_stats_map = {c["tag"]: c for c in clan_stats_list}

    # Build clan leaderboard entries
    clan_entries = []

    for clan in clans:
        clan_tag = clan.get("tag")
        ranking = clan_ranking_map.get(clan_tag, {})
        stats = clan_stats_map.get(clan_tag, {})

        entry = ClanLeaderboardEntry(
            clan_tag=clan_tag,
            clan_name=clan.get("name", "Unknown"),
            clan_level=stats.get("level"),
            clan_points=stats.get("points"),
            member_count=stats.get("memberCount"),
            global_rank=ranking.get("global_rank"),
            local_rank=ranking.get("local_rank"),
            country_code=ranking.get("country_code"),
            country_name=ranking.get("country_name"),
            capital_points=stats.get("capitalPoints")
        )

        clan_entries.append(entry)

    # Sort clans by global rank
    clan_entries.sort(key=lambda x: (x.global_rank is None, x.global_rank or float('inf')))

    # Limit clans
    clan_entries = clan_entries[:limit_clans]

    return ServerLeaderboardResponse(
        server_id=server_id,
        total_players=len(player_stats),
        total_clans=len(clans),
        players=player_entries,
        clans=clan_entries
    )
