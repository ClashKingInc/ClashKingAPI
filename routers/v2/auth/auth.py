import asyncio
import hikari
import linkd
import pendulum as pend
import sentry_sdk

from fastapi import Header, HTTPException, Request, APIRouter, Depends
from routers.v2.auth.auth_utils import (
    get_valid_discord_access_token, decode_jwt, decode_refresh_token,
    encrypt_data, generate_jwt, generate_refresh_token, verify_password,
    hash_password, hash_email, prepare_email_for_storage, decrypt_data,
    generate_verification_code, safe_email_log
)
from utils.email_service import send_verification_email, send_password_reset_email_with_code
from utils.security import check_authentication
from utils.utils import generate_custom_id
from utils.config import Config
from utils.database import MongoClient
from utils.password_validator import PasswordValidator
from routers.v2.auth.auth_models import (
    AuthResponse, UserInfo, RefreshTokenRequest,
    EmailRegisterRequest, EmailAuthRequest,
    ForgotPasswordRequest, ResetPasswordRequest
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()


router = APIRouter(prefix="/v2", tags=["App Authentication"], include_in_schema=True)

@router.post("/auth/verify-email-code", name="Verify email address with 6-digit code")
@linkd.ext.fastapi.inject
async def verify_email_with_code(
        request: Request,
        *,
        mongo: MongoClient
) -> AuthResponse:
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

        pending_verification = await mongo.app_email_verifications.find_one({
            "email_hash": email_hash,
            "verification_code": code
        })

        if not pending_verification:
            # Also check for old records that might still have verification_token field
            # This provides backwards compatibility during transition
            pending_verification = await mongo.app_email_verifications.find_one({
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
        current_time = pend.now(tz=pend.UTC)
        if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
            # expires_at is naive, make it UTC aware
            expires_at = pend.instance(expires_at, tz='UTC')
        elif not hasattr(expires_at, 'tzinfo'):
            # Handle case where expires_at might be a different type
            expires_at = pend.parse(str(expires_at)).in_timezone('UTC')

        if current_time > expires_at:
            await mongo.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=401, detail="Verification code expired. Please request a new one.")

        # Get the pending user data
        user_data = pending_verification.get("user_data")
        if not user_data:
            sentry_sdk.capture_message(f"Missing user_data in verification record for email: {safe_email_log(email)}",
                                       level="error")
            raise HTTPException(status_code=500, detail="Invalid verification record")

        # Validate required fields in user_data
        required_fields = ["email_encrypted", "email_hash", "username", "password", "device_id"]
        missing_fields = [field for field in required_fields if not user_data.get(field)]
        if missing_fields:
            sentry_sdk.capture_message(f"Missing user_data fields: {missing_fields} for email: {safe_email_log(email)}",
                                       level="error")
            raise HTTPException(status_code=500, detail="Invalid verification record")

        # Check if email is already registered (to prevent race conditions)
        existing_user = await mongo.app_users.find_one({"email_hash": email_hash})

        if existing_user:
            # Check if it's a Discord user trying to add email auth
            if "discord" in existing_user.get("auth_methods", []) and "email" not in existing_user.get("auth_methods",
                                                                                                       []):
                # Update existing Discord user with email auth
                auth_methods = set(existing_user.get("auth_methods", []))
                auth_methods.add("email")

                await mongo.app_users.update_one(
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
                await mongo.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
                raise HTTPException(status_code=400,
                                    detail="This email has already been verified. Please try logging in instead.")
        else:
            # Create new user
            user_id_raw = generate_custom_id()
            user_id = str(user_id_raw)

            try:
                await mongo.app_users.insert_one({
                    "user_id": user_id,
                    "email_encrypted": user_data["email_encrypted"],
                    "email_hash": user_data["email_hash"],
                    "username": user_data["username"],
                    "password": user_data["password"],
                    "auth_methods": ["email"],
                    "created_at": pend.now(tz=pend.UTC)
                })
            except Exception as e:
                # If user creation fails, don't clean up verification yet
                sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/verify-email-code", "user_id": user_id})
                raise HTTPException(status_code=500, detail="Failed to create account. Please try again.")

        # Clean up pending verification only after successful account creation/update
        await mongo.app_email_verifications.delete_one({"_id": pending_verification["_id"]})

        # Generate auth tokens
        access_token = generate_jwt(str(user_id), user_data["device_id"])
        refresh_token = generate_refresh_token(str(user_id))

        # Store refresh token
        await mongo.app_refresh_tokens.update_one(
            {"user_id": str(user_id)},
            {
                "$set": {
                    "refresh_token": refresh_token,
                    "expires_at": pend.now(tz=pend.UTC).add(days=30)
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
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/verify-email-code",
                                              "email": safe_email_log(email) if 'email' in locals() else "unknown"})
        # Log the specific error for debugging
        sentry_sdk.capture_message(f"Verify email code error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/auth/me", name="Get current user information")
@linkd.ext.fastapi.inject
@check_authentication
async def get_current_user_info(
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> UserInfo:
    try:
        # Try both string and int formats for user_id lookup (consistency with security middleware)
        current_user = await mongo.app_users.find_one({"user_id": user_id})
        if not current_user:
            try:
                user_id_int = int(user_id)
                current_user = await mongo.app_users.find_one({"user_id": user_id_int})
            except (ValueError, TypeError):
                pass

        if not current_user:
            sentry_sdk.capture_message(f"User not found in /auth/me for user_id: {user_id} (type: {type(user_id)})",
                                       level="warning")
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
                discord_access = await get_valid_discord_access_token(current_user["user_id"], rest, mongo)
                async with rest.acquire(token=discord_access, token_type=hikari.TokenType.BEARER) as client:
                    try:
                        user = await client.fetch_my_user()
                        username = user.global_name or user.username or username
                        avatar_url = user.avatar_url.url if user.avatar_url else avatar_url
                    except hikari.UnauthorizedError:
                        sentry_sdk.capture_message(
                            f"Discord API error in /auth/me: Invalid Token", level="warning")

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


@router.post("/auth/discord", name="Authenticate with Discord")
@linkd.ext.fastapi.inject
async def auth_discord(request: Request, *, config: Config, mongo: MongoClient, rest: hikari.RESTApp) -> AuthResponse:
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
        redirect_uri = data.get("redirect_uri") or config.discord_redirect_uri

        if not code or not code_verifier:
            sentry_sdk.capture_message(
                f"Missing Discord auth parameters: code={bool(code)}",
                level="warning")
            raise HTTPException(status_code=400, detail="Missing Discord code")

        async with rest.acquire(None) as client:
            try:
                auth = await client.authorize_access_token(
                    client=config.discord_client_id,
                    client_secret=config.discord_client_secret,
                    code=code,
                    redirect_uri=redirect_uri,
                    code_verifier=code_verifier
                )
            except hikari.errors.UnauthorizedError:
                sentry_sdk.capture_message(
                    f"Incorrect client or client secret passed",
                    level="error",
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Discord token error: Incorrect client or client secret passed",
                )
            except hikari.errors.BadRequestError:
                sentry_sdk.capture_message(
                    f"Invalid redirect uri or code passed",
                    level="error",
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Discord token error: Invalid redirect uri or code passed",
                )


        async with rest.acquire(token=auth.access_token, token_type=hikari.TokenType.BEARER) as client:
            user = await client.fetch_my_user()

        # Prepare email encryption if email exists
        email_conditions = [{"user_id": user.id}]
        if user.email:
            email_hash = hash_email(user.email)
            email_conditions.append({"email_hash": email_hash})
        existing_user = await mongo.app_users.find_one({"$or": email_conditions})

        if existing_user:
            user_id = existing_user["user_id"]
            auth_methods = set(existing_user.get("auth_methods", []))
            auth_methods.add("discord")

            # Prepare email data for update
            update_data = {
                "auth_methods": list(auth_methods),
                "username": user.username
            }

            if user.email:
                email_data = await prepare_email_for_storage(user.email)
                update_data.update(email_data)

            await mongo.app_users.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )
        else:
            user_id = user.id
            insert_data = {
                "user_id": user_id,
                "auth_methods": ["discord"],
                "username": user.username,
                "created_at": pend.now(tz=pend.UTC)
            }

            # Add encrypted email if available
            if user.email:
                email_data = await prepare_email_for_storage(user.email)
                insert_data.update(email_data)

            await mongo.app_users.insert_one(insert_data)

        encrypted_discord_access = await encrypt_data(auth.access_token)
        encrypted_discord_refresh = await encrypt_data(str(auth.refresh_token))

        await mongo.app_discord_tokens.update_one(
            {"user_id": user_id, "device_id": device_id, "device_name": device_name},
            {
                "$set": {
                    "discord_access_token": encrypted_discord_access,
                    "discord_refresh_token": encrypted_discord_refresh,
                    "expires_at": pend.now(tz=pend.UTC).add(seconds=auth.expires_in.seconds)
                }
            },
            upsert=True
        )

        access_token = generate_jwt(str(user_id), device_id)
        refresh_token = generate_refresh_token(str(user_id))

        await mongo.app_refresh_tokens.update_one(
            {"user_id": str(user_id)},
            {
                "$set": {
                    "refresh_token": refresh_token,
                    "expires_at": pend.now(tz=pend.UTC).add(days=30)
                }
            },
            upsert=True
        )

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=UserInfo(
                user_id=str(user_id),
                username=user.username,
                avatar_url=user.avatar_url.url if user.avatar_url else user.default_avatar_url,
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/discord"})
        raise HTTPException(status_code=500, detail="Internal server error")




@router.post("/auth/refresh", name="Refresh the access token")
@linkd.ext.fastapi.inject
async def refresh_access_token(request: RefreshTokenRequest, *, mongo: MongoClient) -> dict:
    try:
        # First validate the refresh token JWT signature
        try:
            decoded_refresh = decode_refresh_token(request.refresh_token)
            user_id_from_token = decoded_refresh["sub"]
        except Exception as e:
            sentry_sdk.capture_message(f"Invalid refresh token signature: {str(e)}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token signature.")

        # Then check if it exists in database
        stored_refresh_token = await mongo.app_refresh_tokens.find_one({"refresh_token": request.refresh_token})

        if not stored_refresh_token:
            sentry_sdk.capture_message(f"Refresh token not found in database for user: {user_id_from_token}",
                                       level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        if pend.now().int_timestamp > stored_refresh_token["expires_at"].timestamp():
            raise HTTPException(status_code=401, detail="Expired refresh token. Please login again.")

        user_id = stored_refresh_token["user_id"]

        # Verify user_id matches (ensure both are strings for comparison)
        if str(user_id) != str(user_id_from_token):
            sentry_sdk.capture_message(
                f"User ID mismatch in refresh token: stored={user_id}, token={user_id_from_token}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        new_access_token = generate_jwt(str(user_id), request.device_id)

        return {"access_token": new_access_token}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/refresh"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/register", name="Register with email (sends verification email)")
@linkd.ext.fastapi.inject
async def register_email_user(req: EmailRegisterRequest, *, mongo: MongoClient, config: Config) -> dict:
    try:
        try:
            # Validate input
            PasswordValidator.validate_email(str(req.email))
            PasswordValidator.validate_password(req.password)
            PasswordValidator.validate_username(req.username)
        except HTTPException as e:
            # Log the specific validation error for debugging
            sentry_sdk.capture_message(f"Validation error in registration: {e.detail}", level="warning")
            raise e

        # Check if email is already registered or has pending verification
        email_hash = hash_email(str(req.email))
        existing_user = await mongo.app_users.find_one({"email_hash": email_hash})

        if existing_user and "email" in existing_user.get("auth_methods", []):
            # Email already registered for email auth
            raise HTTPException(status_code=400, detail="Email already registered. Please try logging in instead.")

        # Check if there's already a pending verification for this email
        existing_verification = await mongo.app_email_verifications.find_one({"email_hash": email_hash})
        if existing_verification:
            # Check if it's expired
            expires_at = existing_verification["expires_at"]
            if isinstance(expires_at, str):
                expires_at = pend.parse(expires_at)

            # Ensure both datetimes have timezone info for comparison
            current_time = pend.now()
            if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
                # expires_at is naive, make it UTC aware
                expires_at = pend.instance(expires_at, tz='UTC')
            elif not hasattr(expires_at, 'tzinfo'):
                # Handle case where expires_at might be a different type
                expires_at = pend.parse(str(expires_at)).in_timezone('UTC')

            if current_time > expires_at:
                # Clean up expired verification and allow new registration
                await mongo.app_email_verifications.delete_one({"_id": existing_verification["_id"]})
            else:
                # Still valid - suggest resending instead of registering again
                raise HTTPException(
                    status_code=409,
                    detail="A verification email was already sent to this address. Please check your email or request a resend."
                )

        # Prepare email encryption and user data
        email_data = await prepare_email_for_storage(str(req.email))

        # Generate 6-digit verification code
        verification_code = generate_verification_code()

        # Store pending verification with user data
        pending_verification = {
            "email_hash": email_hash,
            "verification_code": verification_code,
            "user_data": {
                "email_encrypted": email_data["email_encrypted"],
                "email_hash": email_data["email_hash"],
                "username": req.username,
                "password": hash_password(req.password),
                "device_id": req.device_id
            },
            "created_at": pend.now(tz=pend.UTC),
            "expires_at": pend.now(tz=pend.UTC).add(minutes=15)  # Shorter expiration for codes
        }

        # Clean up any existing pending verifications for this email
        await mongo.app_email_verifications.delete_many({"email_hash": email_hash})

        # Insert new pending verification
        await mongo.app_email_verifications.insert_one(pending_verification)

        # Send verification email
        try:
            await send_verification_email(str(req.email), req.username, verification_code)
        except Exception as e:
            # Clean up pending verification if email fails
            await mongo.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": safe_email_log(str(req.email))})
            raise HTTPException(status_code=500, detail="Failed to send verification email")

        return {
            "message": "Verification email sent. Please check your email and enter the 6-digit code.",
            "verification_code": verification_code if config.is_local else None  # Only show in local dev
        }

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": safe_email_log(req.email)})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/resend-verification", name="Resend verification email")
@linkd.ext.fastapi.inject
async def resend_verification_email(request: Request, *, mongo: MongoClient) -> dict:
    try:
        data = await request.json()
        email = data.get("email")

        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        # Validate email format
        try:
            PasswordValidator.validate_email(email)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid email format in resend verification: {safe_email_log(email)}",
                                       level="warning")
            raise e

        email_hash = hash_email(email)

        # Check if there's a pending verification for this email
        pending_verification = await mongo.app_email_verifications.find_one({"email_hash": email_hash})

        if not pending_verification:
            # Check if user already exists with this email
            existing_user = await mongo.app_users.find_one({"email_hash": email_hash})
            if existing_user and "email" in existing_user.get("auth_methods", []):
                raise HTTPException(status_code=400,
                                    detail="This email is already verified. Please try logging in instead.")
            else:
                raise HTTPException(status_code=404,
                                    detail="No pending verification found for this email. Please register first.")

        # Check if verification has expired
        expires_at = pending_verification["expires_at"]
        if isinstance(expires_at, str):
            expires_at = pend.parse(expires_at)

        # Ensure both datetimes have timezone info for comparison
        current_time = pend.now()
        if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
            # expires_at is naive, make it UTC aware
            expires_at = pend.instance(expires_at, tz='UTC')
        elif not hasattr(expires_at, 'tzinfo'):
            # Handle case where expires_at might be a different type
            expires_at = pend.parse(str(expires_at)).in_timezone('UTC')

        if current_time > expires_at:
            await mongo.app_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=410, detail="Verification expired. Please register again.")

        # Generate new verification code
        verification_code = generate_verification_code()

        # Update the pending verification with new code
        await mongo.app_email_verifications.update_one(
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
            sentry_sdk.capture_exception(e,
                                         tags={"endpoint": "/auth/resend-verification", "email": safe_email_log(email)})
            raise HTTPException(status_code=500, detail="Failed to send verification email")

        return {
            "message": "Verification email resent successfully. Please check your email.",
            "verification_code": verification_code if config.is_local else None  # Only show in local dev
        }

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/resend-verification"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/email")
@linkd.ext.fastapi.inject
async def login_with_email(req: EmailAuthRequest, *, mongo: MongoClient) -> AuthResponse:
    try:

        # Add small delay to prevent timing attacks
        await asyncio.sleep(0.1)

        # Look up user by email hash
        email_hash = hash_email(str(req.email))
        user = await mongo.app_users.find_one({"email_hash": email_hash})

        if not user:
            # Check if email exists but is not verified yet
            pending_verification = await mongo.app_email_verifications.find_one({"email_hash": email_hash})

            if pending_verification:
                # Email exists but is not verified
                sentry_sdk.capture_message(f"Login attempt for unverified email: {safe_email_log(str(req.email))}",
                                           level="warning")
                raise HTTPException(status_code=409,
                                    detail="Email not verified. Please check your email and enter the verification code.")
            else:
                # Email doesn't exist at all
                sentry_sdk.capture_message(f"Failed email login attempt for: {safe_email_log(req.email)}",
                                           level="warning")
                raise HTTPException(status_code=401, detail="Invalid email or password")

        if not verify_password(req.password, user.get("password", "")):
            sentry_sdk.capture_message(f"Failed password verification for: {safe_email_log(str(req.email))}",
                                       level="warning")
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Validate user record structure
        if not user.get("user_id"):
            sentry_sdk.capture_message(f"User record missing user_id for: {safe_email_log(str(req.email))}",
                                       level="error")
            raise HTTPException(status_code=500, detail="Invalid user record")

        if not user.get("username"):
            sentry_sdk.capture_message(f"User record missing username for: {safe_email_log(str(req.email))}",
                                       level="warning")
            # Set a fallback username
            user["username"] = safe_email_log(str(req.email))

        try:
            access_token = generate_jwt(str(user["user_id"]), req.device_id)
            refresh_token = generate_refresh_token(str(user["user_id"]))
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "token_generation", "user_id": str(user["user_id"])})
            raise HTTPException(status_code=500, detail="Failed to generate authentication tokens")

        try:
            user_id_raw = user["user_id"]
            user_id = str(user_id_raw)

            await mongo.app_refresh_tokens.update_one(
                {"user_id": user_id},
                {
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
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/email",
                                              "email": safe_email_log(str(req.email)) if hasattr(req,
                                                                                            'email') else "unknown"})
        sentry_sdk.capture_message(f"Email login error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/link-discord", name="Link Discord to an existing account")
@linkd.ext.fastapi.inject
async def link_discord_account(
        request: Request,
        authorization: str = Header(None),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    try:
        if not authorization or not authorization.startswith("Bearer "):
            sentry_sdk.capture_message("Missing or invalid authorization header in /auth/link-discord", level="warning")
            raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

        token = authorization.split("Bearer ")[1]
        decoded_token = decode_jwt(token)
        user_id = decoded_token["sub"]

        current_user = await mongo.app_users.find_one({"user_id": user_id})
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

        async with rest.acquire(token=discord_access_token, token_type=hikari.TokenType.BEARER) as client:
            try:
                user = await client.fetch_my_user()
            except hikari.UnauthorizedError:
                sentry_sdk.capture_message(
                    f"Invalid Discord token in linking for user {user_id}",
                    level="warning")
                raise HTTPException(status_code=400, detail="Invalid Discord access token")


        # Prevent linking a Discord account already linked to another user
        conflict_user = await mongo.app_users.find_one({"linked_accounts.discord.discord_user_id": user.id})
        if conflict_user and conflict_user["user_id"] != user_id:
            sentry_sdk.capture_message(
                f"Discord account {user.id} already linked to user {conflict_user['user_id']}, attempted by {user_id}",
                level="warning")
            raise HTTPException(status_code=400, detail="Discord account already linked to another user")

        await mongo.app_users.update_one(
            {"user_id": user_id},
            {"$set": {
                "auth_methods": list(set(current_user.get("auth_methods", []) + ["discord"])),
                "linked_accounts.discord": {
                    "linked_at": pend.now(tz=pend.UTC).to_iso8601_string(),
                    "discord_user_id": user.id,
                    "username": user.username,
                    "email": user.email
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
            await mongo.app_discord_tokens.update_one(
                {"user_id": user_id, "device_id": device_id, "device_name": device_name},
                {
                    "$set": {
                        "discord_access_token": encrypted_discord_access,
                        "discord_refresh_token": encrypted_discord_refresh,
                        "expires_at": pend.now(tz=pend.UTC).add(seconds=int(expires_in))
                    }
                },
                upsert=True
            )

        return {"detail": "Discord account successfully linked"}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/link-discord",
                                              "user_id": user.id if 'user_id' in locals() else "unknown"})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/link-email", name="Link Email to an existing Discord account")
@linkd.ext.fastapi.inject
@check_authentication
async def link_email_account(
        req: EmailRegisterRequest,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient
):
    try:
        # Validate input
        try:
            PasswordValidator.validate_email(str(req.email))
            PasswordValidator.validate_password(req.password)
            PasswordValidator.validate_username(req.username)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Validation error in email linking for user {user_id}: {e.detail}",
                                       level="warning")
            raise e

        current_user = await mongo.app_users.find_one({"user_id": user_id})
        if not current_user:
            sentry_sdk.capture_message(f"User not found for email linking: {user_id}", level="warning")
            raise HTTPException(status_code=404, detail="User not found")

        # Check for email conflicts using hash
        email_hash = hash_email(str(req.email))
        email_conflict = await mongo.app_users.find_one({"email_hash": email_hash})
        if email_conflict and email_conflict["user_id"] != user_id:
            sentry_sdk.capture_message(
                f"Email {safe_email_log(str(req.email))} already linked to user {email_conflict['user_id']}, attempted by {user_id}",
                level="warning")
            raise HTTPException(status_code=400, detail="Email already linked to another account")

        # Prepare encrypted email data
        email_data = await prepare_email_for_storage(str(req.email))

        await mongo.app_users.update_one(
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
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/link-email", "user_id": user_id,
                                              "email": safe_email_log(str(req.email))})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/forgot-password", name="Request password reset")
@linkd.ext.fastapi.inject
async def forgot_password(req: ForgotPasswordRequest, *, mongo: MongoClient):
    try:
        # Validate email format
        try:
            PasswordValidator.validate_email(str(req.email))
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid email format in forgot password: {safe_email_log(str(req.email))}",
                                       level="warning")
            raise e

        # Check if user exists with this email
        email_hash = hash_email(str(req.email))
        user = await mongo.app_users.find_one({"email_hash": email_hash})

        if not user or "email" not in user.get("auth_methods", []):
            # Return success regardless to prevent email enumeration
            return {
                "message": "If an account with this email exists, you will receive a password reset link shortly."
            }

        # Check for existing unused reset token
        current_time = pend.now(tz=pend.UTC)
        existing_reset = await mongo.app_password_reset_tokens.find_one({
            "email_hash": email_hash,
            "used": False,
            "expires_at": {"$gt": current_time}
        })

        if existing_reset:
            # Clean up old token and create new one
            await mongo.app_password_reset_tokens.delete_one({"_id": existing_reset["_id"]})

        # Generate 6-digit password reset code
        reset_code = generate_verification_code()

        # Store password reset code
        expires_at = pend.now(tz=pend.UTC).add(hours=1)
        created_at = pend.now(tz=pend.UTC)

        try:
            reset_record = {
                "user_id": user["user_id"],
                "email_hash": email_hash,
                "reset_code": reset_code,
                "expires_at": expires_at,
                "created_at": created_at,
                "used": False
            }

            result = await mongo.app_password_reset_tokens.insert_one(reset_record)
            reset_record["_id"] = result.inserted_id  # Store the generated _id for cleanup
        except Exception as e:
            sentry_sdk.capture_exception(e,
                                         tags={"function": "password_reset_token_insert", "user_id": user["user_id"]})
            raise HTTPException(status_code=500, detail="Failed to create password reset request")

        # Decrypt email for sending
        try:
            decrypted_email = await decrypt_data(user["email_encrypted"])
            if not decrypted_email:
                raise ValueError("Decrypted email is empty")
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "decrypt_email_for_password_reset",
                                                  "user_id": user["user_id"]})
            # Clean up reset token if decryption fails
            await mongo.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            raise HTTPException(status_code=500, detail="Failed to process password reset request")

        # Send password reset email with code
        try:
            username = user.get("username", "User")
            await send_password_reset_email_with_code(decrypted_email, username, reset_code)
        except Exception as e:
            # Clean up reset token if email fails
            await mongo.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            sentry_sdk.capture_exception(e,
                                         tags={"endpoint": "/auth/forgot-password", "email": safe_email_log(str(req.email)),
                                               "decrypted_email": safe_email_log(decrypted_email)})
            raise HTTPException(status_code=500, detail="Failed to send password reset email")

        return {
            "message": "If an account with this email exists, you will receive a password reset code shortly."
        }

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/forgot-password", "email": safe_email_log(str(req.email))})
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/auth/reset-password", response_model=AuthResponse, name="Reset password with token")
@linkd.ext.fastapi.inject
async def reset_password(req: ResetPasswordRequest, *, mongo: MongoClient):
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
        email_hash = hash_email(str(req.email))
        reset_record = await mongo.app_password_reset_tokens.find_one({
            "email_hash": email_hash,
            "reset_code": req.reset_code,
            "used": False
        })

        if not reset_record:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        # Check if code has expired
        expires_at = reset_record["expires_at"]
        if isinstance(expires_at, str):
            expires_at = pend.parse(expires_at)

        # Ensure both datetimes have timezone info for comparison
        current_time = pend.now(tz=pend.UTC)
        if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
            # expires_at is naive, make it UTC aware
            expires_at = pend.instance(expires_at, tz='UTC')
        elif not hasattr(expires_at, 'tzinfo'):
            # Handle case where expires_at might be a different type
            expires_at = pend.parse(str(expires_at)).in_timezone('UTC')

        if current_time > expires_at:
            # Clean up expired code
            await mongo.app_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

        # Get user
        user = await mongo.app_users.find_one({"user_id": reset_record["user_id"]})
        if not user:
            sentry_sdk.capture_message(f"User not found for password reset: {reset_record['user_id']}", level="error")
            raise HTTPException(status_code=400, detail="Invalid reset code")

        # Update password
        new_password_hash = hash_password(req.new_password)
        await mongo.app_users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password": new_password_hash}}
        )

        # Mark reset code as used
        await mongo.app_password_reset_tokens.update_one(
            {"_id": reset_record["_id"]},
            {"$set": {"used": True}}
        )

        # Generate new auth tokens
        access_token = generate_jwt(str(user["user_id"]), req.device_id)
        refresh_token = generate_refresh_token(str(user["user_id"]))

        # Store refresh token
        try:
            user_id = str(user["user_id"])

            await mongo.app_refresh_tokens.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "refresh_token": refresh_token,
                        "expires_at": pend.now().add(days=30)
                    }
                },
                upsert=True
            )
        except Exception as e:
            sentry_sdk.capture_exception(e, tags={"function": "refresh_token_storage_password_reset",
                                                  "user_id": str(user["user_id"])})
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