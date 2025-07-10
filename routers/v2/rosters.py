

import coc

from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter, Query
from typing import Annotated, List
from fastapi_cache.decorator import cache
from datetime import datetime
from utils.utils import fix_tag, db_client, token_verify, limiter, remove_id_fields



router = APIRouter(tags=["Rosters"], include_in_schema=False)


@router.get("/roster/list",
             name="List of rosters on a server")
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

    '''legend_stats = await db_client.player_stats_db.find({"tag": {"$in": players}},
                                                        projection={"name": 1, "townhall": 1, "legends.streak": 1, f"legends.{day}" "tag": 1, "_id": 0}).to_list(length=None)'''

    return remove_id_fields(combined_data)


