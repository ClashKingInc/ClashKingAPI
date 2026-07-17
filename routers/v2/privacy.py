from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends

from routers.v2.auth import User, get_current_user
from utils.utils import db_client, remove_id_fields

router = APIRouter(tags=["Privacy"], include_in_schema=True)


def _utc_now() -> datetime:
    return datetime.utcnow()


def _safe_user(user: User) -> dict[str, Any]:
    return {
        "username": user.username,
        "admin": user.admin,
        "permissions": user.permissions.dict(),
    }


async def _record_privacy_request(username: str, request_type: str) -> dict[str, Any]:
    now = _utc_now()
    record = {
        "username": username,
        "type": request_type,
        "status": "received",
        "received_at": now,
        "source": "api",
    }
    await db_client.privacy_requests.update_one(
        {"username": username, "type": request_type, "status": {"$in": ["received", "in_progress"]}},
        {"$set": record, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"status": "received", "received_at": now.isoformat() + "Z"}


@router.post("/auth/export")
@router.get("/privacy/export")
async def export_current_user(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Return the authenticated API account data without secrets."""
    raw_user = await db_client.api_users.find_one({"username": current_user.username}, {"_id": 0, "password": 0})
    export = {
        "account": _safe_user(current_user),
        "stored_account": raw_user or {},
        "privacy_requests": await db_client.privacy_requests.find(
            {"username": current_user.username},
            {"_id": 0},
        ).to_list(length=100),
    }
    return remove_id_fields(export)


@router.delete("/auth/me")
@router.post("/privacy/delete-request")
async def request_current_user_deletion(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Register an erasure request for the authenticated API account.

    API accounts can carry operational permissions, so this endpoint records the
    verified request for review instead of silently deleting production access.
    """
    result = await _record_privacy_request(current_user.username, "account_deletion")
    return {
        "ok": True,
        "message": "Account deletion request received and queued for operator review.",
        **result,
    }


@router.get("/privacy/retention")
async def privacy_retention() -> dict[str, Any]:
    return {
        "api_auth_tokens": "JWT access tokens expire after 30 minutes.",
        "api_user_records": "Kept while the API account is active or required for security/audit purposes.",
        "privacy_requests": "Kept as compliance evidence for the legal limitation period.",
        "public_game_statistics": "Sourced from the official Clash of Clans API and retained only where needed for ClashKing features.",
    }
