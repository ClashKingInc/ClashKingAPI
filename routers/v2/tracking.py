from subprocess import check_call

import coc

from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Annotated, List
from fastapi_cache.decorator import cache
from datetime import datetime
from utils.utils import fix_tag, db_client, check_authentication


router = APIRouter(prefix="/v2",tags=["Tracking Endpoints"], include_in_schema=False)


class PlayerList(BaseModel):
    tags: list[str]


@router.post("/tracking/players/add", name="Add players to tracking")
@check_authentication
async def add_players(player_list: PlayerList, request: Request, response: Response):
    tags = [fix_tag(tag) for tag in player_list.tags]
    existing_tags = await db_client.player_stats_db.distinct("tag", {"tag": {"$in": tags}})
    new_tags = [tag for tag in tags if tag not in set(existing_tags)]

    if new_tags:
        insert_docs = [{"tag": tag} for tag in new_tags]
        await db_client.player_stats_db.insert_many(insert_docs, ordered=False)

    return {
        "status": "success",
        "players_added": new_tags,
        "players_already_tracked": existing_tags
    }


@router.post("/tracking/players/remove", name="Remove players from tracking")
@check_authentication
async def remove_players(player_list: PlayerList, request: Request, response: Response):
    await db_client.player_stats_db.delete_many({"tag": {"$in": player_list.tags}})
    return {"status": "success", "players_removed": player_list.tags}
