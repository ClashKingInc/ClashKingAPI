import asyncio
from typing import Optional, List

import aiohttp
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException, Depends
from fastapi import APIRouter, Query, Request
from h11 import Response

from routers.v2.clan.models import ClanTagsRequest, JoinLeaveQueryParams
from routers.v2.clan.utils import filter_leave_join, extract_join_leave_pairs, filter_join_leave, generate_stats
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
            season_start, season_end = season_start_end(filters.season, gold_pass_season=True)
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
        if not filters.season:
            cursor = cursor.limit(filters.limit)

        result = await cursor.to_list(length=None)

        if filters.filter_leave_join_enabled:
            result = filter_leave_join(result, filters.filter_time)
        if filters.filter_join_leave_enabled:
            result = filter_join_leave(result, filters.filter_time)
        if filters.only_type in ("join_leave", "leave_join"):
            result = extract_join_leave_pairs(result, filters.filter_time, direction=filters.only_type)

        return {
            "stats": generate_stats(result),
            "join_leave_list": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")


@router.post("/clans/join-leave", name="Join Leaves in a season")
async def get_multiple_clan_join_leave(
    body: ClanTagsRequest,
    request: Request,
    filters: JoinLeaveQueryParams = Depends()
):
    try:
        clan_tags = [fix_tag(tag) for tag in body.clan_tags]

        async def process_join_leave(clan_tag: str):
            response = await clan_join_leave(clan_tag=clan_tag, request=request, filters=filters)
            return {
                "clan_tag": clan_tag,
                "stats": response["stats"],
                "join_leave_list": response["join_leave_list"]
            }

        results = await asyncio.gather(*(process_join_leave(tag) for tag in clan_tags))
        return {"items": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching bulk data: {str(e)}")
