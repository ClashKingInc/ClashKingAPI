import os
import logging
import uvicorn
import importlib.util
import time
import sentry_sdk

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from slowapi import Limiter
from slowapi.util import get_ipaddr
from slowapi.middleware import SlowAPIMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

from utils.utils import config, coc_client

# Initialize Sentry SDK
sentry_sdk.init(
    dsn=config.SENTRY_DSN,
    send_default_pii=True,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_ipaddr)
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Support mobile apps, web browsers, and bots
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
        allow_credentials=True,  # Enable for web browsers and potential cookie-based auth
        expose_headers=["*"],
    ),
    Middleware(
        GZipMiddleware,
        minimum_size=500
    )
]

app = FastAPI(middleware=middleware)
app.mount("/static", StaticFiles(directory="static"), name="static")




def include_routers(app, directory, recursive=False):
    """Include routers from a given directory. If recursive is True, search for 'endpoints.py' in subdirectories."""
    for root, _, files in os.walk(directory) if recursive else [(directory, [], os.listdir(directory))]:
        for filename in files:
            if filename == "endpoints.py" if recursive else filename.endswith(".py") and not filename.startswith("__"):
                module_name = os.path.relpath(os.path.join(root, filename), start=directory).replace(os.sep, ".")[:-3]
                file_path = os.path.join(root, filename)

                spec = importlib.util.spec_from_file_location(module_name, file_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                router = getattr(module, "router", None)
                if router:
                    app.include_router(router)

# Include routers from public (v1) and private (v2 with subfolders)
include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v1"))
include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v2"), recursive=True)


@app.on_event("startup")
async def startup_event():
    FastAPICache.init(InMemoryBackend())
    await coc_client.login_with_tokens('')


@app.get("/", include_in_schema=False, response_class=RedirectResponse)
async def docs():
    if config.IS_LOCAL:
        return RedirectResponse(f"http://localhost:8000/docs")
    if config.IS_DEV:
        return RedirectResponse(f"https://dev-api.clashk.ing/docs")
    return RedirectResponse(f"https://api.clashk.ing/docs")

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
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=config.RELOAD)


