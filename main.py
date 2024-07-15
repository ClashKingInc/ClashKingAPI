import uvicorn
import logging

from fastapi.middleware.gzip import GZipMiddleware
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.openapi.utils import get_openapi
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from routers import leagues, player, capital, global_data, clan, war, utility, ranking, redirect, game_data, stats, list, internal, leaderboards, legends, rosters
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from utils.utils import redis, config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    ),
    Middleware(
        GZipMiddleware,
        minimum_size=500
    )
]

app = FastAPI(middleware=middleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.mount("/static", StaticFiles(directory="static"), name="static")


routers = [
    player.router,
    clan.router,
    war.router,
    capital.router,
    leaderboards.router,
    leagues.router,
    legends.router,
    ranking.router,
    stats.router,
    list.router,
    redirect.router,
    game_data.router,
    global_data.router,
    utility.router,
    internal.router,
    rosters.router
]
for router in routers:
    app.include_router(router)


@app.on_event("startup")
async def startup_event():
    FastAPICache.init(InMemoryBackend())


@app.get("/", include_in_schema=False, response_class=RedirectResponse)
async def docs():
    return f"https://api.clashking.xyz/docs"



description = """
### Clash of Clans Based API 👑
- No Auth Required, Free to Use
- Please credit if using these stats in your project, Creator Code: ClashKing
- Ratelimit is largely 30 req/sec, 5 req/sec on post & large requests
- Largely 300 second cache
- Not perfect, stats are collected by polling the Official API
- [ClashKing Discord](https://discord.gg/clashking) | [API Developers](https://discord.gg/clashapi)

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. 
For more information see [Supercell’s Fan Content Policy](https://supercell.com/fan-content-policy)
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

if __name__ == "__main__":
    if config.is_local:
        uvicorn.run("main:app", host='0.0.0.0', port=8000, reload=True, reload_dirs="/routers")



