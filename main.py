import os
import logging
import uvicorn
import importlib.util
from contextlib import asynccontextmanager
import coc

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from slowapi import Limiter
from slowapi.util import get_ipaddr
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

from utils.utils import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_ipaddr)
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    coc_client = coc.Client(
        base_url='https://proxy.clashk.ing/v1',
        key_count=10,
        key_names='test',
        throttle_limit=500,
        cache_max_size=10_000,
        load_game_data=coc.LoadGameData(default=False),
        raw_attribute=True,
        stats_max_size=10_000,
    )
    await coc_client.login_with_tokens('')
    app.state.coc_client = coc_client
    yield

app = FastAPI(middleware=middleware, lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")



def include_routers(app: FastAPI, directory: str):
    """Recursively include all FastAPI routers from Python files under the given directory."""

    for root, _, files in os.walk(directory):
        for filename in files:
            if filename.endswith(".py") and not filename.startswith("__"):
                file_path = os.path.join(root, filename)

                # Generate a fake module name (e.g. 'v2.endpoints.clan')
                module_path = os.path.relpath(file_path, start=os.getcwd()).replace(os.sep, ".")
                module_name = module_path[:-3]  # remove .py

                # Load module dynamically
                spec = importlib.util.spec_from_file_location(module_name, file_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Include the router if present
                router = getattr(module, "router", None)
                if router:
                    app.include_router(router)

# Include routers from public (v1) and private (v2 with subfolders)
#include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v1"))
include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v2"))


@app.on_event("startup")
async def startup_event():
    FastAPICache.init(InMemoryBackend())


@app.get("/", include_in_schema=False, response_class=RedirectResponse)
async def docs():
    if config.is_local:
        return RedirectResponse("http://localhost:8000/docs")
    return RedirectResponse("https://api.clashk.ing/docs")

@app.get("/openapi/private", include_in_schema=False)
async def get_private_openapi():
    from fastapi.openapi.utils import get_openapi
    print(app.routes[0].__dict__)
    routes = [route for route in app.routes if not route.__dict__.get('include_in_schema')]
    for route in routes:
        route.__dict__['include_in_schema'] = True
    schema = get_openapi(
        title="Private Endpoints",
        version="1.0.0",
        routes=routes,
    )
    for route in routes:
        route.__dict__['include_in_schema'] = False
    return schema

@app.get("/private/docs", include_in_schema=False)
async def get_private_docs():
    return get_swagger_ui_html(openapi_url="/openapi/private", title="Private API Docs")


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
        version="0.1",
        description=description,
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

if __name__ == "__main__":
    if config.is_local:
        uvicorn.run("main:app", host="localhost", port=8000, reload=True)
    else:
        uvicorn.run("main:app", host="0.0.0.0", port=8010)



