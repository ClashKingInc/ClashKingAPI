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
from slowapi.util import get_ipaddr
from utils.utils import fix_tag, db_client
import time

router = APIRouter(tags=["Global Data"])


@router.get(
        path="/boost-rate",
        name="Super Troop Boost Rate, for a season (YYYY-MM)")
@cache(expire=300)
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
async def global_counts(request: Request, response: Response):
    # Measure timer_counts
    timer_counts = await db_client.war_timer.estimated_document_count()

    # Measure war_counts
    now = int(pend.now(tz=pend.UTC).timestamp())
    war_counts = await db_client.clan_wars.count_documents({"endTime": {"$gte": now}})

    # Measure legend_count
    legend_count = await db_client.legend_rankings.estimated_document_count({})

    # Measure player_count
    player_count = await db_client.player_stats_db.estimated_document_count({})

    # Measure clan_count
    clan_count = await db_client.basic_clan.estimated_document_count({})

    # Measure wars_stored
    wars_stored = await db_client.clan_wars.estimated_document_count({})

    # Measure join_leaves_total
    join_leaves_total = await db_client.join_leave_history.estimated_document_count({})

    return {
        "players_in_war": timer_counts,
        "clans_in_war": war_counts,
        "total_join_leaves": join_leaves_total,
        "players_in_legends": legend_count,
        "player_count": player_count,
        "clan_count": clan_count,
        "wars_stored": wars_stored
    }




