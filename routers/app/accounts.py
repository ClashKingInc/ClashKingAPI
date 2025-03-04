import requests
import pendulum as pend
import re
from dotenv import load_dotenv
from fastapi import HTTPException, Header, APIRouter
from utils.utils import db_client
from utils.auth_utils import decode_jwt  # Import JWT decoder

# Load environment variables
load_dotenv()

router = APIRouter(tags=["Coc Accounts"], include_in_schema=True)


################
# Utility functions
################

async def fetch_coc_account_data(coc_tag: str) -> dict:
    """Retrieve Clash of Clans account details using the API."""
    coc_tag = coc_tag.replace("#", "%23")
    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}"
    response = requests.get(url)

    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    return response.json()  # Return the account data


async def verify_coc_ownership(coc_tag: str, player_token: str) -> bool:
    """Verify if the provided player token matches the given Clash of Clans account."""
    coc_tag = coc_tag.replace("#", "%23")
    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}/verifytoken"
    response = requests.post(url, json={"token": player_token})
    return response.status_code == 200  # Returns True if the ownership is verified


async def is_coc_account_linked(coc_tag: str) -> bool:
    """Check if the Clash of Clans account is already linked to another user."""
    existing_account = await db_client.coc_accounts.find_one({"coc_tag": coc_tag})
    return existing_account is not None


################
# Endpoints
################

@router.post("/users/add-coc-account")
async def add_coc_account(coc_tag: str, authorization: str = Header(None)):
    """Associate a Clash of Clans account (tag) with a user WITHOUT ownership verification."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    # Fetch account details from the API
    coc_account_data = await fetch_coc_account_data(coc_tag)

    if await is_coc_account_linked(coc_tag):
        raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to another user")

    # Store in the database
    await db_client.coc_accounts.insert_one({
        "user_id": user_id,
        "coc_tag": coc_account_data["tag"],
        "added_at": pend.now()
    })

    # Return account details to the front-end
    return {
        "message": "Clash of Clans account linked successfully",
        "account": {
            "tag": coc_account_data["tag"],
            "name": coc_account_data["name"],
            "townHallLevel": coc_account_data["townHallLevel"]
        }
    }


@router.post("/users/add-coc-account-with-token")
async def add_coc_account_with_verification(coc_tag: str, player_token: str, authorization: str = Header(None)):
    """Associate a Clash of Clans account with a user WITH ownership verification."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    if not await verify_coc_ownership(coc_tag, player_token):
        raise HTTPException(status_code=403, detail="Invalid player token. You do not own this account.")

    # Fetch account details from the API
    coc_account_data = await fetch_coc_account_data(coc_tag)

    if await is_coc_account_linked(coc_tag):
        raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to another user")

    # Store in the database
    await db_client.coc_accounts.insert_one({
        "user_id": user_id,
        "coc_tag": coc_account_data["tag"],
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


@router.get("/users/coc-accounts")
async def get_coc_accounts(authorization: str = Header(None)):
    """Retrieve all Clash of Clans accounts linked to a user."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    accounts = await db_client.coc_accounts.find({"user_id": user_id}).to_list(length=None)

    return {"coc_accounts": accounts}


@router.delete("/users/remove-coc-account")
async def remove_coc_account(coc_tag: str, authorization: str = Header(None)):
    """Remove a specific Clash of Clans account linked to a user."""

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    result = await db_client.coc_accounts.delete_one({"user_id": user_id, "coc_tag": coc_tag})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    return {"message": "Clash of Clans account unlinked successfully"}


@router.get("/users/check-coc-account")
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
