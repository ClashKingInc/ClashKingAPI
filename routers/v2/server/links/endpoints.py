import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional

from utils.database import MongoClient
from utils.security import check_authentication
from utils.config import Config
from utils.custom_coc import CustomClashClient
from utils.sentry_utils import capture_endpoint_errors
from .models import (
    LinkedAccount,
    MemberLinks,
    ServerLinksResponse,
    BulkUnlinkRequest
)
from coc.utils import correct_tag

config = Config()
security = HTTPBearer()

router = APIRouter(prefix="/v2/server", tags=["Server Links"], include_in_schema=True)

@router.get("/{server_id}/links", name="Get all member links for a server")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_links(
        server_id: int,
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp,
        coc_client: CustomClashClient
) -> ServerLinksResponse:
    """
    Get all Discord members in a server with their linked CoC accounts.
    Supports pagination and search.
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Verify bot token is configured
    if not config.bot_token:
        raise HTTPException(
            status_code=500,
            detail="Bot token not configured. Please set BOT_TOKEN environment variable."
        )

    try:
        # Use MongoDB aggregation to group links by user and get stats
        # This is MUCH faster than fetching all Discord members
        pipeline = [
            {"$group": {
                "_id": "$user_id",
                "links": {"$push": {
                    "player_tag": "$player_tag",
                    "is_verified": "$is_verified",
                    "added_at": "$added_at"
                }},
                "account_count": {"$sum": 1},
                "verified_count": {"$sum": {"$cond": ["$is_verified", 1, 0]}}
            }},
            {"$sort": {"account_count": -1}}
        ]

        links_by_user_cursor = await mongo.coc_accounts.aggregate(pipeline)
        links_grouped = await links_by_user_cursor.to_list(length=None)

        # Calculate total stats
        total_linked_accounts = sum(group["account_count"] for group in links_grouped)
        verified_accounts = sum(group["verified_count"] for group in links_grouped)
        total_members_with_links = len(links_grouped)

        # Apply search filter if provided (on player tags only, since we don't have Discord info yet)
        if search:
            search_lower = search.lower()
            links_grouped = [
                group for group in links_grouped
                if any(search_lower in link["player_tag"].lower() for link in group["links"])
            ]

        # Apply pagination on the grouped results
        total_filtered = len(links_grouped)
        paginated_groups = links_grouped[offset:offset + limit]

        # Now fetch Discord member info ONLY for the paginated results
        member_links_list = []
        user_ids_to_fetch = [group["_id"] for group in paginated_groups]

        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            try:
                # Fetch only the members we need
                members_data = {}
                for user_id in user_ids_to_fetch:
                    try:
                        member = await client.fetch_member(server_id, int(user_id))
                        members_data[user_id] = member
                    except (hikari.NotFoundError, hikari.ForbiddenError):
                        # Member might have left the server or bot doesn't have access
                        # Still include them with limited info
                        members_data[user_id] = None
            except hikari.UnauthorizedError:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid bot token. Please check BOT_TOKEN environment variable."
                )
            except hikari.UnauthorizedError:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid bot token. Please check BOT_TOKEN environment variable."
                )

        # Build the response for paginated results
        for group in paginated_groups:
            user_id = group["_id"]
            member = members_data.get(user_id)

            # Build linked accounts list
            linked_accounts = []
            for link in group["links"]:
                linked_accounts.append(LinkedAccount(
                    player_tag=link["player_tag"],
                    player_name=None,  # Frontend can fetch if needed
                    town_hall=None,     # Frontend can fetch if needed
                    is_verified=link.get("is_verified", False),
                    added_at=str(link.get("added_at")) if link.get("added_at") else None
                ))

            # Get Discord user info if available
            if member:
                username = member.user.username
                display_name = member.nickname or member.user.username
                avatar_url = str(member.user.avatar_url) if member.user.avatar_url else None
            else:
                # Member not in server anymore, show user_id only
                username = f"User {user_id}"
                display_name = f"User {user_id}"
                avatar_url = None

            member_links_list.append(MemberLinks(
                user_id=user_id,
                username=username,
                display_name=display_name,
                avatar_url=avatar_url,
                linked_accounts=linked_accounts,
                account_count=len(linked_accounts)
            ))

        paginated_members = member_links_list
        members_with_links = total_members_with_links

        return ServerLinksResponse(
            members=paginated_members,
            total_members=total_filtered,
            members_with_links=members_with_links,
            total_linked_accounts=total_linked_accounts,
            verified_accounts=verified_accounts
        )

    except HTTPException:
        raise
    except Exception as e:
        # Log the full exception for debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch server links: {str(e)}"
        )

@router.delete("/{server_id}/links/{user_discord_id}/{player_tag}", name="Unlink account from member")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def unlink_member_account(
        server_id: int,
        user_discord_id: str,
        player_tag: str,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Unlink a specific CoC account from a Discord member.
    Requires manage server permissions (handled by @check_authentication).
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Normalize player tag
    normalized_tag = correct_tag(tag=player_tag)

    # Delete the link
    result = await mongo.coc_accounts.delete_one({
        "user_id": user_discord_id,
        "player_tag": normalized_tag
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Link not found or already removed"
        )

    # Reorder remaining accounts for this user
    remaining_accounts = await mongo.coc_accounts.find(
        {"user_id": user_discord_id}
    ).sort("order_index", 1).to_list(length=None)

    from pymongo import UpdateOne
    updates = []
    for index, account in enumerate(remaining_accounts):
        updates.append(UpdateOne(
            {"_id": account["_id"]},
            {"$set": {"order_index": index}}
        ))

    if updates:
        await mongo.coc_accounts.bulk_write(updates, ordered=False)

    return {
        "message": "Account unlinked successfully",
        "player_tag": normalized_tag,
        "user_id": user_discord_id
    }

@router.post("/{server_id}/links/bulk-unlink", name="Bulk unlink accounts from member")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def bulk_unlink_accounts(
        server_id: int,
        request: BulkUnlinkRequest,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Unlink multiple CoC accounts from a Discord member at once.
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Normalize all tags
    normalized_tags = [correct_tag(tag=tag) for tag in request.player_tags]

    # Delete all specified links
    result = await mongo.coc_accounts.delete_many({
        "user_id": request.user_id,
        "player_tag": {"$in": normalized_tags}
    })

    # Reorder remaining accounts
    remaining_accounts = await mongo.coc_accounts.find(
        {"user_id": request.user_id}
    ).sort("order_index", 1).to_list(length=None)

    from pymongo import UpdateOne
    updates = []
    for index, account in enumerate(remaining_accounts):
        updates.append(UpdateOne(
            {"_id": account["_id"]},
            {"$set": {"order_index": index}}
        ))

    if updates:
        await mongo.coc_accounts.bulk_write(updates, ordered=False)

    return {
        "message": f"{result.deleted_count} accounts unlinked successfully",
        "deleted_count": result.deleted_count,
        "user_id": request.user_id
    }