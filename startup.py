import os
import importlib.util
import textwrap

from routers.v2.link.link import router as accounts_router
from routers.v2.auth.auth import router as auth_router
from routers.v2.rosters.rosters import router as rosters_router
from routers.v2.dates.dates import router as dates_router
from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from coc.errors import HTTPException

def define_app(app: FastAPI):

    #include_routers(app, os.path.join(os.path.dirname(__file__), "routers", "v2"), recursive=True)
    app.include_router(rosters_router)
    app.include_router(accounts_router)
    app.include_router(auth_router)
    app.include_router(dates_router)

    description = textwrap.dedent("""
    ### Clash of Clans Based API 👑
    - No Auth Required, Free to Use
    - Please credit if using these stats in your project, Creator Code: ClashKing
    - Please do not abuse, and respect a 30 req/sec max limit
    - Not perfect, stats are collected by polling the Official API
    - [ClashKing Discord](https://discord.gg/clashking) | [API Developers](https://discord.gg/clashapi)
    
    This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. 
    For more information see [Supercell’s Fan Content Policy](https://supercell.com/fan-content-policy)
    """)

    app.openapi_schema = get_openapi(
        title="ClashKingAPI",
        version="2.0",
        description=description,
        routes=app.routes,
    )

    @app.exception_handler(HTTPException)
    async def coc_exception_handler(request: Request, exc: HTTPException):
        # coc.py exceptions usually expose these; fall back safely
        # `text` often contains the API’s error JSON/string; use str(exc) as last resort
        detail = getattr(exc, "text", str(exc))

        # Optionally forward Retry-After if present (rate limit)
        headers = {}
        retry_after = getattr(exc, "retry_after", None)
        if retry_after is not None:
            headers["Retry-After"] = str(retry_after)

        return JSONResponse(
            status_code=exc.status,
            content={"detail": detail},
            headers=headers
        )


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