from fastapi import Request, Response, HTTPException, APIRouter, Query
from fastapi_cache.decorator import cache
from slowapi import Limiter
from slowapi.util import get_ipaddr
from utils.utils import db_client, fix_tag



router = APIRouter(tags=["Legends"])

@router.get(path="/legends/clan/{clan_tag}/{date}",
            name="Legend stats for a members in a clan on a date")
@cache(expire=300)
async def legends_clan(clan_tag: str, date: str, request: Request, response: Response):
    basic_clan = await db_client.basic_clan.find_one({"tag" : fix_tag(clan_tag)}, {"_id" : 0, "tag" : 1, "name" : 1, "members" : 1, "memberList" : 1, "level" : 1, "location" : 1})
    members = basic_clan.get("memberList")
    legend_stats = await db_client.player_stats_db.find({"tag": {"$in" : [m.get("tag") for m in members]}}, projection={"name": 1, "townhall": 1, "legends": 1, "tag": 1, "_id" : 0}).to_list(length=None)

    legend_stats_map = {l.get("tag") : l for l in legend_stats}
    new_member_list = []
    for member in members:
        if member.get("league") == "Legend League":
            legend_data = legend_stats_map.get(member.get("tag"), {}).get("legends", {}).get(date, {})
            legend_data.pop("attacks", None)
            legend_data.pop("defenses", None)
            new_member_list.append({
                "name" : member.get("name"),
                "tag" : member.get("tag"),
                "league" : member.get("league"),
                "townhall" : member.get("townhall"),
                "legends" : legend_data
            })

    basic_clan["memberList"] = new_member_list
    return basic_clan


@router.get(path="/legends/streaks",
            name="Best legend streaks")
@cache(expire=300)
async def legend_streaks(request: Request, response: Response,
                         limit: int = Query(ge=1, default=50, le=500)):
    results = await db_client.player_stats_db.find({}, projection={"name": 1, "tag" : 1, "legends.streak": 1, "_id" : 0}).sort("legends.streak", -1).limit(limit).to_list(length=None)
    for rank, r in enumerate(results, 1):
        r["rank"] = rank
    return {"items" : results}


@router.get(path="/legends/trophy-buckets",
            name="num of players in each trophy bucket")
@cache(expire=300)
async def trophy_bucket(request: Request, response: Response):
    pipeline = [
        {'$bucket': {
            'groupBy': '$trophies',
            'boundaries': [4500, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000, 6100, 6200, 6300, 6400, 6500, 6600, 6700, 8500],
            'output': {'count': {'$sum': 1}}}
        }
    ]
    results = await db_client.legend_rankings.aggregate(pipeline=pipeline).to_list(length=None)
    return {"items" : results}


@router.get(path="/legends/eos-winners",
            name="#1 player for each month in legends since the beginning")
@cache(expire=300)
async def eos_winners(request: Request, response: Response):
    results = await db_client.legend_history.find({"rank": 1}, {"_id" : 0}).sort("season", -1).to_list(length=None)
    return {"items" : results}