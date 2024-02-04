import uvicorn

from fastapi.middleware.gzip import GZipMiddleware
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.openapi.utils import get_openapi
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from routers import leagues, player, capital, other, clan, war, utility, ranking, redirect, game_data, bans, stats, list, server_info
from api_analytics.fastapi import Analytics
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from utils.utils import redis, config

limiter = Limiter(key_func=get_remote_address)
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    ),
    Middleware(
        Analytics,
        api_key=config.analytics_token
    ),
    Middleware(
        GZipMiddleware,
        minimum_size=500
    )
]

app = FastAPI(middleware=middleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


routers = [
    player.router,
    clan.router,
    war.router,
    capital.router,
    leagues.router,
    ranking.router,
    stats.router,
    list.router,
    redirect.router,
    game_data.router,
    other.router,
    utility.router,
]
for router in routers:
    app.include_router(router)


@app.on_event("startup")
async def startup_event():
    FastAPICache.init(RedisBackend(redis), prefix="fastapi-cache")

@app.get("/", include_in_schema=False, response_class=RedirectResponse)
async def docs():
    return f"https://api.clashking.xyz/docs"



description = """
### Clash of Clans Based API 👑
- No Auth Required
- Ratelimit is largely 30 req/sec, 5 req/sec on post & large requests
- 300 second cache
- Not perfect, stats are collected by polling the Official API
- [Discord Server](https://discord.gg/gChZm3XCrS)

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. For more information see Supercell’s Fan Content Policy: www.supercell.com/fan-content-policy.
"""

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="ClashKingAPI",
        version="1.0",
        description=description,
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

if __name__ == '__main__':
    if not config.is_local:
        uvicorn.run("main:app", host='0.0.0.0', port=443, workers=6)
    else:
        uvicorn.run("main:app", host='localhost', port=80)

