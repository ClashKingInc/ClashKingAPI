import hikari
import pendulum as pend
import linkd

from fastapi import HTTPException, APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from coc.utils import correct_tag
from routers.v2.auth.auth_models import CocAccountRequest
from utils.config import Config
from utils.database import MongoClient
from utils.custom_coc import CustomClashClient
from utils.security import check_authentication

router = APIRouter(prefix="/v2", tags=["Linking"], include_in_schema=True)
security = HTTPBearer()

@router.post("/link", name="Link a Clash of Clans account to a user (with auth)")
@linkd.ext.fastapi.inject
@check_authentication
async def link_add_with_auth(
        request: CocAccountRequest,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        coc_client: CustomClashClient,
        mongo: MongoClient
):
    player = await coc_client.get_player(player_tag=request.player_tag)
    verified = await coc_client.verify_player_token(player_tag=request.player_tag, token=str(request.api_token))

    if request.player_token is not None and not verified:
        raise HTTPException(
            status_code=401,
            detail={
                "message": f"Invalid API Token ({request.token})",
                "account": {
                    "tag": player.tag,
                    "name": player.name,
                    "townHallLevel": player.town_hall
                }
            }
        )

    existing_account = await mongo.coc_accounts.find_one({"player_tag": player.tag})
    if existing_account:
        await mongo.coc_accounts.update_one({"player_tag": player.tag}, {"$set": {"is_verified": verified}})
    else:
        existing_accounts = await mongo.coc_accounts.count_documents({"user_id": user_id})
        order_index = existing_accounts  # The new account will be added at the end

        await mongo.coc_accounts.insert_one({
            "user_id": user_id,
            "player_tag": player.tag,
            "order_index": order_index,
            "is_verified": verified,
            "added_at": pend.now(tz=pend.UTC)
        })

    # Return account details to the front-end
    return {
        "message": "Clash of Clans account linked successfully",
        "account": {
            "tag": player.tag,
            "name": player.name,
            "townHallLevel": player.town_hall,
            "is_verified": verified
        }
    }


@router.post("/link/no-auth",
             name="Link a Clash of Clans account to a user (requires api token)")
@linkd.ext.fastapi.inject
async def link_add_no_auth(
        request: CocAccountRequest,
        user_id: str,
        *,
        coc_client: CustomClashClient,
        mongo: MongoClient
):
    if not user_id.isdigit():
        raise HTTPException(
            status_code=401,
            detail={
                "message": f"Invalid Discord ID ({user_id})",
            }
        )
    player = await coc_client.get_player(player_tag=request.player_tag)
    verified = await coc_client.verify_player_token(player_tag=request.player_tag, token=str(request.api_token))

    if not verified:
        raise HTTPException(
            status_code=401,
            detail={
                "message": f"Invalid API Token ({request.token})",
                "account": {
                    "tag": player.tag,
                    "name": player.name,
                    "townHallLevel": player.town_hall
                }
            }
        )

    existing_account = await mongo.coc_accounts.find_one({"player_tag": player.tag})
    if existing_account:
        await mongo.coc_accounts.update_one({"player_tag": player.tag}, {"$set": {"is_verified": verified}})
    else:
        existing_accounts = await mongo.coc_accounts.count_documents({"user_id": user_id})
        order_index = existing_accounts  # The new account will be added at the end

        await mongo.coc_accounts.insert_one({
            "user_id": user_id,
            "player_tag": player.tag,
            "order_index": order_index,
            "is_verified": verified,
            "added_at": pend.now(tz=pend.UTC)
        })

    # Return account details to the front-end
    return {
        "message": "Clash of Clans account linked successfully",
        "account": {
            "tag": player.tag,
            "name": player.name,
            "townHallLevel": player.town_hall,
            "is_verified": verified
        }
    }



@router.get("/links/{tag_or_id}",
            name="Get links for a user or tag")
@linkd.ext.fastapi.inject
async def get_coc_accounts(
        tag_or_id: str,
        *,
        mongo: MongoClient
):
    if tag_or_id.isnumeric():
        accounts = await mongo.coc_accounts.find({"user_id": tag_or_id}, {"_id" : 0}).sort("order_index", 1).to_list(length=None)
    else:
        accounts = await mongo.coc_accounts.find({"player_tag": tag_or_id}, {"_id" : 0}).sort("order_index", 1).to_list(length=None)

    return {"items": accounts}



@router.delete("/link/{tag}",
               name="Remove a Clash of Clans account linked to a user")
@linkd.ext.fastapi.inject
@check_authentication
async def remove_coc_account(
        tag: str,
        user_id: str,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient
):
    """Remove a specific Clash of Clans account linked to a user."""
    # Normalize the tag (converts lowercase to uppercase and fixes format)
    player_tag = correct_tag(tag=tag)
    result = await mongo.coc_accounts.delete_one({"user_id": user_id, "player_tag": player_tag})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    # Reorder the remaining accounts
    remaining_accounts = await mongo.coc_accounts.find({"user_id": user_id}).sort("order_index", 1).to_list(length=None)

    for index, account in enumerate(remaining_accounts):
        await mongo.coc_accounts.update_one(
            {"_id": account["_id"]},
            {"$set": {"order_index": index}}
        )

    return {"message": "Clash of Clans account unlinked successfully"}

@router.delete("/link/no-auth/{tag}", name="Remove a Clash of Clans account linked to a user (requires api token)")
@linkd.ext.fastapi.inject
async def remove_coc_account_no_auth(
        tag: str,
        api_token: str,
        *,
        mongo: MongoClient,
        coc_client: CustomClashClient
):
    player = await coc_client.get_player(player_tag=tag)
    verified = await coc_client.verify_player_token(player_tag=tag, token=api_token)
    if not verified:
        raise HTTPException(
            status_code=401,
            detail={
                "message": f"Invalid API Token ({api_token})",
                "account": {
                    "tag": player.tag,
                    "name": player.name,
                    "townHallLevel": player.town_hall
                }
            }
        )

    result = await mongo.coc_accounts.delete_one({"player_tag": player.tag})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    user_id = result.get("user_id")
    # Reorder the remaining accounts
    remaining_accounts = await mongo.coc_accounts.find({"user_id": user_id}).sort("order_index", 1).to_list(length=None)

    for index, account in enumerate(remaining_accounts):
        await mongo.coc_accounts.update_one(
            {"_id": account["_id"]},
            {"$set": {"order_index": index}}
        )

    return {"message": "Clash of Clans account unlinked successfully"}



@router.put("/links/reorder", name="Reorder linked Clash of Clans accounts")
@linkd.ext.fastapi.inject
@check_authentication
async def reorder_coc_accounts(
        request: dict,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
):

    new_order = request.get("ordered_tags", [])
    if not new_order:
        raise HTTPException(status_code=400, detail="Ordered tags list cannot be empty")

    # Check if all the accounts provided are linked to the user
    user_accounts = await mongo.coc_accounts.find({"user_id": user_id}).to_list(length=None)
    user_tags = {account["player_tag"] for account in user_accounts}

    if not set(new_order).issubset(user_tags):
        raise HTTPException(status_code=400, detail="Invalid account tags provided")

    # Update the order index for each account
    for index, tag in enumerate(new_order):
        await mongo.coc_accounts.update_one(
            {"user_id": user_id, "player_tag": tag},
            {"$set": {"order_index": index}}
        )

    return {"message": "Accounts reordered successfully"}

