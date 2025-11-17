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
        # Fetch guild members using bot token
        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            try:
                # Fetch all members - fetch_members returns a list
                all_members = await client.fetch_members(server_id)
            except hikari.ForbiddenError:
                raise HTTPException(
                    status_code=403,
                    detail="Bot does not have access to this server"
                )
            except hikari.NotFoundError:
                raise HTTPException(
                    status_code=404,
                    detail="Server not found"
                )
            except hikari.UnauthorizedError:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid bot token. Please check BOT_TOKEN environment variable."
                )

        # Get all linked accounts for all members at once
        member_ids = [str(m.user.id) for m in all_members]
        all_links = await mongo.coc_accounts.find(
            {"user_id": {"$in": member_ids}}
        ).to_list(length=None)

        # Group links by user_id
        links_by_user = {}
        for link in all_links:
            user_id = link.get("user_id")
            if user_id not in links_by_user:
                links_by_user[user_id] = []
            links_by_user[user_id].append(link)

        # Build member links list WITHOUT fetching player details (too slow)
        # Player details should be fetched on-demand by the frontend
        member_links_list = []
        total_linked_accounts = 0
        verified_accounts = 0

        for member in all_members:
            user_id = str(member.user.id)
            member_link_data = links_by_user.get(user_id, [])

            # Build linked accounts list
            linked_accounts = []
            for link in member_link_data:
                player_tag = link.get("player_tag")
                is_verified = link.get("is_verified", False)

                # Don't fetch player details here - just return the tag
                linked_accounts.append(LinkedAccount(
                    player_tag=player_tag,
                    player_name=None,  # Frontend can fetch if needed
                    town_hall=None,     # Frontend can fetch if needed
                    is_verified=is_verified,
                    added_at=str(link.get("added_at")) if link.get("added_at") else None
                ))

                if is_verified:
                    verified_accounts += 1

            total_linked_accounts += len(linked_accounts)

            # Apply search filter if provided
            if search:
                search_lower = search.lower()
                if not (
                        search_lower in member.user.username.lower() or
                        search_lower in (member.nickname or "").lower() or
                        any(search_lower in acc.player_tag.lower() for acc in linked_accounts)
                ):
                    continue

            member_links_list.append(MemberLinks(
                user_id=user_id,
                username=member.user.username,
                display_name=member.nickname or member.user.username,
                avatar_url=str(member.user.avatar_url) if member.user.avatar_url else None,
                linked_accounts=linked_accounts,
                account_count=len(linked_accounts)
            ))

        # Sort by account count (descending) then by display name
        member_links_list.sort(key=lambda x: (-x.account_count, x.display_name.lower()))

        # Apply pagination
        total_filtered = len(member_links_list)
        paginated_members = member_links_list[offset:offset + limit]

        members_with_links = sum(1 for m in member_links_list if m.account_count > 0)

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