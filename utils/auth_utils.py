import jwt
import requests
import pendulum as pend
from fastapi import HTTPException
from utils.utils import db_client, config
import base64

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


def generate_jwt(user_id: str, device_id: str) -> str:
    """Generate a JWT token for the user."""
    payload = {
        "sub": user_id,
        "device": device_id,
        "iat": pend.now().int_timestamp,
        "exp": pend.now().add(hours=24).int_timestamp
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=config.ALGORITHM)


def decode_jwt(token: str) -> dict:
    """Decode the JWT access token and return the payload."""
    try:
        decoded_token = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
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
        decoded_token = jwt.decode(token, config.REFRESH_SECRET, algorithms=[config.ALGORITHM])
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
        "exp": pend.now().add(days=90).int_timestamp
    }
    return jwt.encode(payload, config.REFRESH_SECRET, algorithm=config.ALGORITHM)

def hash_password(password: str) -> str:
    return config.pwd_context.hash(password)

async def refresh_discord_access_token(encrypted_refresh_token: str) -> dict:
    """
    Refreshes the Discord access token using the stored refresh token.
    """
    try:
        refresh_token = await decrypt_data(encrypted_refresh_token)
        token_data = {
            "client_id": config.DISCORD_CLIENT_ID,
            "client_secret": config.DISCORD_CLIENT_SECRET,
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
    """
    Verifies if the Discord access token is still valid and refreshes it if needed.
    """
    discord_token = await db_client.app_discord_tokens.find_one({"user_id": user_id})
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
    if pend.now().int_timestamp < discord_token["expires_at"].timestamp() - 60:
        return access_token

    # Refresh the access token
    new_token_data = await refresh_discord_access_token(refresh_token)

    # Encrypt and store the new access token with updated expiration time
    new_encrypted_access = await encrypt_data(new_token_data["access_token"])
    new_expires_in = new_token_data.get("expires_in", 604800)  # Default: 7 days (7 * 24 * 60 * 60)

    await db_client.app_discord_tokens.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "discord_access_token": new_encrypted_access,
                "expires_at": pend.now().add(seconds=new_expires_in)
            }
        }
    )

    return new_token_data["access_token"]


def generate_refresh_token(user_id: str) -> str:
    """Generate a refresh token for the user."""
    payload = {
        "sub": user_id,
        "iat": pend.now().int_timestamp,
        "exp": pend.now().add(days=30).int_timestamp
    }
    return jwt.encode(payload, config.REFRESH_SECRET, algorithm=config.ALGORITHM)
