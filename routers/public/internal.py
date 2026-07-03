import aiohttp
import orjson
import asyncio
from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import requests

from fastapi import  Request, Response, HTTPException, Header
from fastapi import APIRouter
from typing import List
from utils.utils import fix_tag, redis, db_client, config, create_keys


router = APIRouter(tags=["Internal Endpoints"])

_proxy_session = None
_proxy_session_loop = None


async def get_proxy_session():
    global _proxy_session, _proxy_session_loop

    loop = asyncio.get_running_loop()
    if _proxy_session is None or _proxy_session.closed or _proxy_session_loop is not loop:
        timeout = aiohttp.ClientTimeout(total=30)
        connector = aiohttp.TCPConnector(limit=50, ttl_dns_cache=300)
        _proxy_session = aiohttp.ClientSession(timeout=timeout, connector=connector)
        _proxy_session_loop = loop
    return _proxy_session


async def shutdown():
    if _proxy_session is not None and not _proxy_session.closed:
        await _proxy_session.close()


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



@router.get("/v1/{url:path}",
         name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
         include_in_schema=False)
async def test_endpoint(url: str, request: Request, response: Response):

    full_url = f"https://proxy.clashk.ing/v1/{url}"
    full_url = full_url.replace("#", '%23').replace("!", '%23')

    async with aiohttp.ClientSession() as session:
        async with session.get(full_url) as api_response:
            if api_response.status != 200:
                content = await api_response.text()
                raise HTTPException(status_code=api_response.status, detail=content)
            item = await api_response.json()

    return item


@router.post("/v1/{url:path}",
             name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
             include_in_schema=False)
async def test_post_endpoint(url: str, request: Request, response: Response):

    # Construct the full URL with query parameters if any
    full_url = f"https://proxy.clashk.ing/v1/{url}"


    full_url = full_url.replace("#", '%23').replace("!", '%23')

    # Extract JSON body from the request
    body = await request.json()

    async with aiohttp.ClientSession() as session:
        async with session.post(full_url, json=body) as api_response:
            if api_response.status != 200:
                content = await api_response.text()
                raise HTTPException(status_code=api_response.status, detail=content)
            item = await api_response.json()

    return item

@router.get("/bot/config", include_in_schema=False)
async def bot_config(bot_token: str = Header(...)):
    bot_config: dict = await db_client.bot_settings.find_one({"type" : "bot"}, {"_id" : 0})

    is_main = False
    is_beta = False
    is_custom = False

    if bot_token == bot_config.get("prod_token"):
        is_main = True
    elif bot_token in bot_config.get("beta_tokens", []):
        is_beta = True
    elif bot_token in bot_config.get("collab_tokens", []):
        is_beta = True
        bot_config["link_api_pw"] = "test"
        bot_config["portainer_api_token"] = "test"
        bot_config["reddit_pw"] = "test"
        bot_config["reddit_secret"] = "test"
        bot_config["stats_db"] = bot_config.pop("read_only_stats_db")
        bot_config.pop("prod_token")
        bot_config["static_db"] = bot_config.pop("read_only_static_db")
        bot_config.pop("bunny_api_token")
        bot_config.pop("redis_ip")
        bot_config.pop("open_ai_key")
        bot_config.pop("gitbook_token")
        bot_config.pop("coc_password")
        bot_config.pop("meili_pw")
        bot_config.pop("redis_pw")
        bot_config.pop("webhook_url")
        bot_config.pop("github_token")
    else:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    extra_config = {
        "is_main": is_main,
        "is_beta": is_beta,
        "is_custom": is_custom
    }

    return bot_config | extra_config


#fix one day + connect to db
@router.get("/permalink/{clan_tag}",
         name="Permanent Link to Clan Badge URL", include_in_schema=False)
async def permalink(clan_tag: str):

    clan_tag = fix_tag(clan_tag)
    db_clan_result = await db_client.global_clans.find_one({"_id" : clan_tag}, {"data."})
    if not db_clan_result:

        async with aiohttp.ClientSession() as session:
            async with session.get(
                    f"https://api.clashofclans.com/v1/clans/{clan_tag.replace('#', '%23')}") as response:
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
    token = request.headers.get("authorization")
    if token != f"Bearer {config.internal_api_token}":
        raise HTTPException(status_code=401, detail="Invalid token")

    semaphore = asyncio.Semaphore(50)
    async def fetch_function(url: str, session: aiohttp.ClientSession):
        url = url.replace("#", '%23')
        async with semaphore:
            async with session.get(f"https://proxy.clashk.ing/v1/{url}") as response:
                if response.status != 200:
                    await response.read()
                    return None
                return await response.json(loads=orjson.loads, content_type=None)

    session = await get_proxy_session()
    tasks = [fetch_function(url, session) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return [r for r in results if r is not None and not isinstance(r, Exception)]
