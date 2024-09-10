


import coc

from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter, Query
from typing import Annotated, List
from fastapi_cache.decorator import cache
from datetime import datetime, timedelta
from utils.utils import fix_tag, db_client, token_verify, limiter, remove_id_fields



router = APIRouter(prefix="/v2",tags=["Bot Legends Endpoints"], include_in_schema=False)


@router.get("/legends/players/day/{day}",
             name="Get legends stats for a specific day")
async def legend_stats_day(day: str, request: Request, response: Response, players: Annotated[List[str], Query()]):
    # Your logic here

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
    combined_data = await db_client.player_stats_db.aggregate(pipeline).to_list(length=None)

    return remove_id_fields(combined_data)


@router.get("/legends/players/season/{season}",
             name="Get legends stats for a specific season")
async def legend_stats_season(season: str, request: Request, response: Response, players: Annotated[List[str], Query()]):
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
    combined_data = await db_client.player_stats_db.aggregate(pipeline).to_list(length=None)
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