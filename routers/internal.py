import aiohttp
import orjson
import re
import snappy
import asyncio
import tempfile

from aiocache import Cache, cached
from aiocache.serializers import PickleSerializer
from collections import defaultdict, deque
from fastapi import  Request, Response, HTTPException
from fastapi.responses import FileResponse
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

request_queue = asyncio.Queue(maxsize=10)
processing_lock = asyncio.Lock()

# Define cache with aiocache
cache = Cache(Cache.MEMORY, serializer=PickleSerializer(), ttl=24*60*60)

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
    passwords = [config.coc_password] * (config.max_coc_email + 1 - config.min_coc_email)
    KEYS = await create_keys(emails=emails, passwords=passwords, ip="65.109.27.116")
    KEYS = deque(KEYS)


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


@router.get("/ss/{tag}", include_in_schema=False)
async def screenshot(tag: str, request: Request, response: Response):
    tag = fix_tag(tag).replace("#", "")
    #url = f"http://47.189.101.107:5000/ss/{tag}"

    cached_response = await cache.get(tag)
    if cached_response:
        # Write the cached image to a temporary file and return it
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(cached_response)
            tmp_path = tmp.name
        return FileResponse(tmp_path, media_type="image/png", filename=f"{tag}.png")

    # Check if the queue is full
    if request_queue.full():
        raise HTTPException(status_code=429, detail="Queue is full. Please try again later.")

    # Add the request to the queue
    await request_queue.put(tag)

    # Process the queue
    while True:
        # Wait until it's this request's turn
        current_tag = await request_queue.get()
        if current_tag == tag:
            break
        else:
            # Put the item back if it's not the current one
            await request_queue.put(current_tag)
            await asyncio.sleep(1)

    # Process the request
    async with processing_lock:
        image_content = await fetch_image(f"http://{config.ss_ip}:5000/ss/{tag}")
        await cache.set(tag, image_content)
        request_queue.task_done()

    return Response(content=image_content, media_type="image/png")



@router.get("/permalink/{clan_tag}",
         name="Permanent Link to Clan Badge URL")
async def permalink(clan_tag: str):
    global KEYS
    headers = {"Accept": "application/json", "authorization": f"Bearer {KEYS[0]}"}
    KEYS.rotate(1)
    async with aiohttp.ClientSession() as session:
        async with session.get(
                f"https://api.clashofclans.com/v1/clans/{clan_tag.replace('#', '%23')}",
                headers=headers) as response:
            items = await response.json()
    image_link = items["badgeUrls"]["large"]

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

