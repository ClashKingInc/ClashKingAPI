import pendulum as pend
import linkd
from fastapi import HTTPException, APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from utils.utils import remove_id_fields
from utils.database import MongoClient
from utils.security import check_authentication
from .models import BanRequest

router = APIRouter(prefix="/v2/server", tags=["Server Bans"], include_in_schema=True)
security = HTTPBearer()


@router.get("/{server_id}/bans",
            name="Get bans for a server")
@linkd.ext.fastapi.inject
@check_authentication
async def get_bans(
    server_id: int,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    bans = await mongo.banlist.find({'server': server_id}).sort([("_id", -1)]).to_list(length=None)
    return remove_id_fields({"items": bans, "count": len(bans)})


@router.post("/{server_id}/bans/{player_tag}",
             name="Add or update a ban")
@linkd.ext.fastapi.inject
@check_authentication
async def add_ban(
    server_id: int,
    player_tag: str,
    ban_data: BanRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """Add or update a ban for a player in a specific server"""
    find_ban = await mongo.banlist.find_one({'VillageTag': player_tag, 'server': server_id})

    if find_ban:
        # Update existing ban
        await mongo.banlist.update_one(
            {'VillageTag': player_tag, 'server': server_id},
            {
                '$set': {'Notes': ban_data.reason},
                '$push': {
                    'edited_by': {
                        'user': ban_data.added_by,
                        'previous': {
                            'reason': find_ban.get('Notes'),
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
            'image': ban_data.image,
        }
        await mongo.banlist.insert_one(ban_entry)
        return {"status": "created", "player_tag": player_tag, "server_id": server_id}



@router.delete("/{server_id}/bans/{player_tag}",
               name="Remove a ban")
@linkd.ext.fastapi.inject
@check_authentication
async def remove_ban(
    server_id: int,
    player_tag: str,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """Delete a ban for a player in a specific server"""

    results = await mongo.banlist.find_one({'$and': [{'VillageTag': player_tag}, {'server': server_id}]})
    if not results:
        raise HTTPException(status_code=404, detail=f"Player {player_tag} is not banned on server {server_id}.")

    await mongo.banlist.find_one_and_delete({'$and': [{'VillageTag': player_tag}, {'server': server_id}]})
    return {"status": "deleted", "player_tag": player_tag, "server_id": server_id}