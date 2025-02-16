
import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from typing import Annotated
from utils.utils import fix_tag, remove_id_fields, check_authentication
from utils.database import MongoClient as mongo
from routers.v2.location.models import PlayerTagsRequest

router = APIRouter(prefix="/v2",tags=["Location"], include_in_schema=True)


@router.post("/location/players",
             name="Get locations for a list of players")
async def location_list(request: Request, body: PlayerTagsRequest):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    location_info = await mongo.leaderboard_db.find(
        {'tag': {'$in': body.player_tags}},
        {'_id': 0, 'tag': 1, 'country_name': 1, 'country_code': 1}
    ).to_list(length=None)

    return {"items": remove_id_fields(location_info)}




