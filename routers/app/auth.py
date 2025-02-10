import os
import jwt
import requests
import pendulum as pend
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from utils.utils import db_client
from passlib.context import CryptContext
from fastapi import APIRouter

# Load environment variables
load_dotenv()

# Initialize FastAPI app
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

router = APIRouter(tags=["Authentication"], include_in_schema=True)

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Environment variables
SECRET_KEY = os.getenv('SECRET_KEY')
REFRESH_SECRET = os.getenv('REFRESH_SECRET')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')


class Token(BaseModel):
    access_token: str
    refresh_token: str


def generate_jwt(user_id: str, user_type: str):
    """Generate a JWT valid for 1 hour"""
    payload = {
        "sub": user_id,
        "type": user_type,
        "exp": pend.now().add(hours=1).int_timestamp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def generate_refresh_token(user_id: str, device_id: str):
    """Generate a refresh token valid for 90 days"""
    payload = {"sub": user_id, "device": device_id, "exp": pend.now().add(days=90).int_timestamp}
    return jwt.encode(payload, REFRESH_SECRET, algorithm="HS256")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hashed version"""
    return pwd_context.verify(plain_password, hashed_password)


### 🔑 AUTHENTICATION ###
@router.post("/auth/clashking", response_model=Token)
async def auth_clashking(email: str, password: str, request: Request):
    """Authenticate or register a user using ClashKing account"""
    device_id = request.headers.get("X-Device-ID", "unknown")

    user = await db_client.app_users.find_one({"email": email})

    if not user:
        # If user does not exist, create a new account
        hashed_password = hash_password(password)
        new_user = {
            "user_id": str(pend.now().int_timestamp),
            "email": email,
            "password": hashed_password,
            "account_type": "clashking",
            "created_at": pend.now()
        }
        await db_client.app_users.insert_one(new_user)
        user = new_user

    else:
        # If user exists, verify the password
        if not verify_password(password, user["password"]):
            raise HTTPException(status_code=403, detail="Invalid credentials")

    # Generate JWT tokens
    access_token = generate_jwt(user["user_id"], "clashking")
    refresh_token = generate_refresh_token(user["user_id"], device_id)

    # Store the refresh token in the database, linked to the device
    await db_client.app_tokens.insert_one(
        {"user_id": user["user_id"], "refresh_token": refresh_token, "device_id": device_id, "expires_at": pend.now().add(days=90)}
    )

    return {"access_token": access_token, "refresh_token": refresh_token}


@router.post("/auth/discord", response_model=Token)
async def auth_discord(code: str):
    """Authenticate user via Discord OAuth2 and return JWT tokens"""
    if not code:
        raise HTTPException(status_code=400, detail="Missing Discord code")

    token_url = "https://discord.com/api/oauth2/token"
    token_data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": "identify"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    token_response = requests.post(token_url, data=token_data, headers=headers)

    if token_response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Error during Discord authentication: {token_response.json()}")

    access_token = token_response.json().get("access_token")
    user_response = requests.get("https://discord.com/api/users/@me",
                                 headers={"Authorization": f"Bearer {access_token}"})

    if user_response.status_code != 200:
        raise HTTPException(status_code=500, detail="Error retrieving user info")

    user_data = user_response.json()
    user_id = user_data["id"]

    # Store user in database if not exists
    if not await db_client.app_users.find_one({"user_id": user_id}):
        await db_client.app_users.insert_one(
            {"user_id": user_id, "username": user_data["username"], "account_type": "discord", "created_at": pend.now()}
        )

    refresh_token = generate_refresh_token(user_id, "discord")
    await db_client.app_tokens.insert_one(
        {"user_id": user_id, "refresh_token": refresh_token, "expires_at": pend.now().add(days=90)}
    )

    return {"access_token": generate_jwt(user_id, "discord"), "refresh_token": refresh_token}


### 🔄 TOKEN MANAGEMENT ###
@router.post("/refresh-token", response_model=Token)
async def refresh_token(token: str):
    """Refresh the access token using a valid refresh token"""
    stored_token = await db_client.app_tokens.find_one({"refresh_token": token})

    if not stored_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        payload = jwt.decode(token, REFRESH_SECRET, algorithms=["HS256"])
        new_access_token = generate_jwt(payload["sub"], "clashking")
        new_refresh_token = generate_refresh_token(payload["sub"], payload["device"])

        await db_client.app_tokens.update_one(
            {"refresh_token": token},
            {"$set": {"refresh_token": new_refresh_token, "expires_at": pend.now().add(days=90)}}
        )

        return {"access_token": new_access_token, "refresh_token": new_refresh_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=403, detail="Refresh token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")


### 👤 USER MANAGEMENT ###
@router.get("/users/me")
async def read_users_me(token: str = Depends(oauth2_scheme)):
    """Retrieve current user information based on the provided JWT token"""
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = await db_client.app_users.find_one({"user_id": payload["sub"]})
    return user


@router.get("/users/sessions")
async def get_sessions(token: str = Depends(oauth2_scheme)):
    """Retrieve all active sessions of the current user"""
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    sessions = await db_client.app_tokens.find({"user_id": payload["sub"]}).to_list(None)
    return [{"device_id": s["device_id"], "expires_at": s["expires_at"]} for s in sessions]


@router.post("/logout")
async def logout(token: str):
    """Invalidate the refresh token for a specific device"""
    await db_client.app_tokens.delete_one({"refresh_token": token})
    return {"message": "Successfully logged out"}
