from utils.utils import remove_id_fields
from utils.database import MongoClient
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.security import check_authentication
from utils.config import Config
from utils.sentry_utils import capture_endpoint_errors
from .models import ServerSettingsUpdate, ServerSettingsResponse
import linkd
import hikari

config = Config()
security = HTTPBearer()
router = APIRouter(prefix="/v2", tags=["Server Settings"], include_in_schema=True)


@router.get("/server/{server_id}/settings",
             name="Get settings for a server")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def server_settings(
    server_id: int,
    request: Request,
    clan_settings: bool = False,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
):
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
    cursor = await mongo.server_db.aggregate(pipeline)
    results = await cursor.to_list(length=1)
    if not results:
        raise HTTPException(status_code=404, detail="Server Not Found")
    return remove_id_fields(results[0])


@router.get("/server/{server_id}/clan/{clan_tag}/settings",
            name="Get clan settings for a server")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def server_clan_settings(
    server_id: int,
    clan_tag: str,
    request: Request,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
):
    result = await mongo.clan_db.find_one({'$and': [{'tag': clan_tag}, {'server': server_id}]})
    if not result:
        raise HTTPException(status_code=404, detail="Server or clan not found")
    return remove_id_fields(result)


@router.put("/server/{server_id}/embed-color/{hex_code}",
            name="Update server discord embed color")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def set_server_embed_color(
    server_id: int,
    hex_code: int,
    request: Request,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
):
    result = await mongo.server_db.find_one_and_update(
        {"server": server_id},
        {"$set": {"embed_color": hex_code}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Server not found")
    return {"message": "Embed color updated", "server_id": server_id, "embed_color": hex_code}


@router.patch("/server/{server_id}/settings",
              name="Update server settings",
              response_model=ServerSettingsResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def update_server_settings(
    server_id: int,
    settings: ServerSettingsUpdate,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> ServerSettingsResponse:
    """
    Update server settings. Only provided fields will be updated.

    This endpoint handles all server-level settings including:
    - Nickname conventions and auto-eval
    - Role management (blacklist, treatment)
    - Channel configurations (banlist, strike log, reddit feed)
    - Link parsing settings
    - General settings (leadership eval, tied stats, etc.)
    """
    # Verify server exists
    existing = await mongo.server_db.find_one({"server": server_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Server not found")

    # Build update document with only provided fields
    update_doc = {}

    # Direct field mappings
    field_mappings = {
        "embed_color": "embed_color",
        "nickname_rule": "nickname_rule",
        "non_family_nickname_rule": "non_family_nickname_rule",
        "change_nickname": "change_nickname",
        "flair_non_family": "flair_non_family",
        "auto_eval_nickname": "auto_eval_nickname",
        "autoeval_triggers": "autoeval_triggers",
        "autoeval_log": "autoeval_log",
        "autoeval": "autoeval",
        "blacklisted_roles": "blacklisted_roles",
        "role_treatment": "role_treatment",
        "full_whitelist_role": "full_whitelist_role",
        "leadership_eval": "leadership_eval",
        "autoboard_limit": "autoboard_limit",
        "api_token": "api_token",
        "tied": "tied",
        "banlist": "banlist",
        "strike_log": "strike_log",
        "reddit_feed": "reddit_feed",
        "family_label": "family_label",
        "greeting": "greeting",
    }

    for pydantic_field, db_field in field_mappings.items():
        value = getattr(settings, pydantic_field, None)
        if value is not None:
            update_doc[db_field] = value

    # Handle nested link_parse settings
    if settings.link_parse is not None:
        link_parse_updates = {}
        if settings.link_parse.clan is not None:
            link_parse_updates["link_parse.clan"] = settings.link_parse.clan
        if settings.link_parse.army is not None:
            link_parse_updates["link_parse.army"] = settings.link_parse.army
        if settings.link_parse.player is not None:
            link_parse_updates["link_parse.player"] = settings.link_parse.player
        if settings.link_parse.base is not None:
            link_parse_updates["link_parse.base"] = settings.link_parse.base
        if settings.link_parse.show is not None:
            link_parse_updates["link_parse.show"] = settings.link_parse.show

        update_doc.update(link_parse_updates)

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update the server
    result = await mongo.server_db.update_one(
        {"server": server_id},
        {"$set": update_doc}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")

    return ServerSettingsResponse(
        message="Server settings updated successfully",
        server_id=server_id,
        updated_fields=len(update_doc)
    )