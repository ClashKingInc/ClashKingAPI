import os
import jwt
import requests
import pendulum as pend
import re
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from utils.utils import db_client
from fastapi import APIRouter

# Load environment variables
load_dotenv()

# Initialize FastAPI app
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

router = APIRouter(tags=["Coc Accounts"], include_in_schema=True)

# Environment variables
SECRET_KEY = os.getenv('SECRET_KEY')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')


class Token(BaseModel):
    access_token: str
    refresh_token: str

################
# Utility functions
################

async def get_current_user(token: str):
    """Retrieve user information from the ClashKing token."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    current_user = await db_client.app_clashking_tokens.find_one({"access_token": token})
    if not current_user:
        raise HTTPException(status_code=403, detail="Invalid authentication token")

    return current_user  # Returns user data

async def is_coc_tag_valid(coc_tag: str) -> bool:
    """Check if the Clash of Clans account exists using the API."""

    # Format the tag correctly for the API request
    coc_tag = coc_tag.replace("#", "%23")

    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}"
    response = requests.get(url)

    return response.status_code == 200  # Returns True if the account exists


async def verify_coc_ownership(coc_tag: str, player_token: str) -> bool:
    """Verify if the provided player token matches the given Clash of Clans account."""

    # Format the tag correctly for the API request
    coc_tag = coc_tag.replace("#", "%23")

    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}/verifytoken"
    response = requests.post(url, json={"token": player_token})

    return response.status_code == 200  # Returns True if the ownership is verified


################
# Endpoints
################

@router.post("/users/add-coc-account")
async def add_coc_account(coc_tag: str, token: str = Depends(oauth2_scheme)):
    """Associate a Clash of Clans account (tag) with a user WITHOUT ownership verification."""

    # Retrieve user
    current_user = await get_current_user(token)
    user_id = current_user["user_id"]

    # Validate Clash of Clans tag format
    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    if not await is_coc_tag_valid(coc_tag):
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if user:
        if any(account["coc_tag"] == coc_tag for account in user["coc_accounts"]):
            raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to your profile")

        await db_client.user_clash_accounts.update_one(
            {"user_id": user_id},
            {"$push": {"coc_accounts": {"coc_tag": coc_tag, "added_at": pend.now()}}}
        )
    else:
        await db_client.user_clash_accounts.insert_one({
            "user_id": user_id,
            "coc_accounts": [{"coc_tag": coc_tag, "added_at": pend.now()}]
        })

    return {"message": "Clash of Clans account linked successfully"}


@router.post("/users/add-coc-account-with-token")
async def add_coc_account_with_verification(coc_tag: str, player_token: str, token: str = Depends(oauth2_scheme)):
    """Associate a Clash of Clans account with a user WITH ownership verification."""

    current_user = await get_current_user(token)
    user_id = current_user["user_id"]

    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    if not await is_coc_tag_valid(coc_tag):
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    if not await verify_coc_ownership(coc_tag, player_token):
        raise HTTPException(status_code=403, detail="Invalid player token. You do not own this account.")

    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if user:
        if any(account["coc_tag"] == coc_tag for account in user["coc_accounts"]):
            raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to your profile")

        await db_client.user_clash_accounts.update_one(
            {"user_id": user_id},
            {"$push": {"coc_accounts": {"coc_tag": coc_tag, "added_at": pend.now()}}}
        )
    else:
        await db_client.user_clash_accounts.insert_one({
            "user_id": user_id,
            "coc_accounts": [{"coc_tag": coc_tag, "added_at": pend.now()}]
        })

    return {"message": "Clash of Clans account linked successfully with ownership verification"}


@router.get("/users/coc-accounts")
async def get_coc_accounts(token: str = Depends(oauth2_scheme)):
    """Retrieve all Clash of Clans accounts linked to a user."""

    current_user = await get_current_user(token)
    user_id = current_user["user_id"]

    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if not user:
        return {"coc_accounts": []}

    return {"coc_accounts": user["coc_accounts"]}


@router.delete("/users/remove-coc-account")
async def remove_coc_account(coc_tag: str, token: str = Depends(oauth2_scheme)):
    """Remove a specific Clash of Clans account linked to a user."""

    current_user = await get_current_user(token)
    user_id = current_user["user_id"]

    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    result = await db_client.user_clash_accounts.update_one(
        {"user_id": user_id},
        {"$pull": {"coc_accounts": {"coc_tag": coc_tag}}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    return {"message": "Clash of Clans account unlinked successfully"}

