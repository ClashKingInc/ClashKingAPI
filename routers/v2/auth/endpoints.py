import asyncio
import httpx
import pendulum as pend
import sentry_sdk
from fastapi import Header, HTTPException, Request, APIRouter, Depends
from utils.auth_utils import get_valid_discord_access_token, decode_jwt, decode_refresh_token, encrypt_data, generate_jwt, \
    generate_refresh_token, verify_password, hash_password, hash_email, prepare_email_for_storage, decrypt_data, \
    generate_verification_code
from utils.email_service import send_verification_email, send_password_reset_email_with_code
from utils.utils import db_client, generate_custom_id, config
from utils.password_validator import PasswordValidator
from utils.security_middleware import get_current_user_id
from routers.v2.auth.models import AuthResponse, UserInfo, RefreshTokenRequest, EmailRegisterRequest, EmailAuthRequest, ForgotPasswordRequest, ResetPasswordRequest


router = APIRouter(prefix="/v2", tags=["App Authentication"], include_in_schema=True)


def safe_email_log(email: str) -> str:
    """Safely format email for logging to prevent crashes."""
    if not email or not isinstance(email, str):
        return "unknown"
    if len(email) < 3:
        return "short"
    return email[:min(10, len(email))] + "***"



@router.post("/auth/verify-email-code", name="Verify email address with 6-digit code")
async def verify_email_with_code(request: Request):
    try:
        data = await request.json()
        email = data.get("email")
        code = data.get("code")
        
        if not email or not code:
            raise HTTPException(status_code=400, detail="Email and verification code are required")
        
        # Validate code format
        if not code.isdigit() or len(code) != 6:
            sentry_sdk.capture_message(f"Invalid code format: {code}", level="warning")
            raise HTTPException(status_code=400, detail="Invalid verification code format")
        
        # Find the pending verification by email hash and code
        email_hash = hash_email(email)
        
        pending_verification = await db_client.app_email_verifications.find_one({
            "email_hash": email_hash,
            "verification_code": code
        })
        
        if not pending_verification:
            # Also check for old records that might still have verification_token field
            # This provides backwards compatibility during transition
            pending_verification = await db_client.app_email_verifications.find_one({
                "email_hash": email_hash
            })
            if pending_verification and pending_verification.get("verification_token"):
                # Old record format - this should not match codes, reject it
                raise HTTPException(status_code=401, detail="Please request a new verification code")
            
            raise HTTPException(status_code=401, detail="Invalid verification code")
        
        # Check if code has expired
        try:
            expires_at = pending_verification["expires_at"]
        except KeyError as e:
            raise HTTPException(status_code=500, detail="Invalid verification record format")
        if isinstance(expires_at, str):
            # Handle string datetime format
            try:
                expires_at = pend.parse(expires_at)
            except Exception as e:
                raise HTTPException(status_code=500, detail="Invalid datetime format in verification record")
        
        # Ensure both datetimes have timezone info for comparison
        current_time = pend.now()
        if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
            # expires_at is naive, make it UTC aware
            expires_at = pend.instance(expires_at, tz='UTC')
        elif not hasattr(expires_at, 'tzinfo'):
            # Handle case where expires_at might be a different type
            expires_at = pend.parse(str(expires_at)).in_timezone('UTC')
        
        if current_time > expires_at:
            await db_client.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=401, detail="Verification code expired. Please request a new one.")
        
        # Get the pending user data
        user_data = pending_verification.get("user_data")
        if not user_data:
            sentry_sdk.capture_message(f"Missing user_data in verification record for email: {safe_email_log(email)}", level="error")
            raise HTTPException(status_code=500, detail="Invalid verification record")
        
        # Validate required fields in user_data
        required_fields = ["email_encrypted", "email_hash", "username", "password", "device_id"]
        missing_fields = [field for field in required_fields if not user_data.get(field)]
        if missing_fields:
            sentry_sdk.capture_message(f"Missing user_data fields: {missing_fields} for email: {safe_email_log(email)}", level="error")
            raise HTTPException(status_code=500, detail="Invalid verification record")
        
        # Check if email is already registered (to prevent race conditions)
        existing_user = await db_client.app_users.find_one({"email_hash": email_hash})
        
        if existing_user:
            # Check if it's a Discord user trying to add email auth
            if "discord" in existing_user.get("auth_methods", []) and "email" not in existing_user.get("auth_methods", []):
                # Update existing Discord user with email auth
                auth_methods = set(existing_user.get("auth_methods", []))
                auth_methods.add("email")
                
                await db_client.app_users.update_one(
                    {"user_id": existing_user["user_id"]},
                    {"$set": {
                        "auth_methods": list(auth_methods),
                        "username": user_data["username"],
                        "password": user_data["password"],
                        "email_encrypted": user_data["email_encrypted"],
                        "email_hash": user_data["email_hash"]
                    }}
                )
                
                user_id = existing_user["user_id"]
                user_id_raw = existing_user["user_id"]  # Set user_id_raw for existing user
                sentry_sdk.capture_message(f"Email auth added to existing Discord user: {user_id}", level="info")
            else:
                # Email already registered for email auth or verification already completed
                await db_client.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
                raise HTTPException(status_code=400, detail="This email has already been verified. Please try logging in instead.")
        else:
            # Create new user
            user_id_raw = generate_custom_id()
            user_id = str(user_id_raw)
            
            try:
                await db_client.app_users.insert_one({
                    "_id": user_id_raw,
                    "user_id": user_id,
                    "email_encrypted": user_data["email_encrypted"],
                    "email_hash": user_data["email_hash"],
                    "username": user_data["username"],
                    "password": user_data["password"],
                    "auth_methods": ["email"],
                    "created_at": pend.now()
                })
            except Exception as e:
                # If user creation fails, don't clean up verification yet
                sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/verify-email-code", "user_id": user_id})
                raise HTTPException(status_code=500, detail="Failed to create account. Please try again.")
        
        # Clean up pending verification only after successful account creation/update
        await db_client.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
        
        # Generate auth tokens
        access_token = generate_jwt(str(user_id), user_data["device_id"])
        refresh_token = generate_refresh_token(str(user_id))
        
        # Store refresh token
        # Convert user_id_raw to int for generate_custom_id
        try:
            user_id_for_custom_id = int(user_id_raw)
        except (ValueError, TypeError) as e:
            # Fallback for string user IDs (like Discord IDs)
            user_id_for_custom_id = hash(str(user_id_raw)) % (10**10)
        
        try:
            custom_id = generate_custom_id(user_id_for_custom_id)
        except Exception as e:
            raise
        
        await db_client.app_refresh_tokens.update_one(
            {"user_id": str(user_id)},
            {
                "$setOnInsert": {"_id": custom_id},
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
                avatar_url="https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png"
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/verify-email-code", "email": safe_email_log(email) if 'email' in locals() else "unknown"})
        # Log the specific error for debugging
        sentry_sdk.capture_message(f"Verify email code error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/auth/me", name="Get current user information")
async def get_current_user_info(user_id: str = Depends(get_current_user_id)):
    try:
        # Try both string and int formats for user_id lookup (consistency with security middleware)
        current_user = await db_client.app_users.find_one({"user_id": user_id})
        if not current_user:
            try:
                user_id_int = int(user_id)
                current_user = await db_client.app_users.find_one({"user_id": user_id_int})
            except (ValueError, TypeError):
                pass
        
        if not current_user:
            sentry_sdk.capture_message(f"User not found in /auth/me for user_id: {user_id} (type: {type(user_id)})", level="warning")
            raise HTTPException(status_code=404, detail="User not found")

        # Decrypt email for username fallback if needed
        decrypted_email = None
        if current_user.get("email_encrypted"):
            try:
                decrypted_email = await decrypt_data(current_user["email_encrypted"])
            except Exception as e:
                sentry_sdk.capture_exception(e, tags={"function": "decrypt_email_in_auth_me", "user_id": user_id})
                # Continue without email if decryption fails
        
        username = current_user.get("username") or decrypted_email
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
                else:
                    sentry_sdk.capture_message(f"Discord API error in /auth/me: {response.status_code} - {response.text}", level="warning")
            except Exception as e:
                sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/me", "user_id": user_id})

        return UserInfo(
            user_id=str(current_user["user_id"]),
            username=username,
            avatar_url=avatar_url
        )
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/me", "user_id": user_id})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/discord", response_model=AuthResponse, name="Authenticate with Discord")
async def auth_discord(request: Request):
    try:
        # Handle both JSON and form data for backward compatibility
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
        
        code = data.get("code")
        code_verifier = data.get("code_verifier")
        device_id = data.get("device_id")
        device_name = data.get("device_name")
        redirect_uri = data.get("redirect_uri") or config.DISCORD_REDIRECT_URI

        if not code or not code_verifier:
            sentry_sdk.capture_message(f"Missing Discord auth parameters: code={bool(code)}, code_verifier={bool(code_verifier)}", level="warning")
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
                sentry_sdk.capture_message(f"Discord token exchange failed: {token_response.status_code} - {token_response.text}", level="error")
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
                sentry_sdk.capture_message(f"Discord user info retrieval failed: {user_response.status_code} - {user_response.text}", level="error")
                raise HTTPException(status_code=500, detail="Error retrieving user info")
            user_data = user_response.json()

        discord_user_id = user_data["id"]
        email = user_data.get("email")
        
        # Prepare email encryption if email exists
        email_conditions = [{"user_id": discord_user_id}]
        if email:
            email_hash = hash_email(email)
            email_conditions.append({"email_hash": email_hash})
        
        existing_user = await db_client.app_users.find_one({"$or": email_conditions})

        if existing_user:
            user_id = existing_user["user_id"]
            auth_methods = set(existing_user.get("auth_methods", []))
            auth_methods.add("discord")
            
            # Prepare email data for update
            update_data = {
                "auth_methods": list(auth_methods),
                "username": user_data["username"]
            }
            
            if email:
                email_data = await prepare_email_for_storage(email)
                update_data.update(email_data)

            await db_client.app_users.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )
        else:
            user_id = discord_user_id
            insert_data = {
                "_id": generate_custom_id(int(user_id)),
                "user_id": user_id,
                "auth_methods": ["discord"],
                "username": user_data["username"],
                "created_at": pend.now()
            }
            
            # Add encrypted email if available
            if email:
                email_data = await prepare_email_for_storage(email)
                insert_data.update(email_data)
            
            await db_client.app_users.insert_one(insert_data)

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

        access_token = generate_jwt(str(user_id), device_id)
        refresh_token = generate_refresh_token(str(user_id))

        await db_client.app_refresh_tokens.update_one(
            {"user_id": str(user_id)},
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
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/discord"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/refresh", name="Refresh the access token")
async def refresh_access_token(request: RefreshTokenRequest) -> dict:
    try:
        # First validate the refresh token JWT signature
        try:
            decoded_refresh = decode_refresh_token(request.refresh_token)
            user_id_from_token = decoded_refresh["sub"]
        except Exception as e:
            sentry_sdk.capture_message(f"Invalid refresh token signature: {str(e)}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token signature.")
        
        # Then check if it exists in database
        stored_refresh_token = await db_client.app_refresh_tokens.find_one({"refresh_token": request.refresh_token})

        if not stored_refresh_token:
            sentry_sdk.capture_message(f"Refresh token not found in database for user: {user_id_from_token}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        if pend.now().int_timestamp > stored_refresh_token["expires_at"].timestamp():
                raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")

        user_id = stored_refresh_token["user_id"]
        
        # Verify user_id matches (ensure both are strings for comparison)
        if str(user_id) != str(user_id_from_token):
            sentry_sdk.capture_message(f"User ID mismatch in refresh token: stored={user_id}, token={user_id_from_token}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        new_access_token = generate_jwt(str(user_id), request.device_id)

        return {"access_token": new_access_token}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/refresh"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/register", name="Register with email (sends verification email)")
async def register_email_user(req: EmailRegisterRequest, request: Request):
    try:
        try:
            # Validate input
            PasswordValidator.validate_email(req.email)
            PasswordValidator.validate_password(req.password)
            PasswordValidator.validate_username(req.username)
        except HTTPException as e:
            # Log the specific validation error for debugging
            sentry_sdk.capture_message(f"Validation error in registration: {e.detail}", level="warning")
            raise e
        
        # Check if email is already registered or has pending verification
        email_hash = hash_email(req.email)
        existing_user = await db_client.app_users.find_one({"email_hash": email_hash})
        
        if existing_user and "email" in existing_user.get("auth_methods", []):
            # Email already registered for email auth
            raise HTTPException(status_code=400, detail="Email already registered. Please try logging in instead.")
        
        # Check if there's already a pending verification for this email
        existing_verification = await db_client.app_email_verifications.find_one({"email_hash": email_hash})
        if existing_verification:
            # Check if it's expired
            expires_at = existing_verification["expires_at"]
            if isinstance(expires_at, str):
                expires_at = pend.parse(expires_at)
            
            if pend.now() > expires_at:
                # Clean up expired verification and allow new registration
                await db_client.app_email_verifications.delete_one({"_id": existing_verification["_id"]})
            else:
                # Still valid - suggest resending instead of registering again
                raise HTTPException(
                    status_code=409, 
                    detail="A verification email was already sent to this address. Please check your email or request a resend."
                )
        
        # Prepare email encryption and user data
        email_data = await prepare_email_for_storage(req.email)
        
        # Generate 6-digit verification code
        verification_code = generate_verification_code()
        
        # Store pending verification with user data
        pending_verification = {
            "_id": generate_custom_id(),
            "email_hash": email_hash,
            "verification_code": verification_code,
            "user_data": {
                "email_encrypted": email_data["email_encrypted"],
                "email_hash": email_data["email_hash"],
                "username": req.username,
                "password": hash_password(req.password),
                "device_id": req.device_id
            },
            "created_at": pend.now(),
            "expires_at": pend.now().add(minutes=15)  # Shorter expiration for codes
        }
        
        # Clean up any existing pending verifications for this email
        await db_client.app_email_verifications.delete_many({"email_hash": email_hash})
        
        # Insert new pending verification
        await db_client.app_email_verifications.insert_one(pending_verification)
        
        # Send verification email
        try:
            await send_verification_email(req.email, req.username, verification_code)
        except Exception as e:
            # Clean up pending verification if email fails
            await db_client.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": req.email})
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        
        return {
            "message": "Verification email sent. Please check your email and enter the 6-digit code.",
            "verification_code": verification_code if config.IS_LOCAL else None  # Only show in local dev
        }
        
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": req.email})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/resend-verification", name="Resend verification email")
async def resend_verification_email(request: Request):
    try:
        data = await request.json()
        email = data.get("email")
        
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        
        # Validate email format
        try:
            PasswordValidator.validate_email(email)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid email format in resend verification: {email}", level="warning")
            raise e
        
        email_hash = hash_email(email)
        
        # Check if there's a pending verification for this email
        pending_verification = await db_client.app_email_verifications.find_one({"email_hash": email_hash})
        
        if not pending_verification:
            # Check if user already exists with this email
            existing_user = await db_client.app_users.find_one({"email_hash": email_hash})
            if existing_user and "email" in existing_user.get("auth_methods", []):
                raise HTTPException(status_code=400, detail="This email is already verified. Please try logging in instead.")
            else:
                raise HTTPException(status_code=404, detail="No pending verification found for this email. Please register first.")
        
        # Check if verification has expired
        expires_at = pending_verification["expires_at"]
        if isinstance(expires_at, str):
            expires_at = pend.parse(expires_at)
        
        if pend.now() > expires_at:
            await db_client.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=410, detail="Verification expired. Please register again.")
        
        # Generate new verification code
        verification_code = generate_verification_code()
        
        # Update the pending verification with new code
        await db_client.app_email_verifications.update_one(
            {"_id": pending_verification["_id"]},
            {"$set": {
                "verification_code": verification_code,
                "created_at": pend.now(),
                "expires_at": pend.now().add(minutes=15)  # Reset expiration for new code
            }}
        )
        
        # Send new verification email
        user_data = pending_verification["user_data"]
        username = user_data.get("username", "User")
        
        try:
            await send_verification_email(email, username, verification_code)
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/resend-verification", "email": email})
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        
        return {
            "message": "Verification email resent successfully. Please check your email.",
            "verification_code": verification_code if config.IS_LOCAL else None  # Only show in local dev
        }
        
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/resend-verification"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/email", response_model=AuthResponse)
async def login_with_email(req: EmailAuthRequest, request: Request):
    try:
        sentry_sdk.capture_message(f"Email login attempt for: {safe_email_log(req.email)}", level="info")
        
        # Add small delay to prevent timing attacks
        await asyncio.sleep(0.1)
        
        # Look up user by email hash
        email_hash = hash_email(req.email)
        user = await db_client.app_users.find_one({"email_hash": email_hash})
        if not user or not verify_password(req.password, user.get("password", "")):
            sentry_sdk.capture_message(f"Failed email login attempt for: {req.email}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Validate user record structure
        if not user.get("user_id"):
            sentry_sdk.capture_message(f"User record missing user_id for: {safe_email_log(req.email)}", level="error")
            raise HTTPException(status_code=500, detail="Invalid user record")
        
        if not user.get("username"):
            sentry_sdk.capture_message(f"User record missing username for: {safe_email_log(req.email)}", level="warning")
            # Set a fallback username
            user["username"] = safe_email_log(req.email)

        try:
            access_token = generate_jwt(str(user["user_id"]), req.device_id)
            refresh_token = generate_refresh_token(str(user["user_id"]))
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "token_generation", "user_id": str(user["user_id"])})
            raise HTTPException(status_code=500, detail="Failed to generate authentication tokens")

        try:
            user_id_raw = user["user_id"]
            user_id = str(user_id_raw)
            
            # Safely convert user_id to int for ID generation
            try:
                if isinstance(user_id_raw, int):
                    user_id_int = user_id_raw
                elif isinstance(user_id_raw, str) and user_id_raw.isdigit():
                    user_id_int = int(user_id_raw)
                else:
                    # Try to convert the string version
                    user_id_int = int(user_id)
            except (ValueError, TypeError):
                # Fallback: generate a new ID if conversion fails
                user_id_int = generate_custom_id()
                sentry_sdk.capture_message(f"Invalid user_id format, using fallback: {user_id}", level="warning")
            
            await db_client.app_refresh_tokens.update_one(
                {"user_id": user_id},
                {
                    "$setOnInsert": {"_id": generate_custom_id(user_id_int)},
                    "$set": {
                        "refresh_token": refresh_token,
                        "expires_at": pend.now().add(days=30)
                    }
                },
                upsert=True
            )
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "refresh_token_storage", "user_id": str(user["user_id"])})
            raise HTTPException(status_code=500, detail="Failed to store authentication tokens")

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserInfo(
                user_id=str(user["user_id"]),
                username=user["username"],
                avatar_url=user.get("avatar_url", "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png")
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/email", "email": safe_email_log(req.email) if hasattr(req, 'email') else "unknown"})
        sentry_sdk.capture_message(f"Email login error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/auth/link-discord", name="Link Discord to an existing account")
async def link_discord_account(request: Request, authorization: str = Header(None)):
    try:
        if not authorization or not authorization.startswith("Bearer "):
            sentry_sdk.capture_message("Missing or invalid authorization header in /auth/link-discord", level="warning")
            raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

        token = authorization.split("Bearer ")[1]
        decoded_token = decode_jwt(token)
        user_id = decoded_token["sub"]

        current_user = await db_client.app_users.find_one({"user_id": user_id})
        if not current_user:
            sentry_sdk.capture_message(f"User not found for Discord linking: {user_id}", level="warning")
            raise HTTPException(status_code=404, detail="User not found")

        # Handle both JSON and form data for backward compatibility
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
        
        discord_access_token = data.get("access_token")
        if not discord_access_token:
            sentry_sdk.capture_message(f"Missing Discord access token for user: {user_id}", level="warning")
            raise HTTPException(status_code=400, detail="Missing access_token")

        async with httpx.AsyncClient() as client:
            discord_response = await client.get(
                "https://discord.com/api/users/@me",
                headers={"Authorization": f"Bearer {discord_access_token}"}
            )
            if discord_response.status_code != 200:
                sentry_sdk.capture_message(f"Invalid Discord token in linking for user {user_id}: {discord_response.status_code}", level="warning")
                raise HTTPException(status_code=400, detail="Invalid Discord access token")
            discord_data = discord_response.json()

        discord_user_id = discord_data["id"]
        email = discord_data.get("email")

        # Prevent linking a Discord account already linked to another user
        conflict_user = await db_client.app_users.find_one({"linked_accounts.discord.discord_user_id": discord_user_id})
        if conflict_user and conflict_user["user_id"] != user_id:
            sentry_sdk.capture_message(f"Discord account {discord_user_id} already linked to user {conflict_user['user_id']}, attempted by {user_id}", level="warning")
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
        refresh_token = data.get("refresh_token")
        expires_in = data.get("expires_in")
        device_id = data.get("device_id")
        device_name = data.get("device_name")
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
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/link-discord", "user_id": user_id if 'user_id' in locals() else "unknown"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/link-email", name="Link Email to an existing Discord account")
async def link_email_account(req: EmailRegisterRequest, user_id: str = Depends(get_current_user_id)):
    try:
        # Validate input
        try:
            PasswordValidator.validate_email(req.email)
            PasswordValidator.validate_password(req.password)
            PasswordValidator.validate_username(req.username)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Validation error in email linking for user {user_id}: {e.detail}", level="warning")
            raise e

        current_user = await db_client.app_users.find_one({"user_id": user_id})
        if not current_user:
            sentry_sdk.capture_message(f"User not found for email linking: {user_id}", level="warning")
            raise HTTPException(status_code=404, detail="User not found")

        # Check for email conflicts using hash
        email_hash = hash_email(req.email)
        email_conflict = await db_client.app_users.find_one({"email_hash": email_hash})
        if email_conflict and email_conflict["user_id"] != user_id:
            sentry_sdk.capture_message(f"Email {req.email} already linked to user {email_conflict['user_id']}, attempted by {user_id}", level="warning")
            raise HTTPException(status_code=400, detail="Email already linked to another account")

        # Prepare encrypted email data
        email_data = await prepare_email_for_storage(req.email)
        
        await db_client.app_users.update_one(
            {"user_id": user_id},
            {"$set": {
                "auth_methods": list(set(current_user.get("auth_methods", []) + ["email"])),
                "email_encrypted": email_data["email_encrypted"],
                "email_hash": email_data["email_hash"],
                "username": req.username,
                "password": hash_password(req.password)
            }}
        )

        return {"detail": "Email successfully linked to your account"}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/link-email", "user_id": user_id, "email": req.email})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/forgot-password", name="Request password reset")
async def forgot_password(req: ForgotPasswordRequest):
    try:
        # Validate email format
        try:
            PasswordValidator.validate_email(req.email)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid email format in forgot password: {req.email}", level="warning")
            raise e
        
        # Check if user exists with this email
        email_hash = hash_email(req.email)
        user = await db_client.app_users.find_one({"email_hash": email_hash})
        
        if not user or "email" not in user.get("auth_methods", []):
            # Return success regardless to prevent email enumeration
            return {
                "message": "If an account with this email exists, you will receive a password reset link shortly."
            }
        
        # Check for existing unused reset token
        current_time = pend.now()
        existing_reset = await db_client.app_password_reset_tokens.find_one({
            "email_hash": email_hash,
            "used": False,
            "expires_at": {"$gt": current_time}
        })
        
        if existing_reset:
            # Clean up old token and create new one
            await db_client.app_password_reset_tokens.delete_one({"_id": existing_reset["_id"]})
        
        # Generate 6-digit password reset code
        reset_code = generate_verification_code()
        
        # Store password reset code
        expires_at = pend.now().add(hours=1)
        created_at = pend.now()
        
        try:
            reset_record = {
                "_id": generate_custom_id(),
                "user_id": user["user_id"],
                "email_hash": email_hash,
                "reset_code": reset_code,
                "expires_at": expires_at,
                "created_at": created_at,
                "used": False
            }
            
            await db_client.app_password_reset_tokens.insert_one(reset_record)
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "password_reset_token_insert", "user_id": user["user_id"]})
            raise HTTPException(status_code=500, detail="Failed to create password reset request")
        
        # Decrypt email for sending
        try:
            decrypted_email = await decrypt_data(user["email_encrypted"])
            if not decrypted_email:
                raise ValueError("Decrypted email is empty")
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "decrypt_email_for_password_reset", "user_id": user["user_id"]})
            # Clean up reset token if decryption fails
            await db_client.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            raise HTTPException(status_code=500, detail="Failed to process password reset request")
        
        # Send password reset email with code
        try:
            username = user.get("username", "User")
            await send_password_reset_email_with_code(decrypted_email, username, reset_code)
        except Exception as e:
            # Clean up reset token if email fails
            await db_client.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/forgot-password", "email": req.email, "decrypted_email": decrypted_email})
            raise HTTPException(status_code=500, detail="Failed to send password reset email")
        
        return {
            "message": "If an account with this email exists, you will receive a password reset code shortly."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/forgot-password", "email": req.email})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/reset-password", response_model=AuthResponse, name="Reset password with token")
async def reset_password(req: ResetPasswordRequest):
    try:
        # Validate new password
        try:
            PasswordValidator.validate_password(req.new_password)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid password format in reset password", level="warning")
            raise e
        
        # Validate code format
        if not req.reset_code.isdigit() or len(req.reset_code) != 6:
            raise HTTPException(status_code=400, detail="Invalid reset code format")
        
        # Find and validate reset code
        email_hash = hash_email(req.email)
        reset_record = await db_client.app_password_reset_tokens.find_one({
            "email_hash": email_hash,
            "reset_code": req.reset_code,
            "used": False
        })
        
        if not reset_record:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")
        
        # Check if code has expired
        if pend.now() > reset_record["expires_at"]:
            # Clean up expired code
            await db_client.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")
        
        # Get user
        user = await db_client.app_users.find_one({"user_id": reset_record["user_id"]})
        if not user:
            sentry_sdk.capture_message(f"User not found for password reset: {reset_record['user_id']}", level="error")
            raise HTTPException(status_code=400, detail="Invalid reset code")
        
        # Update password
        new_password_hash = hash_password(req.new_password)
        await db_client.app_users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password": new_password_hash}}
        )
        
        # Mark reset code as used
        await db_client.app_password_reset_tokens.update_one(
            {"_id": reset_record["_id"]},
            {"$set": {"used": True}}
        )
        
        # Generate new auth tokens
        access_token = generate_jwt(str(user["user_id"]), req.device_id)
        refresh_token = generate_refresh_token(str(user["user_id"]))
        
        # Store refresh token
        try:
            user_id_raw = user["user_id"]
            user_id = str(user_id_raw)
            
            # Convert user_id to int for ID generation
            try:
                if isinstance(user_id_raw, int):
                    user_id_int = user_id_raw
                elif isinstance(user_id_raw, str) and user_id_raw.isdigit():
                    user_id_int = int(user_id_raw)
                else:
                    user_id_int = int(user_id)
            except (ValueError, TypeError):
                user_id_int = generate_custom_id()
                sentry_sdk.capture_message(f"Invalid user_id format in password reset, using fallback: {user_id}", level="warning")
            
            await db_client.app_refresh_tokens.update_one(
                {"user_id": user_id},
                {
                    "$setOnInsert": {"_id": generate_custom_id(user_id_int)},
                    "$set": {
                        "refresh_token": refresh_token,
                        "expires_at": pend.now().add(days=30)
                    }
                },
                upsert=True
            )
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "refresh_token_storage_password_reset", "user_id": str(user["user_id"])})
            raise HTTPException(status_code=500, detail="Failed to store authentication tokens")
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserInfo(
                user_id=str(user["user_id"]),
                username=user["username"],
                avatar_url=user.get("avatar_url", "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png")
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/reset-password"})
        raise HTTPException(status_code=500, detail="Internal server error")
