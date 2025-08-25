import hikari
import jwt
import pendulum as pend
import hashlib
import secrets
from fastapi import HTTPException
import base64
from utils.config import Config
from utils.database import MongoClient
config = Config()
############################
# Utility functions
############################

# Encrypt data using Fernet
async def encrypt_data(data: str) -> str:
    """Encrypt data using Fernet."""
    encrypted = config.cipher.encrypt(data.encode("utf-8"))  # Returns bytes
    return base64.urlsafe_b64encode(encrypted).decode("utf-8")  # Convert to str for storage

# Decrypt data using Fernet
async def decrypt_data(data: str) -> str:
    """Decrypt data using Fernet."""
    try:
        data_bytes = base64.urlsafe_b64decode(data.encode("utf-8"))  # Convert back to bytes
        decrypted = config.cipher.decrypt(data_bytes).decode("utf-8")  # Decrypt and decode
        return decrypted
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decrypt data: {str(e)}")

# Hash email for lookup purposes (one-way, deterministic)
def hash_email(email: str) -> str:
    """Create a deterministic hash of email for database lookups."""
    email_normalized = email.lower().strip()
    return hashlib.sha256(f"{email_normalized}{config.secret_key}".encode()).hexdigest()

# Encrypt and prepare email data for storage
async def prepare_email_for_storage(email: str) -> dict:
    """Encrypt email and create lookup hash."""
    email_normalized = email.lower().strip()
    return {
        "email_encrypted": await encrypt_data(email_normalized),
        "email_hash": hash_email(email_normalized)
    }


def generate_jwt(user_id: str, device_id: str) -> str:
    """Generate a JWT token for the user."""
    payload = {
        "sub": user_id,
        "device": device_id,
        "iat": pend.now(tz=pend.UTC).int_timestamp,
        "exp": pend.now(tz=pend.UTC).add(hours=24).int_timestamp
    }
    return jwt.encode(payload, config.secret_key, algorithm=config.algorithm)


def decode_jwt(token: str) -> dict:
    """Decode the JWT access token and return the payload."""
    try:
        decoded_token = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
        return decoded_token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Expired token. Please refresh.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please login again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decoding token: {str(e)}")

def decode_refresh_token(token: str) -> dict:
    """Decode the JWT refresh token and return the payload."""
    try:
        decoded_token = jwt.decode(token, config.refresh_secret, algorithms=[config.algorithm])
        return decoded_token
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token. Please login again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decoding refresh token: {str(e)}")

# Verify a plaintext password against a hashed one
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return config.pwd_context.verify(plain_password, hashed_password)


# Generate a long-lived refresh token (90 days)
def generate_clashking_access_token(user_id: str, device_id: str):
    payload = {
        "sub": user_id,
        "device": device_id,
        "exp": pend.now(tz=pend.UTC).add(days=90).int_timestamp
    }
    return jwt.encode(payload, config.refresh_secret, algorithm=config.algorithm)

def hash_password(password: str) -> str:
    return config.pwd_context.hash(password)

async def refresh_discord_access_token(
        encrypted_refresh_token: str,
        rest: hikari.RESTApp
) -> hikari.OAuth2AuthorizationToken:
    """
    Refreshes the Discord access token using the stored refresh token.
    """
    try:
        refresh_token = await decrypt_data(encrypted_refresh_token)
        async with rest.acquire() as client:
            auth = await client.refresh_access_token(
                client=config.discord_client_id,
                client_secret=config.discord_client_secret,
                refresh_token=refresh_token,
            )
        return auth
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing Discord token: {str(e)}")

async def get_valid_discord_access_token(
        user_id: str,
        rest: hikari.RESTApp,
        mongo: MongoClient,
) -> str:
    """
    Verifies if the Discord access token is still valid and refreshes it if needed.
    """
    discord_token = await mongo.app_discord_tokens.find_one({"user_id": user_id})
    if not discord_token:
        raise HTTPException(status_code=401, detail="Missing Discord refresh token")

    # Decrypt the access and refresh tokens
    encrypted_access_token = discord_token.get("discord_access_token")
    encrypted_refresh_token = discord_token.get("discord_refresh_token")

    if not encrypted_access_token or not encrypted_refresh_token:
        raise HTTPException(status_code=401, detail="Invalid stored tokens")

    access_token = await decrypt_data(encrypted_access_token)
    refresh_token = await decrypt_data(encrypted_refresh_token)

    # Check if the access token is still valid (add a buffer of 60s to prevent expiration race condition)
    if pend.now(tz=pend.UTC).int_timestamp < discord_token["expires_at"].timestamp() - 60:
        return access_token

    # Refresh the access token
    auth = await refresh_discord_access_token(refresh_token, rest)

    # Encrypt and store the new access token with updated expiration time
    new_encrypted_access = await encrypt_data(auth.access_token)
    new_expires_in = auth.expires_in.seconds  # Default: 7 days (7 * 24 * 60 * 60)

    await mongo.app_discord_tokens.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "discord_access_token": new_encrypted_access,
                "expires_at": pend.now(tz=pend.UTC).add(seconds=new_expires_in)
            }
        }
    )

    return auth.access_token


def generate_refresh_token(user_id: str) -> str:
    """Generate a refresh token for the user."""
    payload = {
        "sub": user_id,
        "iat": pend.now(tz=pend.UTC).int_timestamp,
        "exp": pend.now(tz=pend.UTC).add(days=30).int_timestamp
    }
    return jwt.encode(payload, config.refresh_secret, algorithm=config.algorithm)


def generate_email_verification_token() -> str:
    """Generate a secure random token for email verification."""
    return secrets.token_urlsafe(32)


def generate_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return f"{secrets.randbelow(900000) + 100000:06d}"

def generate_reset_token() -> str:
    """Generate a secure password reset token."""
    return secrets.token_urlsafe(32)

def safe_email_log(email: str) -> str:
    """Safely format email for logging to prevent crashes."""
    if not email or not isinstance(email, str):
        return "unknown"
    if len(email) < 3:
        return "short"
    return email[:min(10, len(email))] + "***"