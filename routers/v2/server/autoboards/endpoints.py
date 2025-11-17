import linkd
import pendulum as pend
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId

from utils.database import MongoClient
from utils.security import check_authentication
from utils.sentry_utils import capture_endpoint_errors
from .models import (
    AutoBoardConfig,
    ServerAutoBoardsResponse,
    CreateAutoBoardRequest,
    UpdateAutoBoardRequest
)

security = HTTPBearer()

router = APIRouter(prefix="/v2/server", tags=["Server AutoBoards"], include_in_schema=True)


@router.get("/{server_id}/autoboards", name="Get server autoboards")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_autoboards(
    server_id: int,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> ServerAutoBoardsResponse:
    """
    Get all autoboards configured for a server.
    Returns both auto-post and auto-refresh boards.
    """
    # Get server settings to check autoboard limit
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    autoboard_limit = server.get("autoboard_limit", 10)

    # Find all autoboards for this server
    autoboards_cursor = mongo.autoboards.find({"server_id": server_id})
    autoboards_list = await autoboards_cursor.to_list(length=None)

    # Parse autoboards
    autoboards = []
    post_count = 0
    refresh_count = 0

    for board in autoboards_list:
        board_type = "unknown"
        button_id = board.get("button_id", "")

        # Extract board type from button_id (e.g., "clandetailed:tag:page=0")
        if ":" in button_id:
            board_type = button_id.split(":")[0]

        autoboard_config = AutoBoardConfig(
            id=str(board.get("_id")),
            type=board.get("type", "refresh"),
            board_type=board_type,
            button_id=button_id,
            webhook_id=str(board.get("webhook_id")) if board.get("webhook_id") else "",
            thread_id=str(board.get("thread_id")) if board.get("thread_id") else None,
            channel_id=str(board.get("channel_id")) if board.get("channel_id") else None,
            days=board.get("days", []),
            locale=board.get("locale", "en-US"),
            created_at=str(board.get("created_at")) if board.get("created_at") else None
        )

        autoboards.append(autoboard_config)

        if board.get("type") == "post":
            post_count += 1
        else:
            refresh_count += 1

    return ServerAutoBoardsResponse(
        autoboards=autoboards,
        total=len(autoboards),
        post_count=post_count,
        refresh_count=refresh_count,
        limit=autoboard_limit
    )


@router.post("/{server_id}/autoboards", name="Create an autoboard")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def create_autoboard(
    server_id: int,
    autoboard: CreateAutoBoardRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> dict:
    """
    Create a new autoboard for a server.
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check autoboard limit
    autoboard_limit = server.get("autoboard_limit", 10)
    existing_count = await mongo.autoboards.count_documents({"server_id": server_id})

    if existing_count >= autoboard_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Autoboard limit reached ({existing_count}/{autoboard_limit}). Please upgrade or delete existing autoboards."
        )

    # Validate type
    if autoboard.type not in ["post", "refresh"]:
        raise HTTPException(status_code=400, detail="Type must be 'post' or 'refresh'")

    # Validate days for auto-post
    if autoboard.type == "post" and not autoboard.days:
        raise HTTPException(status_code=400, detail="Days are required for auto-post boards")

    # Build autoboard document
    autoboard_doc = {
        "server_id": server_id,
        "type": autoboard.type,
        "button_id": autoboard.button_id,
        "webhook_id": int(autoboard.webhook_id) if autoboard.webhook_id else None,
        "thread_id": int(autoboard.thread_id) if autoboard.thread_id else None,
        "channel_id": int(autoboard.channel_id) if autoboard.channel_id else None,
        "days": autoboard.days or [],
        "locale": autoboard.locale or "en-US",
        "created_at": pend.now(tz=pend.UTC)
    }

    # Insert into database
    result = await mongo.autoboards.insert_one(autoboard_doc)

    return {
        "message": "Autoboard created successfully",
        "autoboard_id": str(result.inserted_id),
        "server_id": server_id,
        "type": autoboard.type
    }


@router.patch("/{server_id}/autoboards/{autoboard_id}", name="Update an autoboard")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def update_autoboard(
    server_id: int,
    autoboard_id: str,
    autoboard: UpdateAutoBoardRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> dict:
    """
    Update an existing autoboard.
    """
    # Verify autoboard exists and belongs to server
    existing = await mongo.autoboards.find_one({
        "_id": ObjectId(autoboard_id),
        "server_id": server_id
    })

    if not existing:
        raise HTTPException(status_code=404, detail="Autoboard not found")

    # Build update document
    update_doc = {}
    if autoboard.type is not None:
        if autoboard.type not in ["post", "refresh"]:
            raise HTTPException(status_code=400, detail="Type must be 'post' or 'refresh'")
        update_doc["type"] = autoboard.type

    if autoboard.days is not None:
        update_doc["days"] = autoboard.days

    if autoboard.webhook_id is not None:
        update_doc["webhook_id"] = int(autoboard.webhook_id)

    if autoboard.thread_id is not None:
        update_doc["thread_id"] = int(autoboard.thread_id)

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update autoboard
    result = await mongo.autoboards.update_one(
        {"_id": ObjectId(autoboard_id)},
        {"$set": update_doc}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Autoboard not found")

    return {
        "message": "Autoboard updated successfully",
        "autoboard_id": autoboard_id,
        "updated_fields": len(update_doc)
    }


@router.delete("/{server_id}/autoboards/{autoboard_id}", name="Delete an autoboard")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def delete_autoboard(
    server_id: int,
    autoboard_id: str,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> dict:
    """
    Delete an autoboard.
    """
    # Verify autoboard exists and belongs to server
    result = await mongo.autoboards.delete_one({
        "_id": ObjectId(autoboard_id),
        "server_id": server_id
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Autoboard not found")

    return {
        "message": "Autoboard deleted successfully",
        "autoboard_id": autoboard_id
    }