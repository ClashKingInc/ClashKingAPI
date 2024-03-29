import aiohttp
import orjson
import re
import snappy
import asyncio

from collections import defaultdict, deque
from fastapi import  Request, Response, HTTPException
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


@router.post("/ck/generate-api-keys", include_in_schema=False)
async def generate_api_keys(emails: List[str], passwords: List[str], request: Request, response: Response):
    ip = request.client.host
    keys = await create_keys(emails=emails, passwords=passwords, ip=ip)
    return {"keys" : keys}


@router.on_event("startup")
async def startup():
    global KEYS
    emails = [config.coc_email.format(x=x) for x in range(config.min_coc_email, config.max_coc_email + 1)]
    passwords = [config.coc_password] * (config.max_coc_email + 1 - config.min_coc_email)
    KEYS = await create_keys(emails=emails, passwords=passwords, ip="65.109.27.116")
    KEYS = deque(KEYS)

@router.get("/v1/{url:path}",
         name="Test a coc api endpoint, very high ratelimit, only for testing without auth",
         include_in_schema=False)
@limiter.limit("60/minute")
async def test_endpoint(url: str, request: Request, response: Response):
    global KEYS
    url = url.replace("#", '%23')
    url = url.replace("!", '%23')
    url = url.split("?")[0]
    headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
    KEYS.rotate(0)
    async with aiohttp.ClientSession() as session:
        async with session.get(
                f"https://api.clashofclans.com/v1/{url}?limit=200", headers=headers) as response:
            item = await response.json()
    return item



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

