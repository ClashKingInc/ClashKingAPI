import sentry_sdk
import uvicorn
import contextlib
import coc
import linkd
import hikari
import typing as t
from pathlib import Path
from datetime import datetime, timezone
from sentry_sdk.integrations.fastapi import FastApiIntegration
from startup import define_app
import fastapi
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from utils.config import Config
from utils.custom_coc import CustomClashClient
from utils.database import MongoClient

manager = linkd.DependencyInjectionManager()
registry = manager.registry_for(linkd.Contexts.ROOT)

coc_client = CustomClashClient(
    base_url='https://proxy.clashk.ing/v1',
    key_count=10,
    key_names='test',
    throttle_limit=500,
    cache_max_size=10_000,
    load_game_data=coc.LoadGameData(default=False),
    raw_attribute=True,
    stats_max_size=10_000,
)
registry.register_value(CustomClashClient, coc_client)

config = Config()
registry.register_value(Config, config)

# Initialize Sentry SDK
sentry_sdk.init(
    dsn=config.sentry_dsn,
    integrations=[FastApiIntegration()],
    traces_sample_rate=1.0,
    environment='development' if config.is_local else 'production',
    send_default_pii=True,
    ignore_errors=[
        KeyboardInterrupt,
        BrokenPipeError,
        ConnectionResetError,
    ],
)

mongo_client = MongoClient(
    uri=config.stats_mongodb, compressors=['snappy', 'zlib']
)
registry.register_value(MongoClient, mongo_client)

rest = hikari.RESTApp()
registry.register_value(hikari.RESTApp, rest)


@contextlib.asynccontextmanager
async def lifespan(_: fastapi.FastAPI) -> t.AsyncGenerator[None, t.Any]:
    # Record startup time
    startup_time = datetime.now(timezone.utc)
    registry.register_value(datetime, startup_time)

    try:
        await coc_client.login_with_tokens('')
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"startup": "coc_login_failed"})
        raise

    try:
        await rest.start()
        # Initialize FastAPI cache
        FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
        print("✅ Startup tasks completed successfully")
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"startup": "failed"})
        raise

    yield

    print("🔄 Application shutting down...")
    await manager.close()


middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_methods=['*'],
        allow_headers=['*'],
    ),
    Middleware(GZipMiddleware, minimum_size=500),
]

STATIC_DIR = Path(__file__).resolve().parent / 'static'
STATIC_DIR.mkdir(exist_ok=True)

app = FastAPI(middleware=middleware, lifespan=lifespan)
app.state.di = manager
linkd.ext.fastapi.use_di_context_middleware(app, manager)
app.mount('/static', StaticFiles(directory=str(STATIC_DIR)), name='static')
define_app(app=app)

if __name__ == '__main__':
    if config.is_local:
        uvicorn.run('main:app', host='localhost', port=8000, reload=True)
    else:
        uvicorn.run('main:app', host='0.0.0.0', port=8010)
