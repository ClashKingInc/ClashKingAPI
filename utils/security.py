import jwt
import os
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from functools import wraps
import hikari
from utils.config import Config

rest = hikari.RESTApp()
config = Config()

def check_authentication(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Check if running in local development mode
        if config.is_local:
            # Local development - bypass authentication
            # Only inject user_id if the function accepts it
            import inspect
            sig = inspect.signature(func)
            if "user_id" in sig.parameters:
                kwargs["user_id"] = os.getenv("DEV_USER_ID")
            return await func(*args, **kwargs)
        
        mongo = kwargs.get('mongo')

        credentials: HTTPAuthorizationCredentials = kwargs.get("credentials")
        if not credentials:
            raise HTTPException(status_code=403, detail="Authentication token missing")
            
        auth_header = credentials.credentials

        if not auth_header:
            raise HTTPException(status_code=403, detail="Authentication token missing")

        token = auth_header.split(" ")[1] if " " in auth_header else auth_header
        expected_token = os.getenv("AUTH_TOKEN")

        if token == expected_token:
            return await func(*args, **kwargs)

        try:
            decoded_token = jwt.decode(token, os.getenv("REFRESH_SECRET"), algorithms=os.getenv("ALGORITHM"))
            user_id = decoded_token["sub"]

            # Verify user still exists - try both string and int formats
            user = await mongo.app_users.find_one({"user_id": user_id})
            if not user:
                # Try as integer if string lookup failed
                try:
                    user_id_int = int(user_id)
                    user = await mongo.app_users.find_one({"user_id": user_id_int})
                except (ValueError, TypeError):
                    pass

            if not user:
                raise HTTPException(status_code=401, detail="User not found")

            if "server_id" in kwargs:
                async with rest.acquire(token=token, token_type=hikari.TokenType.BEARER) as client:
                    try:
                        await client.fetch_guild(kwargs["server_id"])
                    except hikari.errors.ClientHTTPResponseError:
                        raise HTTPException(status_code=401, detail="This user is not a member of this guild")

            # Only inject user_id if the function accepts it
            import inspect
            sig = inspect.signature(func)
            if "user_id" in sig.parameters:
                kwargs["user_id"] = user_id
            return await func(*args, **kwargs)

        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid authentication token: " + str(e))

    return wrapper