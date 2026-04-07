import linkd
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from utils.database import MongoClient
from utils.security import check_authentication

from .models import ServerPanel, UpdatePanelRequest

security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Server Panels"], include_in_schema=True)


@router.get("/{server_id}/panel")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_panel(
    server_id: int,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> ServerPanel:
    doc = await mongo.server_db.find_one({"server": server_id}, {"_id": 0, "logs.welcome_link": 1})
    welcome_link = (doc or {}).get("logs", {}).get("welcome_link", {})
    return ServerPanel(
        embed_name=welcome_link.get("embed_name"),
        buttons=welcome_link.get("buttons", []),
        button_color=welcome_link.get("button_color", "Grey"),
        welcome_channel=welcome_link.get("welcome_channel"),
    )


@router.put("/{server_id}/panel")
@linkd.ext.fastapi.inject
@check_authentication
async def update_server_panel(
    server_id: int,
    body: UpdatePanelRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> ServerPanel:
    await mongo.server_db.update_one(
        {"server": server_id},
        {
            "$set": {
                "logs.welcome_link.embed_name": body.embed_name,
                "logs.welcome_link.buttons": body.buttons,
                "logs.welcome_link.button_color": body.button_color,
                "logs.welcome_link.welcome_channel": body.welcome_channel,
            }
        },
        upsert=True,
    )
    return ServerPanel(
        embed_name=body.embed_name,
        buttons=body.buttons,
        button_color=body.button_color,
        welcome_channel=body.welcome_channel,
    )
