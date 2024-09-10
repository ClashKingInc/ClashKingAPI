from subprocess import check_call

import coc

from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Annotated, List
from fastapi_cache.decorator import cache
from datetime import datetime
from utils.utils import fix_tag, db_client, token_verify, limiter, remove_id_fields, check_authentication


router = APIRouter(prefix="/v2",tags=["Tracking Endpoints"], include_in_schema=False)


class PlayerList(BaseModel):
    tags: list[str]

@router.post("/tracking/players/add", name="Add players to tracking")
@check_authentication
async def add_players(player_list: PlayerList, request: Request, response: Response):
    insert_docs = []
    for tag in player_list.tags:
        tag = fix_tag(tag)
        insert_docs.append({"tag": tag})
    await db_client.player_stats_db.insert_many(insert_docs, ordered=False)
    return {"status": "success", "players_added": player_list.tags}


@router.post("/tracking/players/remove", name="Remove players from tracking")
@check_authentication
async def remove_players(player_list: PlayerList, request: Request, response: Response):
    await db_client.player_stats_db.delete_many({"tag": {"$in": player_list.tags}})
    return {"status": "success", "players_removed": player_list.tags}
