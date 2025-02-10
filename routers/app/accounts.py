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

router = APIRouter(tags=["Authentication"], include_in_schema=True)

# Environment variables
SECRET_KEY = os.getenv('SECRET_KEY')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')


class Token(BaseModel):
    access_token: str
    refresh_token: str


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


@router.post("/users/add-coc-account")
async def add_coc_account(coc_tag: str, token: str = Depends(oauth2_scheme)):
    """Associate a Clash of Clans account (tag) with a user WITHOUT ownership verification."""

    # Verify user authentication
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")

    # Validate Clash of Clans tag format
    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    # Ensure the tag starts with "#"
    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    # Check if the Clash of Clans account exists
    if not await is_coc_tag_valid(coc_tag):
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    # Fetch the user document
    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if user:
        # Check if the tag is already in the user's list
        if any(account["coc_tag"] == coc_tag for account in user["coc_accounts"]):
            raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to your profile")

        # Add the new tag
        await db_client.user_clash_accounts.update_one(
            {"user_id": user_id},
            {"$push": {"coc_accounts": {"coc_tag": coc_tag, "added_at": pend.now()}}}
        )
    else:
        # Create a new document if the user does not exist
        await db_client.user_clash_accounts.insert_one({
            "user_id": user_id,
            "coc_accounts": [{"coc_tag": coc_tag, "added_at": pend.now()}]
        })

    return {"message": "Clash of Clans account linked successfully"}


@router.post("/users/add-coc-account-with-token")
async def add_coc_account_with_verification(coc_tag: str, player_token: str, token: str = Depends(oauth2_scheme)):
    """Associate a Clash of Clans account with a user WITH ownership verification."""

    # Verify user authentication
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")

    # Validate Clash of Clans tag format
    if not re.match(r"^#?[A-Z0-9]{5,12}$", coc_tag):
        raise HTTPException(status_code=400, detail="Invalid Clash of Clans tag format")

    # Ensure the tag starts with "#"
    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    # Check if the Clash of Clans account exists
    if not await is_coc_tag_valid(coc_tag):
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    # Verify account ownership
    if not await verify_coc_ownership(coc_tag, player_token):
        raise HTTPException(status_code=403, detail="Invalid player token. You do not own this account.")

    # Fetch the user document
    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if user:
        # Check if the tag is already in the user's list
        if any(account["coc_tag"] == coc_tag for account in user["coc_accounts"]):
            raise HTTPException(status_code=400, detail="This Clash of Clans account is already linked to your profile")

        # Add the new tag
        await db_client.user_clash_accounts.update_one(
            {"user_id": user_id},
            {"$push": {"coc_accounts": {"coc_tag": coc_tag, "added_at": pend.now()}}}
        )
    else:
        # Create a new document if the user does not exist
        await db_client.user_clash_accounts.insert_one({
            "user_id": user_id,
            "coc_accounts": [{"coc_tag": coc_tag, "added_at": pend.now()}]
        })

    return {"message": "Clash of Clans account linked successfully with ownership verification"}


@router.get("/users/coc-accounts")
async def get_coc_accounts(token: str = Depends(oauth2_scheme)):
    """Retrieve all Clash of Clans accounts linked to a user."""

    # Verify authentication
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")

    # Fetch the user document
    user = await db_client.user_clash_accounts.find_one({"user_id": user_id})

    if not user:
        return {"coc_accounts": []}

    return {"coc_accounts": user["coc_accounts"]}


@router.delete("/users/remove-coc-account")
async def remove_coc_account(coc_tag: str, token: str = Depends(oauth2_scheme)):
    """Remove a specific Clash of Clans account linked to a user."""

    # Verify authentication
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")

    # Ensure the tag starts with "#"
    if not coc_tag.startswith("#"):
        coc_tag = f"#{coc_tag}"

    # Remove the tag from the user's document
    result = await db_client.user_clash_accounts.update_one(
        {"user_id": user_id},
        {"$pull": {"coc_accounts": {"coc_tag": coc_tag}}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Clash of Clans account not found or not linked to your profile")

    return {"message": "Clash of Clans account unlinked successfully"}
