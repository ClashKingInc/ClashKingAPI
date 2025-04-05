
import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from typing import Annotated
from utils.utils import fix_tag, remove_id_fields, check_authentication
from utils.database import MongoClient as mongo


router = APIRouter(prefix="/v2",tags=["Links"], include_in_schema=True)





@router.get("/link/server/{server_id}/clan/list",
            name="Basic list of clans linked to a server")
@check_authentication
async def server_clans_list(server_id: int, request: Request):
    result = await mongo.clan_db.find({'server': server_id}, {"name" : 1, "tag" : 1}).to_list(length=None)
    return remove_id_fields({"items" : result})







