from fastapi import  Request, Response, HTTPException, APIRouter, Query
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.responses import RedirectResponse

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Redirect"])


@router.get("/p/{player_tag}",
         response_class=RedirectResponse,
         name="Shortform Player Profile URL",
         include_in_schema=False)
async def redirect_fastapi(player_tag: str):
    return f"https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=%23{player_tag}"



@router.get("/c/{clan_tag}",
         response_class=RedirectResponse,
         name="Shortform Clan Profile URL",
         include_in_schema=False)
async def redirect_fastapi_clan(clan_tag: str):
    return f"https://link.clashofclans.com/en?action=OpenClanProfile&tag=%23{clan_tag}"


