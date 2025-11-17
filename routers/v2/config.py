from typing import Dict, Any
from fastapi import APIRouter
from utils.config import Config

router = APIRouter(prefix="/v2/config", tags=["Configuration"], include_in_schema=True)


@router.get("/public", name="Get public configuration")
async def get_public_config() -> Dict[str, Any]:
    """
    Get non-sensitive configuration values needed by client applications.
    No authentication required - only returns safe, public config values.

    Returns:
        - sentry_dsn_mobile: Sentry DSN for mobile/frontend error tracking
    """
    config = Config()
    return {
        "sentry_dsn_mobile": config.sentry_dsn_mobile,
    }
