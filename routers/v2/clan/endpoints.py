import asyncio

import aiohttp
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException, Depends
from fastapi import APIRouter, Request
from routers.v2.clan.models import ClanTagsRequest, JoinLeaveQueryParams, RaidsRequest
from routers.v2.clan.utils import filter_leave_join, extract_join_leave_pairs, filter_join_leave, generate_stats, \
    generate_raids_clan_stats, predict_rewards
from utils.utils import fix_tag, remove_id_fields
from utils.time import gen_season_date, gen_raid_date, season_start_end
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2", tags=["Clan"], include_in_schema=True)


@router.get("/clan/{clan_tag}/ranking",
            name="Get ranking of a clan")
async def clan_ranking(clan_tag: str, request: Request):
    clan_ranking = await mongo.clan_leaderboard_db.find_one({'tag': fix_tag(clan_tag)})

    fallback = {
        "tag": "#L0J9RURP",
        "global_rank": None,
        "country_code": None,
        "country_name": None,
        "local_rank": None
    }

    return remove_id_fields(clan_ranking) or fallback


@router.get("/clan/{clan_tag}/board/totals")
async def clan_board_totals(clan_tag: str, request: Request, body: PlayerTagsRequest):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]
    previous_season, season = gen_season_date(num_seasons=2)

    player_stats = await mongo.player_stats.find(
        {'tag': {'$in': player_tags}},
        {"tag": 1, "capital_gold": 1, "last_online_times": 1}
    ).to_list(length=None)

    clan_stats = await mongo.clan_stats.find_one({'tag': fix_tag(clan_tag)})

    clan_games_points = 0
    total_donated = 0
    total_received = 0
    if clan_stats:
        for s in [season, previous_season]:
            for tag, data in clan_stats.get(s, {}).items():
                # i forget why, but it can be None sometimes, so fallover to zero if that happens
                clan_games_points += data.get('clan_games', 0) or 0
            if clan_games_points != 0:
                # if it is zero, likely means CG hasn't happened this season, so check the previous
                # eventually add a real check
                break
        for tag, data in clan_stats.get(season, {}).items():
            total_donated += data.get('donated', 0)
            total_received += data.get('received', 0)

    donated_cc = 0
    for date in gen_raid_date(num_weeks=4):
        donated_cc += sum(
            [
                sum(player.get(f'capital_gold', {}).get(f'{date}', {}).get('donate', []))
                for player in player_stats
            ]
        )

    now = pend.now(tz=pend.UTC)
    thirty_days_ago = now.subtract(days=30)
    forty_eight_hours_ago = now.subtract(hours=48)

    time_add = defaultdict(set)
    recent_active = set()

    for player in player_stats:
        for season_key in [season, previous_season]:
            for timestamp in player.get('last_online_times', {}).get(season_key, []):
                date = pend.from_timestamp(timestamp)

                # Only keep dates within the last 30 days
                if date >= thirty_days_ago:
                    time_add[date.date()].add(player.get("tag"))

                # Track players active in the last 48 hours
                if date >= forty_eight_hours_ago:
                    recent_active.add(player.get("tag"))

    num_players_day = [len(players) for players in time_add.values()]
    total_players = sum(num_players_day)
    avg_players = int(total_players / len(num_players_day)) if num_players_day else 0
    total_active_48h = len(recent_active)

    return {
        "tag": clan_tag,
        "tracked_player_count": len(player_stats),
        "clan_games_points": clan_games_points,
        "troops_donated": total_donated,
        "troops_received": total_received,
        "clan_capital_donated": donated_cc,
        "activity": {
            "per_day": avg_players,
            "last_48h": total_active_48h,
            "score": total_players
        }
    }


@router.post("/clans/details", name="Get full stats for a list of clans")
async def get_clans_stats(request: Request, body: ClanTagsRequest):
    """Retrieve Clash of Clans account details for a list of clans."""

    if not body.clan_tags:
        raise HTTPException(status_code=400, detail="clan_tags cannot be empty")

    clan_tags = [fix_tag(tag) for tag in body.clan_tags]

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_responses = await asyncio.gather(*(fetch_clan_data(session, tag) for tag in clan_tags))

    return {"items": remove_id_fields(api_responses)}


@router.get("/clan/{clan_tag}/details", name="Get full stats for a single clan")
async def get_clan_stats(clan_tag: str, request: Request):
    """Retrieve Clash of Clans account details for a single clan."""

    if not clan_tag:
        raise HTTPException(status_code=400, detail="clan_tag is required")

    fixed_tag = fix_tag(clan_tag)

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_response = await fetch_clan_data(session, fixed_tag)

    if not api_response:
        raise HTTPException(status_code=404, detail="Clan not found")

    return remove_id_fields(api_response)


@router.get("/clan/{clan_tag}/donations/{season}",
            name="Get donations for a clan's members in a specific season")
async def clan_donations(clan_tag: str, season: str, request: Request):
    clan_stats = await mongo.clan_stats.find_one({'tag': fix_tag(clan_tag)}, projection={'_id': 0, f'{season}': 1})
    clan_season_donations = clan_stats.get(season, {})

    items = []
    for tag, data in clan_season_donations.items():
        items.append({
            "tag": tag,
            "donated": data.get('donated', 0),
            "received": data.get('received', 0)
        })
    return {"items": items}


@router.get("/clan/{clan_tag}/join-leave", name="Join Leaves in a season")
async def clan_join_leave(
    clan_tag: str,
    request: Request,
    filters: JoinLeaveQueryParams = Depends()
):
    try:
        clan_tag = fix_tag(clan_tag)

        if filters.season:
            season_start, season_end = season_start_end(filters.season)
            filters.timestamp_start = int(season_start.timestamp())
            filters.time_stamp_end = int(season_end.timestamp())

        if filters.current_season:
            season_start, season_end = season_start_end(pend.now(tz=pend.UTC).format("YYYY-MM"))
            filters.timestamp_start = int(season_start.timestamp())
            filters.time_stamp_end = int(season_end.timestamp())

        base_query = {
            "$and": [
                {"clan": clan_tag},
                {"time": {"$gte": pend.from_timestamp(filters.timestamp_start, tz=pend.UTC)}},
                {"time": {"$lte": pend.from_timestamp(filters.time_stamp_end, tz=pend.UTC)}}
            ]
        }

        if filters.type:
            base_query["$and"].append({"type": filters.type})
        if filters.townhall:
            base_query["$and"].append({"th": {"$in": filters.townhall}})
        if filters.tag:
            base_query["$and"].append({"tag": {"$in": filters.tag}})
        if filters.name_contains:
            base_query["$and"].append({"name": {"$regex": filters.name_contains, "$options": "i"}})

        cursor = mongo.clan_join_leave.find(base_query, {"_id": 0}).sort("time", -1)
        if not filters.season and not filters.current_season:
            cursor = cursor.limit(filters.limit)

        result = await cursor.to_list(length=None)

        if filters.filter_leave_join_enabled:
            result = filter_leave_join(result, filters.filter_time)
        if filters.filter_join_leave_enabled:
            result = filter_join_leave(result, filters.filter_time)
        if filters.only_type in ("join_leave", "leave_join"):
            result = extract_join_leave_pairs(result, filters.filter_time, direction=filters.only_type)

        return {
            "timestamp_start": filters.timestamp_start,
            "timestamp_end": filters.time_stamp_end,
            "stats": generate_stats(result),
            "join_leave_list": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")


@router.post("/clans/join-leave", name="Join Leaves in a season")
async def get_multiple_clan_join_leave(
    body: ClanTagsRequest = None,
    request: Request = None,
    filters: JoinLeaveQueryParams = Depends(),
    # Programmatic parameters
    clan_tags: list[str] = None,
    programmatic_filters: dict = None
):
    """
    Unified function that handles both FastAPI endpoint calls and programmatic calls.
    
    For FastAPI endpoint: Use body, request, and filters (with Depends())
    For programmatic calls: Use clan_tags and programmatic_filters
    """
    try:
        # Determine if this is a programmatic call or FastAPI endpoint call
        if clan_tags is not None:
            # Programmatic call
            clan_tags_list = [fix_tag(tag) for tag in clan_tags]
            
            # Set default filters if none provided
            if programmatic_filters is None:
                programmatic_filters = {
                    "current_season": True,
                    "limit": 50,
                    "filter_leave_join_enabled": False,
                    "filter_join_leave_enabled": False,
                    "filter_time": 48,
                    "only_type": None,
                    "type": None,
                    "townhall": None,
                    "tag": None,
                    "name_contains": None
                }
            
            async def process_clan_join_leave(clan_tag: str):
                try:
                    # Use current season by default
                    if programmatic_filters.get("current_season", True):
                        season_start, season_end = season_start_end(pend.now(tz=pend.UTC).format("YYYY-MM"))
                        timestamp_start = int(season_start.timestamp())
                        time_stamp_end = int(season_end.timestamp())
                    else:
                        timestamp_start = programmatic_filters.get("timestamp_start", 0)
                        time_stamp_end = programmatic_filters.get("time_stamp_end", 9999999999)

                    base_query = {
                        "$and": [
                            {"clan": clan_tag},
                            {"time": {"$gte": pend.from_timestamp(timestamp_start, tz=pend.UTC)}},
                            {"time": {"$lte": pend.from_timestamp(time_stamp_end, tz=pend.UTC)}}
                        ]
                    }

                    if programmatic_filters.get("type"):
                        base_query["$and"].append({"type": programmatic_filters["type"]})
                    if programmatic_filters.get("townhall"):
                        base_query["$and"].append({"th": {"$in": programmatic_filters["townhall"]}})
                    if programmatic_filters.get("tag"):
                        base_query["$and"].append({"tag": {"$in": programmatic_filters["tag"]}})
                    if programmatic_filters.get("name_contains"):
                        base_query["$and"].append({"name": {"$regex": programmatic_filters["name_contains"], "$options": "i"}})

                    cursor = mongo.clan_join_leave.find(base_query, {"_id": 0}).sort("time", -1)
                    if not programmatic_filters.get("current_season", True):
                        cursor = cursor.limit(programmatic_filters.get("limit", 50))

                    result = await cursor.to_list(length=None)

                    if programmatic_filters.get("filter_leave_join_enabled"):
                        result = filter_leave_join(result, programmatic_filters.get("filter_time", 48))
                    if programmatic_filters.get("filter_join_leave_enabled"):
                        result = filter_join_leave(result, programmatic_filters.get("filter_time", 48))
                    if programmatic_filters.get("only_type") in ("join_leave", "leave_join"):
                        result = extract_join_leave_pairs(result, programmatic_filters.get("filter_time", 48), direction=programmatic_filters["only_type"])

                    return {
                        "clan_tag": clan_tag,
                        "timestamp_start": timestamp_start,
                        "timestamp_end": time_stamp_end,
                        "stats": generate_stats(result),
                        "join_leave_list": result
                    }

                except Exception as e:
                    print(f"❌ Error fetching join/leave data for {clan_tag}: {e}")
                    return {
                        "clan_tag": clan_tag,
                        "timestamp_start": 0,
                        "timestamp_end": 0,
                        "stats": {},
                        "join_leave_list": []
                    }
                    
        else:
            # FastAPI endpoint call
            if not body or not body.clan_tags:
                raise HTTPException(status_code=400, detail="clan_tags cannot be empty")
                
            clan_tags_list = [fix_tag(tag) for tag in body.clan_tags]
            
            async def process_clan_join_leave(clan_tag: str):
                response = await clan_join_leave(clan_tag=clan_tag, request=request, filters=filters)
                return {
                    "clan_tag": clan_tag,
                    "timestamp_start": response["timestamp_start"],
                    "timestamp_end": response["timestamp_end"],
                    "stats": response["stats"],
                    "join_leave_list": response["join_leave_list"]
                }

        results = await asyncio.gather(*(process_clan_join_leave(tag) for tag in clan_tags_list))
        return {"items": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching bulk data: {str(e)}")

@router.post("/clans/capital-raids", name="Get capital raids history & stats for a list of clans")
async def get_clans_capital_raids(request: Request, body: RaidsRequest):
    """Retrieve Clash of Clans account details for a list of clans."""

    if not body.clan_tags:
        raise HTTPException(status_code=400, detail="clan_tags cannot be empty")

    if not body.limit:
        body.limit = 1

    clan_tags = [fix_tag(tag) for tag in body.clan_tags]

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}/capitalraidseasons?limit={body.limit}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_responses = await asyncio.gather(*(fetch_clan_data(session, tag) for tag in clan_tags))

    result = []
    for i, clan_data in enumerate(api_responses):
        if clan_data:
            history = clan_data.get("items", [])
            predict_rewards(history)
            result.append({
                "clan_tag": clan_tags[i],  # Add clan_tag to associate data with clan
                "stats": generate_raids_clan_stats(history),
                "history": remove_id_fields(history)
            })

    return {"items": result}