import os
import logging
import uvicorn
import importlib.util
import time

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

app = FastAPI(middleware=middleware, 
              title='ClashKingAPI',
              description="""### Clash of Clans Based API 👑
- No Auth Required, Free to Use
- Please credit if using these stats in your project, Creator Code: ClashKing
- Ratelimit is largely 30 req/sec, 5 req/sec on post & large requests
- Largely 300 second cache
- Not perfect, stats are collected by polling the Official API
- [ClashKing Discord](https://discord.gg/clashking) | [CoC API Developers](https://discord.gg/clashapi)

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. 
For more information see [Supercell’s Fan Content Policy](https://supercell.com/fan-content-policy)""",
             version="0.1")
app.mount("/static", StaticFiles(directory="static"), name="static")



def include_routers(app, directory):
    for filename in os.listdir(directory):
        if filename.endswith(".py") and not filename.startswith("__"):
            module_name = filename[:-3]
            file_path = os.path.join(directory, filename)

            spec = importlib.util.spec_from_file_location(module_name, file_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            router = getattr(module, "router", None)
            if router:
                app.include_router(router)

# Include routers from public and private directories
include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "public"))
include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v2"))


@app.on_event("startup")
async def startup_event():
    FastAPICache.init(InMemoryBackend())


@app.get("/", include_in_schema=False, response_class=RedirectResponse)
async def docs():
    if config.is_local:
        return RedirectResponse(f"http://localhost/docs")
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
    return get_swagger_ui_html(openapi_url="/openapi/private", title="Private API Docs", swagger_favicon_url="https://clashk.ing/assets/images/favicon.png")

@app.get("/private/redoc", include_in_schema=False)
async def get_private_redoc():
    return get_redoc_html(openapi_url="/openapi/private", title="Private API Docs", redoc_favicon_url="https://clashk.ing/assets/images/favicon.png")

@app.get("/docs", include_in_schema=False)
async def override_docs():
    return get_swagger_ui_html(openapi_url=app.openapi_url, title=app.title + " - Swagger UI", swagger_favicon_url="https://clashk.ing/assets/images/favicon.png")

@app.get("/redoc", include_in_schema=False)
async def override_redoc():
    return get_redoc_html(openapi_url=app.openapi_url, title=app.title + " - Redoc", redoc_favicon_url="https://clashk.ing/assets/images/favicon.png")

if __name__ == "__main__":
    if config.is_local:
        uvicorn.run("main:app", host="localhost", port=8000, reload=True)
    else:
        uvicorn.run("main:app", host="0.0.0.0", port=8010)



