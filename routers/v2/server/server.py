
from fastapi import HTTPException
from fastapi import APIRouter, Request
from utils.utils import remove_id_fields, check_authentication
from utils.database import MongoClient as mongo


router = APIRouter(prefix="/v2",tags=["Server Settings"], include_in_schema=True)



@router.get("/server/{server_id}/settings",
             name="Get settings for a server")
@check_authentication
async def server_settings(server_id: int, request: Request, clan_settings: bool = False):
    pipeline = [
        {"$match": {"server": server_id}},
        {"$lookup": {"from": "legendleagueroles", "localField": "server", "foreignField": "server",
                     "as": "eval.league_roles"}},
        {"$lookup": {"from": "evalignore", "localField": "server", "foreignField": "server",
                     "as": "eval.ignored_roles"}},
        {"$lookup": {"from": "generalrole", "localField": "server", "foreignField": "server",
                     "as": "eval.family_roles"}},
        {"$lookup": {"from": "linkrole", "localField": "server", "foreignField": "server",
                     "as": "eval.not_family_roles"}},
        {"$lookup": {"from": "townhallroles", "localField": "server", "foreignField": "server",
                     "as": "eval.townhall_roles"}},
        {"$lookup": {"from": "builderhallroles", "localField": "server", "foreignField": "server",
                     "as": "eval.builderhall_roles"}},
        {"$lookup": {"from": "achievementroles", "localField": "server", "foreignField": "server",
                     "as": "eval.achievement_roles"}},
        {"$lookup": {"from": "statusroles", "localField": "server", "foreignField": "server",
                     "as": "eval.status_roles"}},
        {"$lookup": {"from": "builderleagueroles", "localField": "server", "foreignField": "server",
                     "as": "eval.builder_league_roles"}},
        {"$lookup": {"from": "clans", "localField": "server", "foreignField": "server", "as": "clans"}},
    ]
    if not clan_settings:
        pipeline.pop(-1)
    results = await mongo.server_db.aggregate(pipeline).to_list(length=1)
    if not results:
        raise HTTPException(status_code=404, detail="Server Not Found")
    return remove_id_fields(results[0])


@router.get("/server/{server_id}/clan/{clan_tag}/settings",
            name="Update server discord embed color")
@check_authentication
async def server_clan_settings(server_id: int, clan_tag: str, request: Request):
    result = await mongo.clan_db.find_one({'$and': [{'tag': clan_tag}, {'server': server_id}]})
    if not result:
        raise HTTPException(status_code=404, detail="Server or clan not found")
    return remove_id_fields(result)


@router.put("/server/{server_id}/embed-color/{hex_code}",
            name="Update server discord embed color")
@check_authentication
async def set_server_embed_color(server_id: int, hex_code: int, request: Request):
    result = await mongo.server_db.find_one_and_update(
        {"server": server_id},
        {"$set": {"embed_color": hex_code}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Server not found")
    return {"message": "Embed color updated", "server_id": server_id, "embed_color": hex_code}





