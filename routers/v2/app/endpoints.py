import asyncio
from typing import Any, Dict, List
import aiohttp
import pendulum as pend
from fastapi import HTTPException, APIRouter, Request

from routers.v2.clan.endpoints import get_clans_stats, get_clans_capital_raids
from routers.v2.clan.models import ClanTagsRequest, RaidsRequest
from routers.v2.player.models import PlayerTagsRequest
from routers.v2.player.utils import get_legend_stats_common, assemble_full_player_data, fetch_full_player_data
from routers.v2.war.endpoints import get_multiple_clan_war_summary, clan_warhits_stats, players_warhits_stats
from routers.v2.war.models import PlayerWarhitsFilter, ClanWarHitsFilter
from utils.utils import fix_tag, remove_id_fields
from utils.database import MongoClient as mongo
from utils.config import Config
from fastapi import Depends
from utils.auth_utils import get_current_user

# Constants
PREPARATION_START_TIME_FIELD = "data.preparationStartTime"

router = APIRouter(prefix="/v2/app", tags=["Mobile App"], include_in_schema=True)


@router.get("/public-config", name="Get public app configuration")
async def get_public_config() -> Dict[str, Any]:
    """
    Get non-sensitive configuration values needed by the mobile app.
    No authentication required - only returns safe, public config values.
    """
    return {
        "sentry_dsn": Config.APP_SENTRY_DSN,
    }

async def app_player_war_stats(body: PlayerTagsRequest) -> Dict[str, Any]:
    """Use existing war endpoint with mobile app defaults"""
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")
    
    # Create filter with same defaults as mobile app (last 6 months, limit 50)
    mongo_filter = PlayerWarhitsFilter(
        player_tags=body.player_tags,
        timestamp_start=int(pend.now().subtract(months=6).timestamp()),
        timestamp_end=int(pend.now().timestamp()),
        limit=50
    )
    
    # Use the existing proven endpoint
    from fastapi import Request
    request = Request({"type": "http", "method": "POST", "headers": []})
    return await players_warhits_stats(mongo_filter, request)


@router.post("/initialization", name="Initialize all account data for mobile app")
async def app_initialization(body: PlayerTagsRequest, request: Request) -> Dict[str, Any]:
    """
    Mobile app initialization endpoint that calls the existing 8 individual endpoints in parallel.
    This guarantees the same data as individual calls but with bulk performance optimized for mobile.
    
    Replaces 8 sequential mobile API calls with 8 parallel server-side calls.
    """
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]
    
    async def fetch_clan_war_logs(input_clan_tags: List[str]) -> List[Dict[str, Any]]:
        """Fetch war logs using same logic as mobile app - direct API calls"""
        async def fetch_clan_war_log(http_session: aiohttp.ClientSession, clan_tag: str) -> Dict[str, Any]:
            url = f"https://proxy.clashk.ing/v1/clans/{clan_tag.replace('#', '%23')}/warlog"
            async with http_session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return {"clan_tag": clan_tag, "items": data.get("items", [])}
                return {"clan_tag": clan_tag, "items": []}

        async with aiohttp.ClientSession() as war_session:
            return await asyncio.gather(*(fetch_clan_war_log(war_session, tag) for tag in input_clan_tags))
    
    async def fetch_clan_war_stats(input_clan_request: ClanTagsRequest) -> Dict[str, Any]:
        """Fetch clan war stats using existing endpoint"""
        mongo_filter = ClanWarHitsFilter(
            clan_tags=input_clan_request.clan_tags,
            timestamp_start=int(pend.now().subtract(months=6).timestamp()),
            timestamp_end=int(pend.now().timestamp()),
            limit=50
        )
        return await clan_warhits_stats(mongo_filter)
    
    # Get both basic and extended player data
    async def fetch_players_basic_and_extended():
        # Fetch basic API data for clan information
        async with aiohttp.ClientSession() as session:
            from routers.v2.player.utils import fetch_player_api_data
            fetch_tasks = [fetch_player_api_data(session, tag) for tag in player_tags]
            api_results = await asyncio.gather(*fetch_tasks)

        basic_result = []
        for tag, data in zip(player_tags, api_results):
            if isinstance(data, HTTPException):
                if data.status_code == 503 or data.status_code == 500:
                    raise data
                else:
                    continue
            if data:
                basic_result.append({
                    "tag": tag,
                    **data
                })

        # Fetch extended player data with MongoDB tracking stats
        # Fetch MongoDB player_stats in bulk
        players_info = await mongo.player_stats.find(
            {"tag": {"$in": player_tags}},
            {
                "_id": 0,
                "tag": 1,
                "donations": 1,
                "clan_games": 1,
                "season_pass": 1,
                "activity": 1,
                "last_online": 1,
                "last_online_time": 1,
                "attack_wins": 1,
                "dark_elixir": 1,
                "gold": 1,
                "capital_gold": 1,
                "season_trophies": 1,
                "last_updated": 1
            }
        ).to_list(length=None)

        mongo_data_dict = {player["tag"]: player for player in players_info}

        # Load legends data in bulk
        legends_data = await get_legend_stats_common(player_tags)
        tag_to_legends = {entry["tag"]: entry["legends_by_season"] for entry in legends_data}

        # Fetch extended data per player in parallel
        async with aiohttp.ClientSession() as session:
            fetch_tasks = [
                fetch_full_player_data(
                    session,
                    tag,
                    mongo_data_dict.get(tag, {}),
                    None  # clan_tag - we'll get from basic data
                )
                for tag in player_tags
            ]

            player_results = await asyncio.gather(*fetch_tasks)

        # Assemble enriched player data in parallel
        extended_results = await asyncio.gather(*[
            assemble_full_player_data(tag, raid_data, war_data, mongo_data, tag_to_legends)
            for tag, raid_data, war_data, mongo_data in player_results
        ])
        
        # Remove MongoDB _id fields from extended results
        extended_results = remove_id_fields(extended_results)

        return {"basic": basic_result, "extended": extended_results}
    
    players_data = await fetch_players_basic_and_extended()
    players_basic = players_data["basic"]
    players_extended = players_data["extended"]
    
    # Extract clan tags from player data
    clan_tags = set()
    for player in players_basic:
        if player and player.get("clan") and player["clan"].get("tag"):
            clan_tag = str(player["clan"]["tag"])  # Ensure string type
            if clan_tag:  # Only add non-empty strings
                clan_tags.add(clan_tag)
    
    clan_tags_list = list(clan_tags)  # Now guaranteed to be List[str]

    if not clan_tags_list:
        # No clans found, return player data only with proper empty structure
        war_stats_result = await app_player_war_stats(body)
        return {
            "players": players_basic,
            "players_basic": players_basic,
            "clans": {
                "clan_details": {},
                "clan_stats": {},
                "war_data": [],
                "join_leave_data": {},
                "capital_data": [],
                "war_log_data": [],
                "clan_war_stats": [],
                "cwl_data": []
            },
            "war_stats": war_stats_result.get("items", []),
            "clan_tags": [],
            "metadata": {
                "total_players": len(player_tags),
                "total_clans": 0,
                "fetch_time": "endpoint_calls"
            }
        }
    
    # Execute all clan-related calls in parallel (all 8 original calls)
    clan_request = ClanTagsRequest(clan_tags=clan_tags_list)
    raids_request = RaidsRequest(clan_tags=clan_tags_list, limit=10)
    
    async def fetch_clan_join_leave_data(input_clan_tags: List[str]) -> Dict[str, Any]:
        """Fetch join/leave data for clans using unified function"""
        from routers.v2.clan.endpoints import get_multiple_clan_join_leave
        return await get_multiple_clan_join_leave(
            clan_tags=input_clan_tags,
            request=request,
            programmatic_filters=None  # Will use default current season filters
        )
    
    # Execute API calls that return Dict[str, Any]
    api_results = await asyncio.gather(
        app_player_war_stats(body),
        get_clans_stats(request, clan_request),
        fetch_clan_join_leave_data(clan_tags_list),
        get_clans_capital_raids(request, raids_request),
        get_multiple_clan_war_summary(clan_request, request),
        fetch_clan_war_stats(clan_request)
    )
    
    # Execute call that returns List[Dict[str, Any]]
    clan_war_log_result = await fetch_clan_war_logs(clan_tags_list)
    
    # Unpack the API results
    (
        war_stats_result,
        clan_details_result,
        clan_join_leave_result,
        clan_capital_result,
        war_summary_result_raw,
        clan_war_stats_result
    ) = api_results
    
    # Extract content from JSONResponse if needed
    from fastapi.responses import JSONResponse
    if isinstance(war_summary_result_raw, JSONResponse):
        import json
        war_summary_result = json.loads(war_summary_result_raw.body.decode())
    else:
        war_summary_result = war_summary_result_raw
    
    # Structure the response with all required data
    return {
        "players": players_extended,
        "players_basic": players_basic,
        "clans": {
            "clan_details": {item.get("tag", ""): item for item in clan_details_result.get("items", []) if item},
            "clan_stats": {},  # To do
            "war_data": war_summary_result.get("items", []),
            "join_leave_data": {item.get("clan_tag", ""): item for item in clan_join_leave_result.get("items", [])},
            "capital_data": clan_capital_result.get("items", []),
            "war_log_data": clan_war_log_result,
            "clan_war_stats": clan_war_stats_result.get("items", []),
        },
        "war_stats": war_stats_result.get("items", []),
        "clan_tags": clan_tags_list,
        "metadata": {
            "total_players": len(player_tags),
            "total_clans": len(clan_tags_list),
            "fetch_time": "endpoint_calls"
        }
    }