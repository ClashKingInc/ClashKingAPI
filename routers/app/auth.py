import os
import jwt
import requests
import pendulum as pend
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, APIRouter
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from utils.utils import db_client
from passlib.context import CryptContext
from cryptography.fernet import Fernet

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
    refresh_token: str

############################
# Utility functions
############################

# Encrypt data (string) using Fernet
async def encrypt_data(data: str) -> str:
    return cipher.encrypt(data.encode()).decode()

# Decrypt data (string) using Fernet
async def decrypt_data(data: str) -> str:
    return cipher.decrypt(data.encode()).decode()

# Hash a password using bcrypt
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# Verify a plaintext password against a hashed one
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# Generate a short-lived JWT (1 hour)
def generate_jwt(user_id: str, user_type: str):
    payload = {
        "sub": user_id,
        "type": user_type,
        "exp": pend.now().add(hours=1).int_timestamp
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

# Generate a long-lived refresh token (90 days)
def generate_refresh_token(user_id: str, device_id: str):
    payload = {
        "sub": user_id,
        "device": device_id,
        "exp": pend.now().add(days=90).int_timestamp
    }
    return jwt.encode(payload, REFRESH_SECRET, algorithm="HS256")

############################
# JWT blacklist management
############################
jwt_blacklist = set()

def add_to_blacklist(token: str):
    jwt_blacklist.add(token)

def is_blacklisted(token: str) -> bool:
    return token in jwt_blacklist

############################
# Retrieve current user and validate token
############################
async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    This dependency checks whether the token is blacklisted, decodes the JWT,
    fetches the user from the database, and returns a user object or a dict
    contenant le profil Discord temps réel si le compte est 'discord'.
    """
    # Check if the token is blacklisted
    if is_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token is blacklisted")

    # Decode the JWT token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token is invalid")

    # Load the user from the database
    current_user = await db_client.app_users.find_one({"user_id": user_id})
    if not current_user:
        raise HTTPException(
            status_code=404,
            detail=f"User not found: {user_id}"
        )

    # If it's a Discord account, fetch the real-time profile
    if current_user.get("account_type") == "discord":
        try:
            discord_access = await decrypt_data(current_user["discord_access_token"])
            response = requests.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {discord_access}"}
            )
            if response.status_code == 200:
                discord_data = response.json()
                return {
                    "user_id": current_user["user_id"],
                    "discord_username": discord_data["username"],
                    "avatar_url": f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png",
                }
            else:
                # Invalidate the token if the Discord profile is not accessible
                raise HTTPException(status_code=500, detail="Error from Discord API")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error retrieving Discord profile: {str(e)}")

    # If it's a ClashKing account, return the user object
    return current_user


############################
# Device ID validation
############################
async def validate_device_id(request: Request, user_id: str):
    """
    Check whether the X-Device-ID header is provided and belongs to an existing
    session for the given user_id.
    """
    device_header = request.headers.get("X-Device-ID")
    if not device_header:
        raise HTTPException(status_code=400, detail="Missing X-Device-ID header")

    sessions = await db_client.app_tokens.find({"user_id": user_id}).to_list(None)
    device_ids = [session.get("device_id") for session in sessions]
    if device_header not in device_ids:
        raise HTTPException(status_code=403, detail="Invalid or unknown device ID")

############################
# Endpoints
############################

# 2) Link Discord account to a ClashKing user
@router.post("/auth/link-discord")
async def link_discord_account(request: Request):
    """
    This endpoint links a Discord account to a ClashKing user by storing
    the Discord ID in the user's record (encrypted if necessary).
    """
    form = await request.form()
    user_id = form.get("user_id")
    discord_id = form.get("discord_id")
    if not user_id or not discord_id:
        raise HTTPException(status_code=400, detail="Missing user_id or discord_id")

    user = await db_client.app_users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="ClashKing user not found")

    encrypted_discord_id = await encrypt_data(discord_id)

    await db_client.app_users.update_one(
        {"user_id": user_id},
        {"$set": {"discord_id": encrypted_discord_id}}
    )
    return {"message": "Discord account linked successfully"}

# 3) Authenticate ClashKing user
@router.post("/auth/clashking", response_model=Token)
async def auth_clashking(email: str, password: str, request: Request):
    """
    This endpoint authenticates a user with ClashKing credentials (email/password).
    If the user doesn't exist, a new account is created. Otherwise, the password
    is verified. Access and refresh tokens are returned.
    """
    device_id = request.headers.get("X-Device-ID", "unknown")

    encrypted_email = await encrypt_data(email)
    user = await db_client.app_users.find_one({"email": encrypted_email})

    if not user:
        # Create a new user
        hashed_pw = hash_password(password)
        new_user = {
            "user_id": str(pend.now().int_timestamp),
            "email": encrypted_email,
            "password": hashed_pw,
            "account_type": "clashking",
            "created_at": pend.now()
        }
        await db_client.app_users.insert_one(new_user)
        user = new_user
    else:
        # Verify the provided password
        if not verify_password(password, user["password"]):
            raise HTTPException(status_code=403, detail="Invalid credentials")

    access_token = generate_jwt(user["user_id"], "clashking")
    refresh_token = generate_refresh_token(user["user_id"], device_id)

    # Encrypt the refresh token before storing in DB
    encrypted_refresh = await encrypt_data(refresh_token)

    await db_client.app_tokens.insert_one({
        "user_id": user["user_id"],
        "refresh_token": encrypted_refresh,
        "device_id": device_id,
        "expires_at": pend.now().add(days=90)
    })

    return {
        "access_token": access_token,
        "refresh_token": await encrypt_data(refresh_token)
    }

@router.post("/auth/discord", response_model=Token)
async def auth_discord(request: Request):
    """
    This endpoint handles Discord OAuth2 authentication using authorization code
    and PKCE. If the user doesn't exist, a new user record is created using
    the Discord ID.
    """
    form = await request.form()
    code = form.get("code")
    code_verifier = form.get("code_verifier")

    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")

    # Step 1: Exchange code for Discord's token
    token_url = "https://discord.com/api/oauth2/token"
    token_data = {
        "client_id": DISCORD_CLIENT_ID,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": DISCORD_REDIRECT_URI,
        "code_verifier": code_verifier
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    token_response = requests.post(token_url, data=token_data, headers=headers)
    if token_response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"Error during Discord authentication: {token_response.json()}"
        )

    # Extract the tokens from Discord response
    discord_data = token_response.json()
    access_token_discord = discord_data.get("access_token")
    refresh_token_discord = discord_data.get("refresh_token")  # might be null
    expires_in = discord_data.get("expires_in")  # in seconds, e.g. 604800

    # Step 2: Get user info from Discord
    user_response = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token_discord}"}
    )

    if user_response.status_code != 200:
        raise HTTPException(status_code=500, detail="Error retrieving user info")

    user_data = user_response.json()
    discord_user_id = user_data["id"]

    # Step 3: Check if user exists in DB
    existing_user = await db_client.app_users.find_one({"user_id": discord_user_id})
    if not existing_user:
        # Optionally encrypt the username
        username_enc = await encrypt_data(user_data["username"])
        new_user = {
            "user_id": discord_user_id,
            "username": username_enc,
            "account_type": "discord",
            "created_at": pend.now()
        }
        await db_client.app_users.insert_one(new_user)

    # Step 4: Store the Discord access_token + refresh_token in DB (encrypted)
    # We can store them in the same app_users collection or a separate table. Example:
    encrypted_discord_access = await encrypt_data(access_token_discord)
    encrypted_discord_refresh = None
    if refresh_token_discord:
        encrypted_discord_refresh = await encrypt_data(refresh_token_discord)

    # Update the user record with Discord tokens
    # or store them in another collection named 'discord_tokens'
    await db_client.app_users.update_one(
        {"user_id": discord_user_id},
        {
            "$set": {
                "discord_access_token": encrypted_discord_access,
                "discord_refresh_token": encrypted_discord_refresh,
                "discord_expires_in": expires_in,
                "updated_at": pend.now()
            }
        }
    )

    # Step 5: Create a ClashKing refresh token for user
    # (the user can now use your own JWT to talk to your app)
    refresh_token = generate_refresh_token(discord_user_id, "discord")
    encrypted_refresh = await encrypt_data(refresh_token)

    await db_client.app_tokens.insert_one({
        "user_id": discord_user_id,
        "refresh_token": encrypted_refresh,
        "device_id": "discord",
        "expires_at": pend.now().add(days=90)
    })

    # Step 6: Return your own JWT to the client
    return {
        "access_token": generate_jwt(discord_user_id, "discord"),
        "refresh_token": await encrypt_data(refresh_token)
    }

# 5) Refresh token: generate a new access token
@router.post("/refresh-token", response_model=Token)
async def refresh_token(token: str, request: Request):
    """
    This endpoint receives an existing refresh token (encrypted in the DB),
    validates it, checks device_id, and issues a new access/refresh token pair.
    """
    # Decrypt the user-provided token to compare with the DB
    stored_token = await db_client.app_tokens.find_one({"refresh_token": await encrypt_data(token)})

    if not stored_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        payload = jwt.decode(token, REFRESH_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        device_id = payload.get("device")

        # Validate the device_id from the request
        await validate_device_id(request, user_id)

        new_access_token = generate_jwt(user_id, "clashking")
        new_refresh_token = generate_refresh_token(user_id, device_id)
        encrypted_new = await encrypt_data(new_refresh_token)

        # Update the stored token in the DB
        await db_client.app_tokens.update_one(
            {"refresh_token": stored_token["refresh_token"]},
            {"$set": {
                "refresh_token": encrypted_new,
                "expires_at": pend.now().add(days=90)
            }}
        )

        return {
            "access_token": new_access_token,
            "refresh_token": await encrypt_data(new_refresh_token)
        }

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=403, detail="Refresh token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")

# 6) Get current user info
@router.get("/users/me")
async def read_users_me(current_user=Depends(get_current_user)):
    """
    This endpoint returns the current user's information, decrypting
    email and username if available.
    """
    decrypted_email = None
    if "email" in current_user:
        try:
            decrypted_email = await decrypt_data(current_user["email"])
        except:
            decrypted_email = "(error decrypting email)"

    decrypted_username = None
    if "username" in current_user:
        try:
            decrypted_username = await decrypt_data(current_user["username"])
        except:
            decrypted_username = "(error decrypting username)"

    return {
        "user_id": current_user["user_id"],
        "email": decrypted_email,
        "username": decrypted_username,
        "account_type": current_user.get("account_type", "unknown"),
        "created_at": current_user.get("created_at")
    }

# 7) Get all user sessions
@router.get("/users/sessions")
async def get_sessions(current_user=Depends(get_current_user)):
    """
    This endpoint fetches all active sessions (refresh tokens) associated
    with the current user.
    """
    user_id = current_user["user_id"]
    sessions = await db_client.app_tokens.find({"user_id": user_id}).to_list(None)
    return [
        {
            "device_id": s.get("device_id"),
            "expires_at": s.get("expires_at")
        } for s in sessions
    ]

# 8) Logout (invalidate one session)
@router.post("/logout")
async def logout(token: str):
    """
    This endpoint invalidates (removes) a refresh token from the DB,
    effectively logging out of one session. Optionally, you can also
    blacklist the associated access token if you need immediate invalidation.
    """
    encrypted_token = await encrypt_data(token)
    result = await db_client.app_tokens.delete_one({"refresh_token": encrypted_token})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No session found for given token")

    # Optionally add the token to the blacklist
    # add_to_blacklist(token)

    return {"message": "Successfully logged out"}

@router.get("/discord/me")
async def get_discord_profile(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]

    # Retrieve the stored Discord tokens
    user_record = await db_client.app_users.find_one({"user_id": user_id})
    if not user_record or "discord_access_token" not in user_record:
        raise HTTPException(status_code=404, detail="No Discord token found")

    # Decrypt the access token
    discord_access_token = await decrypt_data(user_record["discord_access_token"])

    # 1) Tenter d'appeler l'API Discord
    response = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {discord_access_token}"}
    )

    # 2) Si le token Discord est expiré (401), on tente un refresh
    if response.status_code == 401:
        if "discord_refresh_token" not in user_record or not user_record["discord_refresh_token"]:
            raise HTTPException(status_code=401, detail="No Discord refresh token stored")

        # On tente de rafraîchir le token
        try:
            new_discord_data = refresh_discord_access_token(user_record["discord_refresh_token"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error refreshing Discord token: {e}")

        # On met à jour la base avec les nouveaux tokens
        new_access = new_discord_data["access_token"]
        new_refresh = new_discord_data.get("refresh_token")  # peut être None
        new_expires_in = new_discord_data.get("expires_in")

        encrypted_discord_access = await encrypt_data(new_access)
        encrypted_discord_refresh = await encrypt_data(new_refresh) if new_refresh else None

        await db_client.app_users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "discord_access_token": encrypted_discord_access,
                    "discord_refresh_token": encrypted_discord_refresh,
                    "discord_expires_in": new_expires_in,
                    "updated_at": pend.now()
                }
            }
        )

        # On refait l'appel à Discord avec le nouveau token
        response = requests.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {new_access}"}
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"Error from Discord: {response.json()}"
        )

    return response.json()

def refresh_discord_access_token(encrypted_refresh_token_discord: str) -> dict:
    # 1) decrypt the refresh token
    refresh_token_str = decrypt_data(encrypted_refresh_token_discord)

    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token_str
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    token_response = requests.post("https://discord.com/api/oauth2/token", data=data, headers=headers)
    if token_response.status_code != 200:
        raise Exception(f"Unable to refresh Discord token: {token_response.json()}")

    return token_response.json()