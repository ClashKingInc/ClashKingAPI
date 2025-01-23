
import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from typing import Annotated
from utils.utils import fix_tag, remove_id_fields, check_authentication
from utils.database import MongoClient as mongo
from routers.v2.bans.models import BanRequest

router = APIRouter(prefix="/v2",tags=["Bans"], include_in_schema=True)



@router.get("/ban/list/{server_id}",
             name="Get bans for a server")
@check_authentication
async def ban_list(server_id: int, request: Request):
    bans = await mongo.banlist.find({'server': server_id}).to_list(length=None)
    return remove_id_fields({"items" : bans})


@router.post("/ban/add/{server_id}/{player_tag}")
@check_authentication
async def add_ban(
    server_id: str,
    player_tag: str,
    request: Request,
    ban_data: BanRequest,
):
    """Add or update a ban for a player in a specific server"""

    find_ban = await mongo.banlist.find_one({'VillageTag': player_tag, 'server': server_id})

    if find_ban:
        # Update existing ban
        await mongo.banlist.update_one(
            {'VillageTag': player_tag, 'server': server_id},
            {
                '$set': {'Notes': ban_data.reason, 'rollover_date': ban_data.rollover_days},
                '$push': {
                    'edited_by': {
                        'user': ban_data.added_by,
                        'previous': {
                            'reason': find_ban.get('Notes'),
                            'rollover_days': find_ban.get('rollover_date'),
                        },
                    }
                },
            }
        )
        return {"status": "updated", "player_tag": player_tag, "server_id": server_id}
    else:
        # Insert new ban
        ban_entry = {
            'VillageTag': player_tag,
            'DateCreated': pend.now("UTC").format("YYYY-MM-DD HH:mm:ss"),
            'Notes': ban_data.reason,
            'server': server_id,
            'added_by': ban_data.added_by,
            'rollover_date': ban_data.rollover_days,
        }
        await mongo.banlist.insert_one(ban_entry)
        return {"status": "created", "player_tag": player_tag, "server_id": server_id}



@router.delete("/ban/remove/{server_id}/{player_tag}")
@check_authentication
async def remove_ban(
    server_id: str,
    player_tag: str,
    request: Request
):
    """Delete a ban for a player in a specific server"""

    results = await mongo.banlist.find_one({'$and': [{'VillageTag': player_tag}, {'server': server_id}]})
    if not results:
        raise HTTPException(status_code=404, detail=f"Player {player_tag} is not banned on server {server_id}.")

    await mongo.banlist.find_one_and_delete({'$and': [{'VillageTag': player_tag}, {'server': server_id}]})
    return {"status": "deleted", "player_tag": player_tag, "server_id": server_id}