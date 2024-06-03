import aiohttp
import orjson
import re
import snappy
import asyncio

from collections import defaultdict, deque
from fastapi import  Request, Response, HTTPException
from fastapi.responses import HTMLResponse
from fastapi import APIRouter
from typing import List
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from utils.utils import fix_tag, redis, db_client, config, create_keys
from expiring_dict import ExpiringDict

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Internal Endpoints"])

api_cache = ExpiringDict()
KEYS = deque()


async def fetch_image(url: str) -> bytes:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()
            return await response.read()

@router.post("/ck/generate-api-keys", include_in_schema=False)
async def generate_api_keys(emails: List[str], passwords: List[str], request: Request, response: Response):
    ip = request.client.host
    keys = await create_keys(emails=emails, passwords=passwords, ip=ip)
    return {"keys" : keys}


@router.on_event("startup")
async def startup():
    global KEYS
    emails = [config.coc_email.format(x=x) for x in range(config.min_coc_email, config.max_coc_email + 1)]
    '''passwords = [config.coc_password] * (config.max_coc_email + 1 - config.min_coc_email)
    KEYS = await create_keys(emails=emails, passwords=passwords, ip="65.109.27.116")
    KEYS = deque(KEYS)'''


@router.get("/v1/{url:path}",
         name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
         include_in_schema=False)
@limiter.limit("60/minute")
async def test_endpoint(url: str, request: Request, response: Response):
    global KEYS

    url = url.replace("#", '%23').replace("!", '%23')

    # Extract query parameters
    query_params = request.query_params
    query_string = "&".join([f"{key}={value}" for key, value in query_params.items()])

    headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
    KEYS.rotate(0)

    # Construct the full URL with query parameters if any
    full_url = f"https://api.clashofclans.com/v1/{url}"
    if query_string:
        full_url = f"{full_url}?{query_string}"

    async with aiohttp.ClientSession() as session:
        async with session.get(full_url, headers=headers) as api_response:
            if api_response.status != 200:
                content = await api_response.text()
                raise HTTPException(status_code=api_response.status, detail=content)
            item = await api_response.json()

    return item



@router.get("/permalink/{clan_tag}",
         name="Permanent Link to Clan Badge URL")
async def permalink(clan_tag: str):

    clan_tag = fix_tag(clan_tag)
    db_clan_result = await db_client.global_clans.find_one({"_id" : clan_tag}, {"data."})
    if not db_clan_result:
        global KEYS
        headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
        KEYS.rotate(1)
        async with aiohttp.ClientSession() as session:
            async with session.get(
                    f"https://api.clashofclans.com/v1/clans/{clan_tag.replace('#', '%23')}",
                    headers=headers) as response:
                items = await response.json()
        image_link = items["badgeUrls"]["large"]
    else:
        image_link = None

    async def fetch(url, session):
        async with session.get(url) as response:
            image_data = await response.read()
            return image_data

    tasks = []
    async with aiohttp.ClientSession() as session:
        tasks.append(fetch(image_link, session))
        responses = await asyncio.gather(*tasks)
        await session.close()
    image_bytes: bytes = responses[0]
    return Response(content=image_bytes, media_type="image/png")


@router.post("/ck/bulk",
         name="Only for internal use, rotates tokens and implements caching so that all other services dont need to",
         include_in_schema=False)
async def ck_bulk_proxy(urls: List[str], request: Request, response: Response):
    global KEYS
    token = request.headers.get("authorization")
    if token != f"Bearer {config.internal_api_token}":
        raise HTTPException(status_code=401, detail="Invalid token")

    async def fetch_function(url: str):
        url = url.replace("#", '%23')
        if api_cache.get(url) is None:
            headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
            KEYS.rotate(1)
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://api.clashofclans.com/v1/{url}", headers=headers) as response:
                    item_bytes = await response.read()
                    item = orjson.loads(item_bytes)
                    if response.status == 200:
                        cache_control_header = response.headers.get("Cache-Control", "")
                        max_age_match = re.search(r'max-age=(\d+)', cache_control_header)
                        max_age = int(max_age_match.group(1))
                        api_cache.ttl(key=url, value=snappy.compress(item_bytes), ttl=max_age)
                    else:
                        item = None
                await session.close()
                return item

        else:
            return orjson.loads(snappy.decompress(api_cache.get(url)))

    tasks = []
    for url in urls:
        tasks.append(asyncio.create_task(fetch_function(url)))
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return [r for r in results if r is not None and not isinstance(r, Exception)]



@router.get("/add", include_in_schema=False)
async def add_user(request: Request):
    code = request.query_params.get('code')

    if not code:
        return HTMLResponse("Error: No code provided", status_code=400)

    async with aiohttp.ClientSession() as session:
        # Exchange code for an access token
        token_data = {
            "client_id": 824653933347209227,
            "client_secret": config.client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "https://api.clashking.xyz/add"
        }
        async with session.post(
                "https://discord.com/api/oauth2/token",
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
        ) as token_response:
            if token_response.status != 200:
                return HTMLResponse("Error: Failed to retrieve access token", status_code=token_response.status)

            token_json = await token_response.json()
            access_token = token_json['access_token']

        async with session.get(
                "https://discord.com/api/users/@me",
                headers={
                    "Authorization": f"Bearer {access_token}"
                }
        ) as user_response:
            if user_response.status != 200:
                error_text = await user_response.text()
                return HTMLResponse(f"Error: Failed to retrieve user info. {error_text}", status_code=user_response.status)

            user_json = await user_response.json()
            user_id = user_json['id']

        # Add the user to the specified servers
        for server_id in [1247000773804560384,
                          1247007440382459934,
                          1247007568308600882,
                          1247008006042947655,
                          1247008148414402693,
                          1247008365725487174,
                          1247008453029789726,
                          1247008490850091048,
                          1042301195240357958,
                          1042635608088125491]:
            async with session.put(
                    f"https://discord.com/api/v10/guilds/{server_id}/members/{user_id}",
                    headers={
                        "Authorization": f"Bot {config.bot_token}",
                        "Content-Type": "application/json"
                    },
                    json={"access_token": access_token}
            ) as response:
                if response.status != 204:
                    return HTMLResponse(f"Error: Failed to add to server {server_id}", status_code=response.status)

    return HTMLResponse("Added you to ClashKing Emoji Servers!")

