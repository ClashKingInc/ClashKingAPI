import os

import httpx
import jwt
import requests
import pendulum as pend
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Request, APIRouter
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from utils.utils import db_client
from passlib.context import CryptContext
from cryptography.fernet import Fernet
import hashlib
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
class Token(BaseModel):
    access_token: str

############################
# Utility functions
############################

# Hash the token using SHA-256
async def hash_token(token: str) -> str:
    """Hash le token avec SHA-256 pour garantir un stockage sécurisé et déterministe."""
    return hashlib.sha256(token.encode()).hexdigest()

# Encrypt data (string) using Fernet
async def encrypt_data(data: str) -> str:
    """Encrypt data using Fernet."""
    encrypted = cipher.encrypt(data.encode("utf-8")).decode("utf-8")
    return encrypted

# Decrypt data (string) using Fernet
async def decrypt_data(data: str) -> str:
    """Decrypt data using Fernet."""
    try:
        data_bytes = base64.b64decode(data)
        decrypted = cipher.decrypt(data_bytes).decode("utf-8")
        return decrypted
    except Exception as e:
        print(f"❌ Error decrypting data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to decrypt data")

# Verify a plaintext password against a hashed one
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# Generate a long-lived refresh token (90 days)
def generate_clashking_access_token(user_id: str, device_id: str):
    payload = {
        "sub": user_id,
        "device": device_id,
        "exp": pend.now().add(days=90).int_timestamp
    }
    return jwt.encode(payload, REFRESH_SECRET, algorithm="HS256")

async def refresh_discord_access_token(encrypted_refresh_token: str) -> dict:
    """
    Refreshes the Discord access token using the stored refresh token.
    """
    try:
        refresh_token = await decrypt_data(encrypted_refresh_token)
        token_data = {
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        token_response = requests.post("https://discord.com/api/oauth2/token", data=token_data, headers=headers)

        if token_response.status_code == 200:
            return token_response.json()
        else:
            raise HTTPException(
                status_code=401,
                detail=f"Failed to refresh Discord token: {token_response.json()}"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing Discord token: {str(e)}")

async def get_valid_discord_access_token(user_id: str) -> str:
    discord_token = await db_client.app_discord_tokens.find_one({"user_id": user_id})
    if not discord_token:
        raise HTTPException(status_code=401, detail="Missing Discord refresh token")

    refresh_token = await decrypt_data(discord_token["discord_refresh_token"])

    # Generate a new access token if the current one is expired
    new_token_data = await refresh_discord_access_token(refresh_token)
    return new_token_data["access_token"]

############################
# Retrieve current user and validate token
############################

@router.get("/auth/me")
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

    token = authorization.split("Bearer ")[1]

    encrypt_token = await hash_token(token)

    current_user = await db_client.app_clashking_tokens.find_one({"access_token": encrypt_token})
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.get("account_type") == "discord":
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

    return current_user

@router.post("/auth/discord", response_model=Token)
async def auth_discord(request: Request):
    form = await request.form()
    code = form.get("code")
    code_verifier = form.get("code_verifier")
    device_id = request.headers.get("X-Device-ID", "unknown")

    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")

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
        refresh_token_discord = discord_data.get("refresh_token")

        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {discord_data['access_token']}"}
        )

        if user_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error retrieving user info")

        user_data = user_response.json()

    discord_user_id = user_data["id"]
    existing_user = await db_client.app_users.find_one({"user_id": discord_user_id})
    if not existing_user:
        await db_client.app_users.insert_one({"user_id": discord_user_id, "created_at": pend.now()})

    encrypted_discord_access = await encrypt_data(discord_data["access_token"])
    encrypted_discord_refresh = await encrypt_data(refresh_token_discord) if refresh_token_discord else None

    await db_client.app_discord_tokens.replace_one(
        {"user_id": discord_user_id, "device_id": device_id},
        {
            "user_id": discord_user_id,
            "device_id": device_id,
            "discord_access_token": encrypted_discord_access,
            "discord_refresh_token": encrypted_discord_refresh,
            "expires_at": pend.now().add(days=180)
        },
        upsert=True  # Insert if not found
    )

    access_token = generate_clashking_access_token(discord_user_id, device_id)
    encrypted_token = await hash_token(access_token)

    await db_client.app_clashking_tokens.insert_one({
        "user_id": discord_user_id,
        "account_type": "discord",
        "access_token": encrypted_token,
        "device_id": device_id,
        "expires_at": pend.now().add(days=180)
    })

    return {"access_token": access_token}
