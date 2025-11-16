import jwt
import os
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from functools import wraps
import hikari
from utils.config import Config
import pendulum as pend
import inspect

config = Config()


def check_authentication(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        mongo = kwargs.get('mongo')
        rest = kwargs.get('rest')  # Get injected REST (only needed if server_id in kwargs)

        credentials: HTTPAuthorizationCredentials = kwargs.get("credentials")
        if not credentials:
            # In local mode, allow bypass without authentication for development
            if config.is_local:
                sig = inspect.signature(func)
                if "user_id" in sig.parameters:
                    kwargs["user_id"] = os.getenv("DEV_USER_ID")
                return await func(*args, **kwargs)
            raise HTTPException(status_code=403, detail="Authentication token missing")

        auth_header = credentials.credentials
        if not auth_header:
            raise HTTPException(status_code=403, detail="Authentication token missing")

        token = auth_header.split(" ")[1] if " " in auth_header else auth_header
        expected_token = os.getenv("AUTH_TOKEN")

        # Option 1 : Static token
        if token == expected_token:
            return await func(*args, **kwargs)

        # Option 2 : Token stored in DB (rosters, giveaways)
        token_doc = await mongo.tokens_db.find_one({"token": token})
        if token_doc:
            if token_doc["expires_at"] < pend.now():
                raise HTTPException(status_code=401, detail="Access token expired")


            sig = inspect.signature(func)
            if "user_id" in sig.parameters:
                # on force un user_id factice lié au server
                kwargs["user_id"] = f"server:{token_doc['server_id']}"
            if "server_id" in sig.parameters and "server_id" not in kwargs:
                kwargs["server_id"] = token_doc["server_id"]

            return await func(*args, **kwargs)

        # Option 3 : JWT token
        try:
            decoded_token = jwt.decode(token, config.secret_key, algorithms=config.algorithm)
            user_id = decoded_token["sub"]
            device_id = decoded_token.get("device")
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid authentication token: " + str(e))

        user = await mongo.users.find_one({"user_id": user_id})
        if not user:
            try:
                user_id_int = int(user_id)
                user = await mongo.users.find_one({"user_id": user_id_int})
            except (ValueError, TypeError):
                pass

        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Only verify server membership if rest is available and server_id is in kwargs
        if "server_id" in kwargs and rest:
            async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
                try:
                    await client.fetch_member(kwargs["server_id"], user_id)
                except hikari.errors.NotFoundError:
                    raise HTTPException(status_code=401, detail="This user is not a member of this guild")

        sig = inspect.signature(func)
        if "user_id" in sig.parameters:
            kwargs["user_id"] = user_id
        if "device_id" in sig.parameters and device_id:
            kwargs["device_id"] = device_id

        return await func(*args, **kwargs)

    return wrapper