import pendulum as pend
import re
from fastapi import HTTPException, Header, APIRouter

from routers.v2.accounts.utils import fetch_coc_account_data, is_coc_account_linked, verify_coc_ownership
from routers.v2.auth.models import CocAccountRequest
from utils.utils import db_client, generate_custom_id
from utils.auth_utils import decode_jwt

router = APIRouter(prefix="/v2", tags=["Coc Accounts"], include_in_schema=True)


@router.post("/users/add-coc-account", name="Link a Clash of Clans account to a user")
async def add_coc_account(request: CocAccountRequest, authorization: str = Header(None)):
    """Associate a Clash of Clans account (tag) with a user WITHOUT ownership verification."""
    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]
    coc_tag = request.coc_tag

    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    # Fetch account details from the API
    coc_account_data = await fetch_coc_account_data(coc_tag)

    if await is_coc_account_linked(coc_tag):
        raise HTTPException(status_code=409, detail="This Clash of Clans account is already linked to another user")

    # Get the order index for the new account
    existing_accounts = await db_client.coc_accounts.count_documents({"user_id": user_id})
    order_index = existing_accounts  # The new account will be added at the end

    # Store in the database
    await db_client.coc_accounts.insert_one({
        "_id": generate_custom_id(int(user_id)),
        "user_id": user_id,
        "coc_tag": coc_account_data["tag"],
        "order_index": order_index,
        "added_at": pend.now()
    })

    # Return account details to the front-end
    return {
        "message": "Clash of Clans account linked successfully",
        "account": {
            "tag": coc_account_data["tag"],
            "name": coc_account_data["name"],
            "townHallLevel": coc_account_data["townHallLevel"],
            "clan_tag": coc_account_data.get("clan", {}).get("tag"),
        }
    }


@router.post("/users/add-coc-account-with-token",
             name="Link a Clash of Clans account to a user with a token verification")
async def add_coc_account_with_verification(request: CocAccountRequest, authorization: str = Header(None)):
    """Associate a Clash of Clans account with a user WITH ownership verification."""
    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]
    coc_tag = request.coc_tag
    player_token = request.player_token

    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    if not await verify_coc_ownership(coc_tag, player_token):
        raise HTTPException(status_code=403,
                            detail="Invalid player token. Check your Clash of Clans account settings and try again.")

    # Fetch account details from the API
    coc_account_data = await fetch_coc_account_data(coc_tag)

    # Remove the link to the other user if it exists
    old_account = await db_client.coc_accounts.find_one({"coc_tag": coc_tag})
    if old_account:
        old_user_id = old_account["user_id"]

        # Delete the old account link
        await db_client.coc_accounts.delete_one({"coc_tag": coc_tag})

        # Update the order index for the remaining accounts
        remaining_accounts = await db_client.coc_accounts.find({"user_id": old_user_id}).sort("order_index", 1).to_list(
            length=None)

        for index, account in enumerate(remaining_accounts):
            await db_client.coc_accounts.update_one(
                {"_id": account["_id"]},
                {"$set": {"order_index": index}}
            )

    # Get the order index for the new account
    existing_accounts = await db_client.coc_accounts.count_documents({"user_id": user_id})
    order_index = existing_accounts  # The new account will be added at the end

    # Store in the database
    await db_client.coc_accounts.insert_one({
        "_id": generate_custom_id(int(user_id)),
        "user_id": user_id,
        "coc_tag": coc_account_data["tag"],
        "order_index": order_index,
        "added_at": pend.now()
    })

    # Return account details to the front-end
    return {
        "message": "Clash of Clans account linked successfully with ownership verification",
        "account": {
            "tag": coc_account_data["tag"],
            "name": coc_account_data["name"],
            "townHallLevel": coc_account_data["townHallLevel"]
        }
    }


@router.get("/users/coc-accounts", name="Get all Clash of Clans accounts linked to a user")
async def get_coc_accounts(authorization: str = Header(None)):
    """Retrieve all Clash of Clans accounts linked to a user."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    accounts = await db_client.coc_accounts.find({"user_id": user_id}).sort("order_index", 1).to_list(length=None)

    return {"coc_accounts": accounts}


@router.delete("/users/remove-coc-account", name="Remove a Clash of Clans account linked to a user")
async def remove_coc_account(request: CocAccountRequest, authorization: str = Header(None)):
    """Remove a specific Clash of Clans account linked to a user."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]
    coc_tag = request.coc_tag

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    result = await db_client.coc_accounts.delete_one({"user_id": user_id, "coc_tag": coc_tag})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    # Reorder the remaining accounts
    remaining_accounts = await db_client.coc_accounts.find({"user_id": user_id}).sort("order_index", 1).to_list(
        length=None)

    for index, account in enumerate(remaining_accounts):
        await db_client.coc_accounts.update_one(
            {"_id": account["_id"]},
            {"$set": {"order_index": index}}
        )

    return {"message": "Clash of Clans account unlinked successfully"}


@router.get("/users/check-coc-account", name="Check if a Clash of Clans account is linked to any user")
async def check_coc_account(coc_tag: str):
    """Check if a Clash of Clans account is linked to any user."""

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    existing_account = await db_client.coc_accounts.find_one({"coc_tag": coc_tag})

    if not existing_account:
        return {"linked": False, "message": "This Clash of Clans account is not linked to any user."}

    return {
        "linked": True,
        "user_id": existing_account["user_id"],
        "message": "This Clash of Clans account is already linked to a user."
    }


@router.put("/users/reorder-coc-accounts", name="Reorder linked Clash of Clans accounts")
async def reorder_coc_accounts(request: dict, authorization: str = Header(None)):
    """Reorder Clash of Clans accounts based on user preferences."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    new_order = request.get("ordered_tags", [])
    if not new_order:
        raise HTTPException(status_code=400, detail="Ordered tags list cannot be empty")

    # Check if all the accounts provided are linked to the user
    user_accounts = await db_client.coc_accounts.find({"user_id": user_id}).to_list(length=None)
    user_tags = {account["coc_tag"] for account in user_accounts}

    if not set(new_order).issubset(user_tags):
        raise HTTPException(status_code=400, detail="Invalid account tags provided")

    # Update the order index for each account
    for index, tag in enumerate(new_order):
        await db_client.coc_accounts.update_one(
            {"user_id": user_id, "coc_tag": tag},
            {"$set": {"order_index": index}}
        )

    return {"message": "Accounts reordered successfully"}
