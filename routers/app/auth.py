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
class Token(BaseModel):
    access_token: str


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
# Utility functions
############################

# Encrypt data (string) using Fernet
async def encrypt_data(data: str) -> str:
    """Encrypt data using Fernet."""
    print(f"🔒 Data: {data}")
    encrypted = cipher.encrypt(data.encode("utf-8")).decode("utf-8")
    print(f"🔒 Encrypted data: {encrypted}")
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


def generate_jwt(user_id: str, device_id: str) -> str:
    """Generate a JWT token for the user."""
    payload = {
        "sub": user_id,
        "device": device_id,
        "exp": pend.now().add(days=90).int_timestamp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_jwt(token: str) -> dict:
    """Decode the JWT token and return the payload."""
    try:
        decoded_token = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return decoded_token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Expired token. Please refresh.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please login again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decoding token: {str(e)}")


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

    decoded_token = decode_jwt(token)

    user_id = decoded_token["sub"]
    current_user = await db_client.app_users.find_one({"user_id": user_id})
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


@router.post("/auth/discord", response_model=AuthResponse)
async def auth_discord(request: Request):
    form = await request.form()
    code = form.get("code")
    code_verifier = form.get("code_verifier")
    device_id = request.headers.get("X-Device-ID", "unknown")

    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")

    # Get the access token from Discord
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

    # Get the user info from Discord
    async with httpx.AsyncClient() as client:
        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {discord_data['access_token']}"},
        )

        if user_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error retrieving user info")

        user_data = user_response.json()

    discord_user_id = user_data["id"]

    # Verify if the user already exists in the database
    existing_user = await db_client.app_users.find_one({"user_id": discord_user_id})
    if not existing_user:
        await db_client.app_users.insert_one({"user_id": discord_user_id, "created_at": pend.now()})

    # Generate a JWT token for the user
    access_token = generate_jwt(discord_user_id, device_id)
    refresh_token = generate_refresh_token(discord_user_id)

    # Stocker le refresh_token dans la base
    await db_client.app_refresh_tokens.update_one(
        {"user_id": discord_user_id},
        {"$set": {"refresh_token": refresh_token, "expires_at": pend.now().add(days=30)}},
        upsert=True
    )

    # Return the access token and user info
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

    if pend.now().int_timestamp > stored_refresh_token["expires_at"]:
        raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")

    user_id = stored_refresh_token["user_id"]

    # Generate a new access token
    new_access_token = generate_jwt(user_id, request.device_id)

    return {"access_token": new_access_token}


def generate_refresh_token(user_id: str) -> str:
    """Generate a refresh token for the user."""
    payload = {
        "sub": user_id,
        "exp": pend.now().add(days=180).int_timestamp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
