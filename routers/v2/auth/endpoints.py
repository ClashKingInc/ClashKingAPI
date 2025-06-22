import httpx
import pendulum as pend
from fastapi import Header, HTTPException, Request, APIRouter, Depends
from slowapi import Limiter
from slowapi.util import get_ipaddr
from utils.auth_utils import get_valid_discord_access_token, decode_jwt, decode_refresh_token, encrypt_data, generate_jwt, \
    generate_refresh_token, verify_password, hash_password
from utils.utils import db_client, generate_custom_id, config
from utils.password_validator import PasswordValidator
from utils.security_middleware import get_current_user_id
from routers.v2.auth.models import AuthResponse, UserInfo, RefreshTokenRequest, EmailRegisterRequest, EmailAuthRequest

limiter = Limiter(key_func=get_ipaddr)

router = APIRouter(prefix="/v2", tags=["App Authentication"], include_in_schema=True)


@router.get("/auth/me", name="Get current user information")
async def get_current_user_info(user_id: str = Depends(get_current_user_id)):
    current_user = await db_client.app_users.find_one({"user_id": user_id})
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    username = current_user.get("username") or current_user.get("email")
    avatar_url = current_user.get("avatar_url") or "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png"

    if "discord" in current_user.get("auth_methods", []):
        try:
            discord_access = await get_valid_discord_access_token(current_user["user_id"])
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://discord.com/api/users/@me",
                    headers={"Authorization": f"Bearer {discord_access}"}
                )
            if response.status_code == 200:
                discord_data = response.json()
                username = discord_data.get("global_name") or discord_data.get("username") or username
                avatar = discord_data.get("avatar")
                avatar_url = (
                    f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{avatar}.png"
                    if avatar else avatar_url
                )
        except Exception:
            pass

    return UserInfo(
        user_id=current_user["user_id"],
        username=username,
        avatar_url=avatar_url
    )


@router.post("/auth/discord", response_model=AuthResponse, name="Authenticate with Discord")
@limiter.limit("5/minute")
async def auth_discord(request: Request):
    form = await request.form()
    code = form.get("code")
    code_verifier = form.get("code_verifier")
    device_id = form.get("device_id")
    device_name = form.get("device_name")
    redirect_uri = form.get("redirect_uri") or config.DISCORD_REDIRECT_URI

    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")

    token_url = "https://discord.com/api/oauth2/token"
    token_data = {
        "client_id": config.DISCORD_CLIENT_ID,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier
    }

    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_data,
                                           headers={"Content-Type": "application/x-www-form-urlencoded"})

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Discord token error: {token_response.status_code} - {token_response.text}"
            )

        discord_data = token_response.json()
        access_token_discord = discord_data["access_token"]
        refresh_token_discord = discord_data["refresh_token"]
        expires_in = discord_data["expires_in"]

    async with httpx.AsyncClient() as client:
        user_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token_discord}"},
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=500, detail="Error retrieving user info")
        user_data = user_response.json()

    discord_user_id = user_data["id"]
    email = user_data.get("email")

    existing_user = await db_client.app_users.find_one({"$or": [
        {"user_id": discord_user_id},
        {"email": email}
    ]})

    if existing_user:
        user_id = existing_user["user_id"]
        auth_methods = set(existing_user.get("auth_methods", []))
        auth_methods.add("discord")

        await db_client.app_users.update_one(
            {"user_id": user_id},
            {"$set": {
                "auth_methods": list(auth_methods),
                "email": email,
                "username": user_data["username"]
            }}
        )
    else:
        user_id = discord_user_id
        await db_client.app_users.insert_one({
            "_id": generate_custom_id(int(user_id)),
            "user_id": user_id,
            "auth_methods": ["discord"],
            "email": email,
            "username": user_data["username"],
            "created_at": pend.now()
        })

    encrypted_discord_access = await encrypt_data(access_token_discord)
    encrypted_discord_refresh = await encrypt_data(refresh_token_discord)

    await db_client.app_discord_tokens.update_one(
        {"user_id": user_id, "device_id": device_id, "device_name": device_name},
        {
            "$setOnInsert": {"_id": generate_custom_id(int(user_id))},
            "$set": {
                "discord_access_token": encrypted_discord_access,
                "discord_refresh_token": encrypted_discord_refresh,
                "expires_at": pend.now().add(seconds=expires_in)
            }
        },
        upsert=True
    )

    access_token = generate_jwt(user_id, device_id)
    refresh_token = generate_refresh_token(user_id)

    await db_client.app_refresh_tokens.update_one(
        {"user_id": user_id},
        {
            "$setOnInsert": {"_id": generate_custom_id(int(user_id))},
            "$set": {
                "refresh_token": refresh_token,
                "expires_at": pend.now().add(days=30)
            }
        },
        upsert=True
    )

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserInfo(
            user_id=str(user_id),
            username=user_data["username"],
            avatar_url=f"https://cdn.discordapp.com/avatars/{discord_user_id}/{user_data['avatar']}.png"
        )
    )


@router.post("/auth/refresh", name="Refresh the access token")
async def refresh_access_token(request: RefreshTokenRequest) -> dict:
    # First validate the refresh token JWT signature
    try:
        decoded_refresh = decode_refresh_token(request.refresh_token)
        user_id_from_token = decoded_refresh["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token signature.")
    
    # Then check if it exists in database
    stored_refresh_token = await db_client.app_refresh_tokens.find_one({"refresh_token": request.refresh_token})

    if not stored_refresh_token:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    if pend.now().int_timestamp > stored_refresh_token["expires_at"].timestamp():
        raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")

    user_id = stored_refresh_token["user_id"]
    
    # Verify user_id matches
    if user_id != user_id_from_token:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    new_access_token = generate_jwt(user_id, request.device_id)

    return {"access_token": new_access_token}


@router.post("/auth/register", response_model=AuthResponse)
@limiter.limit("3/minute")
async def register_email_user(req: EmailRegisterRequest, request: Request):
    # Validate input
    PasswordValidator.validate_email(req.email)
    PasswordValidator.validate_password(req.password)
    PasswordValidator.validate_username(req.username)
    
    existing_user = await db_client.app_users.find_one({"email": req.email})
    if existing_user:
        user_id = existing_user["user_id"]
        auth_methods = set(existing_user.get("auth_methods", []))
        auth_methods.add("email")

        await db_client.app_users.update_one(
            {"user_id": user_id},
            {"$set": {
                "auth_methods": list(auth_methods),
                "username": req.username,
                "password": hash_password(req.password)
            }}
        )
    else:
        user_id = generate_custom_id()
        await db_client.app_users.insert_one({
            "_id": user_id,
            "user_id": user_id,
            "email": req.email,
            "username": req.username,
            "password": hash_password(req.password),
            "auth_methods": ["email"],
            "created_at": pend.now()
        })

    access_token = generate_jwt(user_id, req.device_id)
    refresh_token = generate_refresh_token(user_id)

    await db_client.app_refresh_tokens.update_one(
        {"user_id": user_id},
        {
            "$setOnInsert": {"_id": str(generate_custom_id())},
            "$set": {
                "refresh_token": refresh_token,
                "expires_at": pend.now().add(days=30)
            }
        },
        upsert=True
    )

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserInfo(
            user_id=str(user_id),
            username=req.username,
            avatar_url="https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png"
        )
    )


@router.post("/auth/email", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login_with_email(req: EmailAuthRequest, request: Request):
    # Add small delay to prevent timing attacks
    import asyncio
    await asyncio.sleep(0.1)
    
    user = await db_client.app_users.find_one({"email": req.email})
    if not user or not verify_password(req.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = generate_jwt(user["user_id"], req.device_id)
    refresh_token = generate_refresh_token(user["user_id"])

    await db_client.app_refresh_tokens.update_one(
        {"user_id": user["user_id"]},
        {
            "$setOnInsert": {"_id": generate_custom_id()},
            "$set": {
                "refresh_token": refresh_token,
                "expires_at": pend.now().add(days=30)
            }
        },
        upsert=True
    )

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserInfo(
            user_id=user["user_id"],
            username=user["username"],
            avatar_url=user.get("avatar_url", "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png")
        )
    )

@router.post("/auth/link-discord", name="Link Discord to an existing account")
async def link_discord_account(request: Request, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]

    current_user = await db_client.app_users.find_one({"user_id": user_id})
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    form = await request.form()
    discord_access_token = form.get("access_token")
    if not discord_access_token:
        raise HTTPException(status_code=400, detail="Missing access_token")

    async with httpx.AsyncClient() as client:
        discord_response = await client.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {discord_access_token}"}
        )
        if discord_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Discord access token")
        discord_data = discord_response.json()

    discord_user_id = discord_data["id"]
    email = discord_data.get("email")

    # Prevent linking a Discord account already linked to another user
    conflict_user = await db_client.app_users.find_one({"linked_accounts.discord.discord_user_id": discord_user_id})
    if conflict_user and conflict_user["user_id"] != user_id:
        raise HTTPException(status_code=400, detail="Discord account already linked to another user")

    await db_client.app_users.update_one(
        {"user_id": user_id},
        {"$set": {
            "auth_methods": list(set(current_user.get("auth_methods", []) + ["discord"])),
            "linked_accounts.discord": {
                "linked_at": pend.now().to_iso8601_string(),
                "discord_user_id": discord_user_id,
                "username": discord_data.get("username"),
                "email": email
            }
        }}
    )

    encrypted_discord_access = await encrypt_data(discord_access_token)
    refresh_token = form.get("refresh_token")
    expires_in = form.get("expires_in")
    device_id = form.get("device_id")
    device_name = form.get("device_name")
    if refresh_token and expires_in:
        encrypted_discord_refresh = await encrypt_data(refresh_token)
        await db_client.app_discord_tokens.update_one(
            {"user_id": user_id, "device_id": device_id, "device_name": device_name},
            {
                "$setOnInsert": {"_id": generate_custom_id(int(user_id))},
                "$set": {
                    "discord_access_token": encrypted_discord_access,
                    "discord_refresh_token": encrypted_discord_refresh,
                    "expires_at": pend.now().add(seconds=int(expires_in))
                }
            },
            upsert=True
        )

    return {"detail": "Discord account successfully linked"}


@router.post("/auth/link-email", name="Link Email to an existing Discord account")
async def link_email_account(req: EmailRegisterRequest, user_id: str = Depends(get_current_user_id)):
    # Validate input
    PasswordValidator.validate_email(req.email)
    PasswordValidator.validate_password(req.password)
    PasswordValidator.validate_username(req.username)

    current_user = await db_client.app_users.find_one({"user_id": user_id})
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    email_conflict = await db_client.app_users.find_one({"email": req.email})
    if email_conflict and email_conflict["user_id"] != user_id:
        raise HTTPException(status_code=400, detail="Email already linked to another account")

    await db_client.app_users.update_one(
        {"user_id": user_id},
        {"$set": {
            "auth_methods": list(set(current_user.get("auth_methods", []) + ["email"])),
            "email": req.email,
            "username": req.username,
            "password": hash_password(req.password)
        }}
    )

    return {"detail": "Email successfully linked to your account"}
