import aiohttp
import orjson
import re
import snappy
import asyncio

from collections import defaultdict, deque
from fastapi import  Request, Response, HTTPException, Header
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
    if not config.is_local:
        emails = [config.coc_email.format(x=x) for x in range(config.min_coc_email, config.max_coc_email + 1)]
        passwords = [config.coc_password] * (config.max_coc_email + 1 - config.min_coc_email)
        KEYS = await create_keys(emails=emails, passwords=passwords, ip="5.161.113.222")
        KEYS = deque(KEYS)


@router.get("/v1/{url:path}",
         name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
         include_in_schema=False)
async def test_endpoint(url: str, request: Request, response: Response):
    global KEYS

    # Extract query parameters
    query_params = request.query_params
    fields = query_params.get("fields")

    # Remove the "fields" parameter from the query parameters
    query_params = {key: value for key, value in query_params.items() if key != "fields"}
    query_string = "&".join([f"{key}={value}" for key, value in query_params.items()])

    headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
    KEYS.rotate(1)

    # Construct the full URL with query parameters if any
    full_url = f"https://api.clashofclans.com/v1/{url}"
    if query_string:
        full_url = f"{full_url}?{query_string}"

    full_url = full_url.replace("#", '%23').replace("!", '%23')

    async with aiohttp.ClientSession() as session:
        async with session.get(full_url, headers=headers) as api_response:
            if api_response.status != 200:
                content = await api_response.text()
                raise HTTPException(status_code=api_response.status, detail=content)
            item = await api_response.json()

    # If fields are specified, filter the response to include only those fields
    if fields:
        fields = fields.split(",")
        if "items" in item and isinstance(item["items"], list):
            item["items"] = [
                {key: sub_item[key] for key in fields if key in sub_item}
                for sub_item in item["items"]
            ]
        else:
            item = {key: item[key] for key in fields if key in item}

    return item


@router.post("/v1/{url:path}",
             name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
             include_in_schema=False)
async def test_post_endpoint(url: str, request: Request, response: Response):
    global KEYS

    # Extract query parameters
    query_params = request.query_params
    fields = query_params.get("fields")

    # Remove the "fields" parameter from the query parameters
    query_params = {key: value for key, value in query_params.items() if key != "fields"}
    query_string = "&".join([f"{key}={value}" for key, value in query_params.items()])

    headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
    KEYS.rotate(1)

    # Construct the full URL with query parameters if any
    full_url = f"https://api.clashofclans.com/v1/{url}"
    if query_string:
        full_url = f"{full_url}?{query_string}"

    full_url = full_url.replace("#", '%23').replace("!", '%23')

    # Extract JSON body from the request
    body = await request.json()

    async with aiohttp.ClientSession() as session:
        async with session.post(full_url, json=body, headers=headers) as api_response:
            if api_response.status != 200:
                content = await api_response.text()
                raise HTTPException(status_code=api_response.status, detail=content)
            item = await api_response.json()

    return item

@router.get("/bot/config", include_in_schema=False)
async def bot_config(bot_token: str = Header(...)):
    bot_config = await db_client.bot_settings.find_one({"type" : "bot"}, {"_id" : 0})
    custom_bot_tokens = await db_client.custom_bots.distinct("token")

    is_main = False
    is_beta = False
    is_custom = False

    if bot_token == bot_config.get("prod_token"):
        is_main = True
    elif bot_token == bot_config.get("beta_token"):
        is_beta = True
    elif bot_token in custom_bot_tokens:
        is_custom = True
    else:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    extra_config = {
        "is_main": is_main,
        "is_beta": is_beta,
        "is_custom": is_custom
    }

    return bot_config | extra_config


@router.get("/permalink/{clan_tag}",
         name="Permanent Link to Clan Badge URL", include_in_schema=False)
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

