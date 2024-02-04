import orjson
import aiohttp
import re

from collections import defaultdict, deque
from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from typing import List
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from utils.utils import fix_tag, redis, db_client, config, KEYS
from datetime import timedelta
from expiring_dict import ExpiringDict

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Internal Endpoints"])

api_cache = ExpiringDict()


@router.get("/ck/{url:path}",
         name="Only for internal use, rotates tokens and implements caching so that all other services dont need to",
         include_in_schema=False)
async def test_endpoint(url: str, request: Request, response: Response):
    token = request.headers.get("authorization")
    if token != f"Bearer {config.internal_api_token}":
        raise HTTPException(status_code=401, detail="Invalid token")

    if api_cache.get(url) is None:
        headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
        KEYS.rotate(1)
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://api.clashofclans.com/v1/{url}", headers=headers) as response:
                item = await response.read()
                item = orjson.loads(item)
                if response.status == 200:
                    cache_control_header = response.headers.get("Cache-Control", "")
                    max_age_match = re.search(r'max-age=(\d+)', cache_control_header)
                    max_age = int(max_age_match.group(1))
                    api_cache.ttl(key=url, value=item, ttl=max_age)
    else:
        return api_cache.get(url)
    return item


'''@router.post("/player/bulk",
          tags=["Player Endpoints"],
          name="Cached endpoint response (bulk fetch)",
          include_in_schema=False)
@limiter.limit("15/second")
async def player_bulk(player_tags: List[str], api_keys: List[str], request: Request, response: Response):
    async def get_player_responses(keys: deque, tags: list[str]):
        tasks = []
        connector = aiohttp.TCPConnector(limit=2000, ttl_dns_cache=300)
        timeout = aiohttp.ClientTimeout(total=1800)
        cached_responses = await redis.mget(keys=player_tags)
        tag_map = {tag: r for tag, r in zip(tags, cached_responses)}

        missing_tags = [t for t, r in tag_map.items() if r is None]
        results = []
        if missing_tags:
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                for tag in missing_tags:
                    keys.rotate(1)
                    async def fetch(url, session: aiohttp.ClientSession, headers: dict, tag: str):
                        async with session.get(url, headers=headers) as new_response:
                            if new_response.status != 200:
                                return (tag, None)
                            new_response = await new_response.read()
                            return (tag, new_response)
                    tasks.append(fetch(url=f'https://api.clashofclans.com/v1/players/{tag.replace("#", "%23")}', session=session, headers={"Authorization": f"Bearer {keys[0]}"}, tag=tag))
                results = await asyncio.gather(*tasks, return_exceptions=True)
                await session.close()

        for tag, result in results:
            tag_map[tag] = result
        return tag_map

    tag_map = await get_player_responses(keys=deque(api_keys), tags=player_tags)
    return tag_map'''