import os

import httpx
import pendulum as pend
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Request, APIRouter
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from utils.auth_utils import get_valid_discord_access_token, decode_jwt, encrypt_data, generate_jwt, \
    generate_refresh_token
from utils.utils import db_client, generate_custom_id
from passlib.context import CryptContext
from cryptography.fernet import Fernet
import base64

############################
# Load environment variables
############################
load_dotenv()

############################
# Global configuration
############################
SECRET_KEY = os.getenv('SECRET_KEY')
REFRESH_SECRET = os.getenv('REFRESH_SECRET')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
ALGORITHM = "HS256"

# Fernet cipher for encryption/decryption
cipher = Fernet(ENCRYPTION_KEY)

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# FastAPI router
router = APIRouter(tags=["Authentication"], include_in_schema=True)


############################
# Data models
############################

class UserInfo(BaseModel):
    user_id: str
    username: str
    avatar_url: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserInfo


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    device_id: str

############################
# Endpoints
############################

@router.get("/auth/me")
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

    token = authorization.split("Bearer ")[1]

    decoded_token = decode_jwt(token)

    user_id = decoded_token["sub"]
    current_user = await db_client.app_users.find_one({"user_id": user_id})
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    discord_access = await get_valid_discord_access_token(current_user["user_id"])

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {discord_access}"}
        )

    if response.status_code == 200:
        discord_data = response.json()

        return {
            "user_id": current_user["user_id"],
            "discord_username": discord_data["username"],
            "avatar_url": f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png"
        }

    raise HTTPException(status_code=500, detail="Error retrieving Discord profile")


@router.post("/auth/discord", response_model=AuthResponse)
async def auth_discord(request: Request):
    form = await request.form()
    code = form.get("code")
    code_verifier = form.get("code_verifier")
    device_id = form.get("device_id")
    device_name = form.get("device_name")

    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")

    # Get the access token and refresh token from Discord
    token_url = "https://discord.com/api/oauth2/token"
    token_data = {
        "client_id": DISCORD_CLIENT_ID,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": DISCORD_REDIRECT_URI,
        "code_verifier": code_verifier
    }

    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_data,
                                           headers={"Content-Type": "application/x-www-form-urlencoded"})

        if token_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error during Discord authentication")

        discord_data = token_response.json()
        access_token_discord = discord_data["access_token"]
        refresh_token_discord = discord_data["refresh_token"]
        expires_in = discord_data["expires_in"]

    # Get the user data from Discord
    async with httpx.AsyncClient() as client:
        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token_discord}"},
        )

        if user_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error retrieving user info")

        user_data = user_response.json()

    discord_user_id = user_data["id"]

    # Verify if the user already exists in the database
    existing_user = await db_client.app_users.find_one({"user_id": discord_user_id})
    if not existing_user:
        await db_client.app_users.insert_one(
            {"user_id": discord_user_id, "_id": generate_custom_id(int(discord_user_id)), "created_at": pend.now()})

    # Encrypt the tokens
    encrypted_discord_access = await encrypt_data(access_token_discord)
    encrypted_discord_refresh = await encrypt_data(refresh_token_discord)

    # Store the tokens in the database
    await db_client.app_discord_tokens.update_one(
        {"user_id": discord_user_id, "device_id": device_id, "device_name": device_name},
        {
            "$setOnInsert": {"_id": generate_custom_id(int(discord_user_id))},
            "$set": {
                "discord_access_token": encrypted_discord_access,
                "discord_refresh_token": encrypted_discord_refresh,
                "expires_at": pend.now().add(seconds=expires_in)
            }
        },
        upsert=True
    )

    # Generate a JWT token for the user
    access_token = generate_jwt(discord_user_id, device_id)
    refresh_token = generate_refresh_token(discord_user_id)

    # Store the refresh token in the database
    await db_client.app_refresh_tokens.update_one(
        {"user_id": discord_user_id},
        {
            "$setOnInsert": {"_id": generate_custom_id(int(discord_user_id))},
            "$set": {
                "refresh_token": refresh_token,
                "expires_at": pend.now().add(days=30)
            }
        },
        upsert=True
    )

    # Return the response
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserInfo(
            user_id=discord_user_id,
            username=user_data["username"],
            avatar_url=f"https://cdn.discordapp.com/avatars/{discord_user_id}/{user_data['avatar']}.png"
        )
    )


@router.post("/auth/refresh")
async def refresh_access_token(request: RefreshTokenRequest) -> dict:
    """Refresh the access token using the stored refresh token."""
    stored_refresh_token = await db_client.app_refresh_tokens.find_one({"refresh_token": request.refresh_token})

    if not stored_refresh_token:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    if pend.now().int_timestamp > stored_refresh_token["expires_at"].timestamp() :
        raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")

    user_id = stored_refresh_token["user_id"]

    # Generate a new access token
    new_access_token = generate_jwt(user_id, request.device_id)

    return {"access_token": new_access_token}
