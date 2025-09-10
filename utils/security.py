import jwt
import os
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from functools import wraps
import hikari
from utils.config import Config
import pendulum as pend
import inspect

rest = hikari.RESTApp()
config = Config()


def check_authentication(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        if config.is_local:
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
            decoded_token = jwt.decode(token, os.getenv("REFRESH_SECRET"), algorithms=os.getenv("ALGORITHM"))
            user_id = decoded_token["sub"]

            user = await mongo.users.find_one({"user_id": user_id})
            if not user:
                try:
                    user_id_int = int(user_id)
                    user = await mongo.users.find_one({"user_id": user_id_int})
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

            sig = inspect.signature(func)
            if "user_id" in sig.parameters:
                kwargs["user_id"] = user_id
            return await func(*args, **kwargs)

        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid authentication token: " + str(e))

    return wrapper