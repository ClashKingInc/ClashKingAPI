import re
import ujson
import coc
import pendulum as pend

from collections import defaultdict
from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from typing import List
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from utils.utils import fix_tag, db_client

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Global Data"])


@router.get(
        path="/boost-rate",
        name="Super Troop Boost Rate, for a season (YYYY-MM)")
@cache(expire=300)
@limiter.limit("5/second")
async def super_troop_boost_rate(start_season: str, end_season: str, request: Request, response: Response):
    start_year = start_season[:4]; start_month = start_season[-2:]
    end_year = end_season[:4]; end_month = end_season[-2:]

    SEASON_START = coc.utils.get_season_start(month=int(start_month) - 1, year=int(start_year))
    SEASON_END = coc.utils.get_season_end(month=int(end_month) - 1, year=int(end_year))

    pipeline = [
        {
            "$match": {
                "$and": [
                    {
                        "type": {
                            "$in": coc.enums.SUPER_TROOP_ORDER,
                        },
                    },
                    {
                        "time": {
                            "$gte": SEASON_START.timestamp(),
                        },
                    },
                    {"time" : {
                        "$lte" : SEASON_END.timestamp()
                    }}
                ],
            },
        },
        {
            "$facet": {
                "grouped": [{"$group": {"_id": "$type", "boosts": {"$sum": 1}}}],
                "total": [{"$count": "count"}]
            }
        },
        {
            "$unwind": "$grouped",
        },
        {
            "$unwind": "$total",
        },
        {
            "$set": {
                "usagePercent": {
                    "$multiply": [{"$divide": ["$grouped.boosts", "$total.count"]}, 100],
                },
            },
        },
        {"$set": {"name": "$grouped._id", "boosts": "$grouped.boosts"}},
        {"$unset": ["grouped", "total"]}
    ]
    results = await db_client.player_history.aggregate(pipeline=pipeline).to_list(length=None)
    return results


@router.get(
        path="/global/counts",
        name="Number of clans in war, players in war, player in legends etc")
@limiter.limit("1/minute")
async def global_counts(request: Request, response: Response):
    timer_counts = await db_client.war_timer.estimated_document_count()
    now = int(pend.now(tz=pend.UTC).timestamp())
    war_counts = await db_client.clan_wars.count_documents({"endTime" : {"$gte" : now}})
    hours_ago = pend.now(tz=pend.UTC).subtract(hours=24)
    join_leaves_24_hours = await db_client.join_leave_history.count_documents({"time" : {"$gte" : hours_ago}})
    legend_count = await db_client.legend_rankings.estimated_document_count({})

    return {
        "players_in_war" : timer_counts,
        "clans_in_war" : war_counts,
        "join_leaves_last_day" : join_leaves_24_hours,
        "players_in_legends" : legend_count
    }




