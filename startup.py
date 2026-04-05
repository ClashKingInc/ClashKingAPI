import os
import importlib.util
import textwrap

from routers.v2.accounts.endpoints import router as accounts_router
from routers.v2.auth.endpoints import router as auth_router
from routers.v2.rosters.endpoints import router as rosters_router
from routers.v2.dates.endpoints import router as dates_router
from routers.v2.war.endpoints import router as war_router
from routers.v2.ui.ui import router as ui_router
from routers.v2.config import router as config_router
from routers.v2.internal.endpoints import router as internal_router
from routers.v2.server.settings.endpoints import router as server_router
from routers.v2.server.logs.endpoints import router as server_logs_router
from routers.v2.server.reminders.endpoints import router as server_reminders_router
from routers.v2.server.giveaways.endpoints import router as server_giveaways_router
from routers.v2.server.tickets.endpoints import router as server_tickets_router
from routers.v2.server.panels.endpoints import router as server_panels_router
from routers.v2.server.autoboards.endpoints import router as server_autoboards_router
from routers.v2.server.links.endpoints import router as server_links_router
from routers.v2.server.clans.endpoints import router as server_clans_router
from routers.v2.server.roles.endpoints import router as server_roles_router
from routers.v2.server.family_roles.endpoints import router as server_family_roles_router
from routers.v2.server.guilds.endpoints import router as guilds_router, guild_router
from routers.v2.server.strikes.endpoints import router as server_strikes_router
from routers.v2.server.bans.endpoints import router as server_bans_router
from routers.v2.server.countdowns.endpoints import router as server_countdowns_router
from routers.v2.capital.endpoints import router as capital_router
from routers.v2.activity.endpoints import router as activity_router
from routers.v2.legends.endpoints import router as legends_router
from routers.v2.mobile.endpoints import router as mobile_router
from routers.v2.static_data.endpoints import router as static_data_router
from routers.v2.clan.endpoints import router as clan_router

# V1 Routers
from routers.v1.clan import router as v1_clan_router
from routers.v1.capital import router as v1_capital_router

from fastapi.openapi.utils import get_openapi
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from coc.errors import HTTPException

def define_app(app: FastAPI):
    # V2 Routers
    v2_routers = [
        config_router,
        internal_router,
        rosters_router,
        accounts_router,
        auth_router,
        dates_router,
        war_router,
        ui_router,
        guilds_router,
        guild_router,
        server_router,
        server_logs_router,
        server_reminders_router,
        server_giveaways_router,
        server_tickets_router,
        server_panels_router,
        server_links_router,
        server_autoboards_router,
        server_clans_router,
        server_roles_router,
        server_family_roles_router,
        server_strikes_router,
        server_bans_router,
        server_countdowns_router,
        capital_router,
        activity_router,
        legends_router,
        mobile_router,
        static_data_router,
        clan_router,
    ]

    # V1 Routers
    v1_routers = [
        v1_clan_router,
        v1_capital_router,
    ]

    # Include all routers
    for router in v2_routers + v1_routers:
        app.include_router(router)

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
    async def coc_exception_handler(_request: Request, exc: HTTPException):
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


def include_routers(app, directory: str, recursive: bool = False):
    """Include routers from a given directory. If recursive is True, search for 'endpoints.py' in subdirectories."""
    for root, _, files in os.walk(directory) if recursive else [(directory, [], os.listdir(directory))]:
        for filename in files:
            if filename == "endpoints.py" if recursive else filename.endswith(".py") and not filename.startswith("__"):
                file_path = os.path.join(str(root), filename)
                module_name = os.path.relpath(file_path, start=directory).replace(os.sep, ".")[:-3]

                spec = importlib.util.spec_from_file_location(module_name, file_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                router = getattr(module, "router", None)
                if router:
                    app.include_router(router)
