import asyncio
import hikari
import linkd
import logging
import pendulum as pend
import sentry_sdk

from fastapi import Header, HTTPException, Request, APIRouter, Depends
from routers.v2.auth.utils import (
    decode_jwt, decode_refresh_token,
    encrypt_data, verify_password,
    hash_password, hash_email, prepare_email_for_storage, decrypt_data,
    generate_verification_code, safe_email_log, validate_expires_at,
    store_refresh_token, create_auth_response, generate_refresh_token,
    validate_verification_record, handle_existing_user_email_verification,
    create_new_user_from_verification,
    generate_jwt, create_password_reset_token, send_password_reset_with_cleanup,
    exchange_discord_code_for_token, test_discord_token, store_discord_tokens,
    upsert_discord_user, find_user_by_id, get_user_info_from_discord,
    find_verification_with_code,
    DEFAULT_AVATAR_URL, INTERNAL_SERVER_ERROR, USER_NOT_FOUND
)

logger = logging.getLogger(__name__)
from utils.email_service import send_verification_email
from utils.security import check_authentication
from utils.config import Config
from utils.database import MongoClient
from utils.password_validator import PasswordValidator
from routers.v2.auth.models import (
    AuthResponse, UserInfo, RefreshTokenRequest,
    EmailRegisterRequest, EmailAuthRequest,
    ForgotPasswordRequest, ResetPasswordRequest
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()
config = Config()
router = APIRouter(prefix="/v2/auth", tags=["App Authentication"], include_in_schema=True)

@router.post("/verify-email-code", name="Verify email address with 6-digit code")
@linkd.ext.fastapi.inject
async def verify_email_with_code(
        request: Request,
        *,
        mongo: MongoClient
) -> AuthResponse:
    """Verify email address with 6-digit code and create user account.

    Args:
        request: FastAPI request object
        mongo: MongoDB client instance

    Returns:
        AuthResponse: Authentication tokens and user info

    Raises:
        HTTPException: 400 for invalid/missing code, 401 for expired code, 500 for internal errors
    """
    email = None
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

        # Find pending verification (handles backwards compatibility)
        email_hash = hash_email(email)
        pending_verification = await find_verification_with_code(email_hash, code, mongo)

        if not pending_verification:
            raise HTTPException(status_code=401, detail="Invalid verification code")

        # Validate expiration
        try:
            expires_at = validate_expires_at(pending_verification["expires_at"])
        except (KeyError, ValueError) as e:
            error_msg = "Invalid verification record format" if isinstance(e, KeyError) else f"Invalid datetime format: {e}"
            raise HTTPException(status_code=500, detail=error_msg)

        if pend.now(tz=pend.UTC) > expires_at:
            await mongo.auth_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=401, detail="Verification code expired. Please request a new one.")

        # Validate record and get user data
        user_data = await validate_verification_record(pending_verification, email)

        # Create or update user
        existing_user = await mongo.users.find_one({"email_hash": email_hash})
        if existing_user:
            user_id = await handle_existing_user_email_verification(existing_user, user_data, mongo)
        else:
            user_id = await create_new_user_from_verification(user_data, mongo)

        # Clean up verification
        await mongo.auth_email_verifications.delete_one({"_id": pending_verification["_id"]})

        # Generate auth response
        auth_response_data = create_auth_response(
            user_id=str(user_id),
            username=user_data["username"],
            device_id=user_data["device_id"]
        )

        await store_refresh_token(str(user_id), auth_response_data["refresh_token"], mongo)
        return AuthResponse(**auth_response_data)

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={
            "endpoint": "/auth/verify-email-code",
            "email": safe_email_log(email) if email else "unknown"
        })
        sentry_sdk.capture_message(f"Verify email code error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.get("/me", name="Get current user information")
@linkd.ext.fastapi.inject
@check_authentication
async def get_current_user_info(
        _user_id: str = None,
        _credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        _rest: hikari.RESTApp
) -> UserInfo:
    """Get current authenticated user's information.

    Args:
        _user_id: Authenticated user ID (injected by @check_authentication)
        _credentials: HTTP Bearer credentials (required for auth)
        mongo: MongoDB client instance
        _rest: Hikari REST client

    Returns:
        UserInfo: User information including username and avatar

    Raises:
        HTTPException: 404 if user not found
    """
    try:
        # Find user (try both string and int formats)
        current_user = await find_user_by_id(_user_id, mongo)
        if not current_user:
            sentry_sdk.capture_message(
                f"User not found in /auth/me for user_id: {_user_id} (type: {type(_user_id)})",
                level="warning"
            )
            raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

        # Get initial username and avatar
        username = current_user.get("username")
        avatar_url = current_user.get("avatar_url") or DEFAULT_AVATAR_URL

        # Fallback to decrypted email for username if needed
        if not username and current_user.get("email_encrypted"):
            try:
                username = await decrypt_data(current_user["email_encrypted"])
            except Exception as e:
                sentry_sdk.capture_exception(e, tags={"function": "decrypt_email_in_auth_me", "user_id": _user_id})

        # Override with Discord info if available
        if "discord" in current_user.get("auth_methods", []):
            discord_username, discord_avatar = await get_user_info_from_discord(
                current_user["user_id"], _rest, mongo
            )
            username = discord_username or username
            avatar_url = discord_avatar or avatar_url

        return UserInfo(
            user_id=str(current_user["user_id"]),
            username=username,
            avatar_url=avatar_url
        )
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/me", "user_id": _user_id})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/discord", name="Authenticate with Discord")
@linkd.ext.fastapi.inject
async def auth_discord(request: Request, *, mongo: MongoClient, rest: hikari.RESTApp) -> AuthResponse:
    """Authenticate user via Discord OAuth2.

    Args:
        request: FastAPI request object
        mongo: MongoDB client instance
        rest: Hikari REST client

    Returns:
        AuthResponse: Authentication tokens and user info

    Raises:
        HTTPException: 400 if missing Discord code, 500 for internal errors
    """
    try:
        # Parse request data (JSON or form)
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)

        # Extract and validate parameters
        code = data.get("code")
        code_verifier = data.get("code_verifier")
        device_id = data.get("device_id")
        device_name = data.get("device_name")
        redirect_uri = data.get("redirect_uri") or config.discord_redirect_uri

        if not code or not code_verifier:
            sentry_sdk.capture_message(f"Missing Discord auth parameters: code={bool(code)}", level="warning")
            raise HTTPException(status_code=400, detail="Missing Discord code")

        # Exchange code for token
        auth = await exchange_discord_code_for_token(code, code_verifier, redirect_uri, rest)

        # Test token validity
        await test_discord_token(auth.access_token, rest)

        # Fetch Discord user info
        async with rest.acquire(token=auth.access_token, token_type=hikari.TokenType.BEARER) as client:
            user = await client.fetch_my_user()

        # Create or update user in database
        user_id = await upsert_discord_user(user, mongo)

        # Store Discord tokens
        await store_discord_tokens(user_id, device_id, device_name, auth, mongo)

        # Generate auth response
        auth_response_data = create_auth_response(
            user_id=str(user_id),
            username=user.username,
            device_id=device_id,
            avatar_url=str(user.make_avatar_url()) if user.avatar_hash else str(user.make_default_avatar_url())
        )

        await store_refresh_token(str(user_id), auth_response_data["refresh_token"], mongo)
        return AuthResponse(**auth_response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Discord auth error: {str(e)}", exc_info=True)
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/discord"})
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")



@router.post("/refresh", name="Refresh the access token")
@linkd.ext.fastapi.inject
async def refresh_access_token(request: RefreshTokenRequest, *, mongo: MongoClient) -> dict:
    """Refresh access token using a valid refresh token.

    Args:
        request: Refresh token request with token and device_id
        mongo: MongoDB client instance

    Returns:
        dict: New access token

    Raises:
        HTTPException: 401 for invalid/expired refresh token, 500 for internal errors
    """
    try:
        # First validate the refresh token JWT signature
        try:
            decoded_refresh = decode_refresh_token(request.refresh_token)
            user_id_from_token = decoded_refresh["sub"]
        except Exception as e:
            sentry_sdk.capture_message(f"Invalid refresh token signature: {str(e)}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token signature.")

        # Atomically consume the refresh token — prevents concurrent reuse
        # Note: JWT expiry is already validated by decode_refresh_token() above,
        # so no need to re-check expires_at on the DB document.
        new_refresh_token = generate_refresh_token(str(user_id_from_token))
        stored_refresh_token = await mongo.auth_refresh_tokens.find_one_and_update(
            {"refresh_token": request.refresh_token},
            {"$set": {
                "refresh_token": new_refresh_token,
                "expires_at": pend.now(tz=pend.UTC).add(days=30),
            }},
        )

        if not stored_refresh_token:
            sentry_sdk.capture_message(f"Refresh token not found in database for user: {user_id_from_token}",
                                       level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        user_id = stored_refresh_token["user_id"]

        # Verify user_id matches (ensure both are strings for comparison)
        if str(user_id) != str(user_id_from_token):
            sentry_sdk.capture_message(
                f"User ID mismatch in refresh token: stored={user_id}, token={user_id_from_token}", level="warning")
            raise HTTPException(status_code=401, detail="Invalid refresh token.")

        new_access_token = generate_jwt(str(user_id), request.device_id)

        return {"access_token": new_access_token, "refresh_token": new_refresh_token}
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/refresh"})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/register", name="Register with email (sends verification email)")
@linkd.ext.fastapi.inject
async def register_email_user(req: EmailRegisterRequest, *, mongo: MongoClient) -> dict:
    """Register a new user with email and send verification code.

    Args:
        req: Email registration request with email, password, username, device info
        mongo: MongoDB client instance

    Returns:
        dict: Success message and verification code (local dev only)

    Raises:
        HTTPException: 400 for validation errors or duplicate email, 409 for pending verification, 500 for internal errors
    """
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
        existing_user = await mongo.users.find_one({"email_hash": email_hash})

        if existing_user and "email" in existing_user.get("auth_methods", []):
            # Email already registered for email auth
            raise HTTPException(status_code=400, detail="Email already registered. Please try logging in instead.")

        # Check if there's already a pending verification for this email
        existing_verification = await mongo.auth_email_verifications.find_one({"email_hash": email_hash})
        if existing_verification:
            # Check if it's expired
            expires_at = validate_expires_at(existing_verification["expires_at"])

            if pend.now(tz=pend.UTC) > expires_at:
                # Clean up expired verification and allow new registration
                await mongo.auth_email_verifications.delete_one({"_id": existing_verification["_id"]})
            else:
                # Still valid - suggest resending instead of registering again
                raise HTTPException(
                    status_code=409,
                    detail="A verification email was already sent to this address. Please check your email or request a resend."
                )

        # Prepare email encryption and user data
        email_data = prepare_email_for_storage(req.email)

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
        await mongo.auth_email_verifications.delete_many({"email_hash": email_hash})

        # Insert new pending verification
        await mongo.auth_email_verifications.insert_one(pending_verification)

        # Send verification email
        try:
            await send_verification_email(str(req.email), req.username, verification_code)
        except Exception as e:
            # Clean up pending verification if email fails
            await mongo.auth_email_verifications.delete_one({"_id": pending_verification["_id"]})
            sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": safe_email_log(req.email)})
            raise HTTPException(status_code=500, detail="Failed to send verification email")

        return {
            "message": "Verification email sent. Please check your email and enter the 6-digit code.",
            "verification_code": verification_code if config.is_local else None  # Only show in local dev
        }

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/register", "email": safe_email_log(req.email)})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/resend-verification", name="Resend verification email")
@linkd.ext.fastapi.inject
async def resend_verification_email(request: Request, *, mongo: MongoClient) -> dict:
    """Resend verification email with new code.

    Args:
        request: FastAPI request object
        mongo: MongoDB client instance

    Returns:
        dict: Success message and verification code (local dev only)

    Raises:
        HTTPException: 400 for invalid email, 404 if no pending verification, 410 if expired, 500 for internal errors
    """
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
        pending_verification = await mongo.auth_email_verifications.find_one({"email_hash": email_hash})

        if not pending_verification:
            # Check if user already exists with this email
            existing_user = await mongo.users.find_one({"email_hash": email_hash})
            if existing_user and "email" in existing_user.get("auth_methods", []):
                raise HTTPException(status_code=400,
                                    detail="This email is already verified. Please try logging in instead.")
            else:
                raise HTTPException(status_code=404,
                                    detail="No pending verification found for this email. Please register first.")

        # Check if verification has expired
        expires_at = validate_expires_at(pending_verification["expires_at"])

        if pend.now(tz=pend.UTC) > expires_at:
            await mongo.auth_email_verifications.delete_one({"_id": pending_verification["_id"]})
            raise HTTPException(status_code=410, detail="Verification expired. Please register again.")

        # Generate new verification code
        verification_code = generate_verification_code()

        # Update the pending verification with new code
        await mongo.auth_email_verifications.update_one(
            {"_id": pending_verification["_id"]},
            {"$set": {
                "verification_code": verification_code,
                "created_at": pend.now(tz=pend.UTC),
                "expires_at": pend.now(tz=pend.UTC).add(minutes=15)  # Reset expiration for new code
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
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/email")
@linkd.ext.fastapi.inject
async def login_with_email(req: EmailAuthRequest, *, mongo: MongoClient) -> AuthResponse:
    """Authenticate user with email and password.

    Args:
        req: Email auth request with email, password, device info
        mongo: MongoDB client instance

    Returns:
        AuthResponse: Authentication tokens and user info

    Raises:
        HTTPException: 401 for invalid credentials, 409 for unverified email, 500 for internal errors
    """
    try:
        # Add small delay to prevent timing attacks
        await asyncio.sleep(0.1)

        # Look up user by email hash
        email_hash = hash_email(req.email)
        user = await mongo.users.find_one({"email_hash": email_hash})

        if not user:
            # Check if email exists but is not verified yet
            pending_verification = await mongo.auth_email_verifications.find_one({"email_hash": email_hash})

            if pending_verification:
                # Email exists but is not verified
                sentry_sdk.capture_message(f"Login attempt for unverified email: {safe_email_log(req.email)}",
                                           level="warning")
                raise HTTPException(status_code=409,
                                    detail="Email not verified. Please check your email and enter the verification code.")
            else:
                # Email doesn't exist at all
                sentry_sdk.capture_message(f"Failed email login attempt for: {safe_email_log(req.email)}",
                                           level="warning")
                raise HTTPException(status_code=401, detail="Invalid email or password")

        if not verify_password(req.password, user.get("password", "")):
            sentry_sdk.capture_message(f"Failed password verification for: {safe_email_log(req.email)}",
                                       level="warning")
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Validate user record structure
        if not user.get("user_id"):
            sentry_sdk.capture_message(f"User record missing user_id for: {safe_email_log(req.email)}",
                                       level="error")
            raise HTTPException(status_code=500, detail="Invalid user record")

        if not user.get("username"):
            sentry_sdk.capture_message(f"User record missing username for: {safe_email_log(req.email)}",
                                       level="warning")
            # Set a fallback username
            user["username"] = safe_email_log(req.email)

        # Generate auth tokens and response
        auth_response_data = create_auth_response(
            user_id=str(user["user_id"]),
            username=user["username"],
            device_id=req.device_id,
            avatar_url=user.get("avatar_url", DEFAULT_AVATAR_URL)
        )

        # Store refresh token
        await store_refresh_token(str(user["user_id"]), auth_response_data["refresh_token"], mongo)

        return AuthResponse(**auth_response_data)
    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/email",
                                              "email": safe_email_log(req.email) if hasattr(req,
                                                                                            'email') else "unknown"})
        sentry_sdk.capture_message(f"Email login error: {str(e)}", level="error")
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/link-discord", name="Link Discord to an existing account")
@linkd.ext.fastapi.inject
async def link_discord_account(
        request: Request,
        authorization: str = Header(None),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """Link Discord account to an existing email-based account.

    Args:
        request: FastAPI request object
        authorization: Bearer token in Authorization header
        mongo: MongoDB client instance
        rest: Hikari REST client

    Returns:
        dict: Success message

    Raises:
        HTTPException: 400 for missing/invalid token or already linked, 401 for unauthorized, 404 if user not found
    """
    user_id = None  # Initialize to avoid reference before assignment
    try:
        if not authorization or not authorization.startswith("Bearer "):
            sentry_sdk.capture_message("Missing or invalid authorization header in /auth/link-discord", level="warning")
            raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

        token = authorization.split("Bearer ")[1]
        decoded_token = decode_jwt(token)
        user_id = decoded_token["sub"]

        current_user = await mongo.users.find_one({"user_id": user_id})
        if not current_user:
            sentry_sdk.capture_message(f"User not found for Discord linking: {user_id}", level="warning")
            raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

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
        conflict_user = await mongo.users.find_one({"linked_accounts.discord.discord_user_id": user.id})
        if conflict_user and conflict_user["user_id"] != user_id:
            sentry_sdk.capture_message(
                f"Discord account {user.id} already linked to user {conflict_user['user_id']}, attempted by {user_id}",
                level="warning")
            raise HTTPException(status_code=400, detail="Discord account already linked to another user")

        await mongo.users.update_one(
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
            await mongo.auth_discord_tokens.update_one(
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
                                              "user_id": user_id if user_id else "unknown"})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/link-email", name="Link Email to an existing Discord account")
@linkd.ext.fastapi.inject
@check_authentication
async def link_email_account(
        req: EmailRegisterRequest,
        _user_id: str = None,
        _credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient
):
    """Link email authentication to an existing Discord account.

    Args:
        req: Email registration request with email, password, username
        _user_id: Authenticated user ID (injected by @check_authentication)
        _credentials: HTTP Bearer credentials (required for auth)
        mongo: MongoDB client instance

    Returns:
        dict: Success message

    Raises:
        HTTPException: 400 for validation errors or email already linked, 404 if user not found
    """
    try:
        # Validate input
        try:
            PasswordValidator.validate_email(req.email)
            PasswordValidator.validate_password(req.password)
            PasswordValidator.validate_username(req.username)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Validation error in email linking for user {_user_id}: {e.detail}",
                                       level="warning")
            raise e

        current_user = await mongo.users.find_one({"user_id": _user_id})
        if not current_user:
            sentry_sdk.capture_message(f"User not found for email linking: {_user_id}", level="warning")
            raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

        # Check for email conflicts using hash
        email_hash = hash_email(req.email)
        email_conflict = await mongo.users.find_one({"email_hash": email_hash})
        if email_conflict and email_conflict["user_id"] != _user_id:
            sentry_sdk.capture_message(
                f"Email {safe_email_log(req.email)} already linked to user {email_conflict['user_id']}, attempted by {_user_id}",
                level="warning")
            raise HTTPException(status_code=400, detail="Email already linked to another account")

        # Prepare encrypted email data
        email_data = prepare_email_for_storage(req.email)

        await mongo.users.update_one(
            {"user_id": _user_id},
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
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/link-email", "user_id": _user_id,
                                              "email": safe_email_log(req.email)})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/forgot-password", name="Request password reset")
@linkd.ext.fastapi.inject
async def forgot_password(req: ForgotPasswordRequest, *, mongo: MongoClient):
    """Request a password reset code via email.

    Args:
        req: ForgotPasswordRequest containing email address
        mongo: MongoDB client instance

    Returns:
        Dict with message confirming reset code was sent (or would be sent)

    Raises:
        HTTPException: 400 if email validation fails
        HTTPException: 500 if server error occurs
    """
    try:
        # Validate email format
        try:
            PasswordValidator.validate_email(req.email)
        except HTTPException as e:
            sentry_sdk.capture_message(f"Invalid email format in forgot password: {safe_email_log(req.email)}",
                                       level="warning")
            raise e

        # Check if user exists with this email
        email_hash = hash_email(req.email)
        user = await mongo.users.find_one({"email_hash": email_hash})

        if not user or "email" not in user.get("auth_methods", []):
            # Return success regardless to prevent email enumeration
            return {
                "message": "If an account with this email exists, you will receive a password reset link shortly."
            }

        # Create reset token (with cleanup of old tokens)
        reset_record = await create_password_reset_token(user, email_hash, mongo)

        # Send email (with cleanup on failure)
        await send_password_reset_with_cleanup(user, reset_record, reset_record["reset_code"], mongo)

        return {
            "message": "If an account with this email exists, you will receive a password reset code shortly."
        }

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/forgot-password", "email": safe_email_log(req.email)})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)


@router.post("/reset-password", response_model=AuthResponse, name="Reset password with token")
@linkd.ext.fastapi.inject
async def reset_password(req: ResetPasswordRequest, *, mongo: MongoClient):
    """Reset password using verification code and set new password.

    Args:
        req: Reset password request with email, reset code, new password, device info
        mongo: MongoDB client instance

    Returns:
        AuthResponse: Authentication tokens and user info

    Raises:
        HTTPException: 400 for invalid code/password or expired code, 500 for internal errors
    """
    try:
        # Validate new password
        try:
            PasswordValidator.validate_password(req.new_password)
        except HTTPException as e:
            sentry_sdk.capture_message("Invalid password format in reset password", level="warning")
            raise e

        # Validate code format
        if not req.reset_code.isdigit() or len(req.reset_code) != 6:
            raise HTTPException(status_code=400, detail="Invalid reset code format")

        # Find and validate reset code
        email_hash = hash_email(req.email)
        reset_record = await mongo.auth_password_reset_tokens.find_one({
            "email_hash": email_hash,
            "reset_code": req.reset_code,
            "used": False
        })

        if not reset_record:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        # Check if code has expired
        expires_at = validate_expires_at(reset_record["expires_at"])

        if pend.now(tz=pend.UTC) > expires_at:
            # Clean up expired code
            await mongo.auth_password_reset_tokens.delete_one({"_id": reset_record["_id"]})
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

        # Get user
        user = await mongo.users.find_one({"user_id": reset_record["user_id"]})
        if not user:
            sentry_sdk.capture_message(f"User not found for password reset: {reset_record['user_id']}", level="error")
            raise HTTPException(status_code=400, detail="Invalid reset code")

        # Update password
        new_password_hash = hash_password(req.new_password)
        await mongo.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"password": new_password_hash}}
        )

        # Mark reset code as used
        await mongo.auth_password_reset_tokens.update_one(
            {"_id": reset_record["_id"]},
            {"$set": {"used": True}}
        )

        # Generate auth tokens and response
        auth_response_data = create_auth_response(
            user_id=str(user["user_id"]),
            username=user["username"],
            device_id=req.device_id,
            avatar_url=user.get("avatar_url", DEFAULT_AVATAR_URL)
        )

        # Store refresh token
        await store_refresh_token(str(user["user_id"]), auth_response_data["refresh_token"], mongo)

        return AuthResponse(**auth_response_data)

    except HTTPException:
        raise
    except Exception as e:
        sentry_sdk.capture_exception(e, tags={"endpoint": "/auth/reset-password"})
        raise HTTPException(status_code=500, detail=INTERNAL_SERVER_ERROR)