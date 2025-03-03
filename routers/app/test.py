# import os
#
# import httpx
# import jwt
# import requests
# import pendulum as pend
# from dotenv import load_dotenv
# from fastapi import Depends, HTTPException, Request, APIRouter
# from fastapi.security import OAuth2PasswordBearer
# from pydantic import BaseModel
# from utils.utils import db_client
# from passlib.context import CryptContext
# from cryptography.fernet import Fernet
#
# ############################
# # Load environment variables
# ############################
# load_dotenv()
#
# ############################
# # Global configuration
# ############################
# SECRET_KEY = os.getenv('SECRET_KEY')
# REFRESH_SECRET = os.getenv('REFRESH_SECRET')
# DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
# DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
# DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')
# ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
#
# # Fernet cipher for encryption/decryption
# cipher = Fernet(ENCRYPTION_KEY)
#
# # Password hashing configuration
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
#
# # OAuth2 scheme
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
#
# # FastAPI router
# router = APIRouter(tags=["Authentication"], include_in_schema=True)
#
# ############################
# # Data models
# ############################
# class Token(BaseModel):
#     access_token: str
#     refresh_token: str
#
# ############################
# # Utility functions
# ############################
#
# # Encrypt data (string) using Fernet
# async def encrypt_data(data: str) -> str:
#     return cipher.encrypt(data.encode()).decode()
#
# # Decrypt data (string) using Fernet
# async def decrypt_data(data: str) -> str:
#     return cipher.decrypt(data.encode()).decode()
#
# # Hash a password using bcrypt
# def hash_password(password: str) -> str:
#     return pwd_context.hash(password)
#
# # Verify a plaintext password against a hashed one
# def verify_password(plain_password: str, hashed_password: str) -> bool:
#     return pwd_context.verify(plain_password, hashed_password)
#
# # Generate a short-lived JWT (1 hour)
# def generate_jwt(user_id: str, user_type: str):
#     payload = {
#         "sub": user_id,
#         "type": user_type,
#         "exp": pend.now().add(hours=1).int_timestamp
#     }
#     return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
#
# # Generate a long-lived refresh token (90 days)
# def generate_refresh_token(user_id: str, device_id: str):
#     payload = {
#         "sub": user_id,
#         "device": device_id,
#         "exp": pend.now().add(days=90).int_timestamp
#     }
#     return jwt.encode(payload, REFRESH_SECRET, algorithm="HS256")
#
# async def get_valid_discord_access_token(user_id: str) -> str:
#     discord_token = await db_client.app_discord_tokens.find_one({"user_id": user_id})
#     if not discord_token:
#         raise HTTPException(status_code=401, detail="Missing Discord refresh token")
#
#     refresh_token = await decrypt_data(discord_token["discord_refresh_token"])
#
#     # Générer un nouveau access_token
#     new_token_data = await refresh_discord_access_token(refresh_token)
#     return new_token_data["access_token"]
#
#
# ############################
# # JWT blacklist management
# ############################
# jwt_blacklist = set()
#
# def add_to_blacklist(token: str):
#     jwt_blacklist.add(token)
#
# def is_blacklisted(token: str) -> bool:
#     return token in jwt_blacklist
#
# ############################
# # Retrieve current user and validate token
# ############################
# async def get_current_user(token: str):
#     if not token:
#         raise HTTPException(status_code=401, detail="Missing authentication token")
#
#     current_user = await db_client.app_clashking_tokens.find_one({"access_token": token})
#     if not current_user:
#         raise HTTPException(status_code=404, detail="User not found")
#
#     if current_user.get("account_type") == "discord":
#         discord_access = await get_valid_discord_access_token(current_user["user_id"])
#
#         async with httpx.AsyncClient() as client:
#             response = await client.get(
#                 "https://discord.com/api/users/@me",
#                 headers={"Authorization": f"Bearer {discord_access}"}
#             )
#
#         if response.status_code == 200:
#             discord_data = response.json()
#             return {
#                 "user_id": current_user["user_id"],
#                 "discord_username": discord_data["username"],
#                 "avatar_url": f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png"
#             }
#
#         raise HTTPException(status_code=500, detail="Error retrieving Discord profile")
#
#     return current_user
#
# ############################
# # Device ID validation
# ############################
# async def validate_device_id(request: Request, user_id: str):
#     """
#     Check whether the X-Device-ID header is provided and belongs to an existing
#     session for the given user_id.
#     """
#     device_header = request.headers.get("X-Device-ID")
#     if not device_header:
#         raise HTTPException(status_code=400, detail="Missing X-Device-ID header")
#
#     sessions = await db_client.app_tokens.find({"user_id": user_id}).to_list(None)
#     device_ids = [session.get("device_id") for session in sessions]
#     if device_header not in device_ids:
#         raise HTTPException(status_code=403, detail="Invalid or unknown device ID")
#
# ############################
# # Endpoints
# ############################
#
# # 2) Link Discord account to a ClashKing user
# @router.post("/auth/link-discord")
# async def link_discord_account(request: Request):
#     """
#     This endpoint links a Discord account to a ClashKing user by storing
#     the Discord ID in the user's record (encrypted if necessary).
#     """
#     form = await request.form()
#     user_id = form.get("user_id")
#     discord_id = form.get("discord_id")
#     if not user_id or not discord_id:
#         raise HTTPException(status_code=400, detail="Missing user_id or discord_id")
#
#     user = await db_client.app_users.find_one({"user_id": user_id})
#     if not user:
#         raise HTTPException(status_code=404, detail="ClashKing user not found")
#
#     encrypted_discord_id = await encrypt_data(discord_id)
#
#     await db_client.app_users.update_one(
#         {"user_id": user_id},
#         {"$set": {"discord_id": encrypted_discord_id}}
#     )
#     return {"message": "Discord account linked successfully"}
#
# # 3) Authenticate ClashKing user
# @router.post("/auth/clashking", response_model=Token)
# async def auth_clashking(email: str, password: str, request: Request):
#     """
#     This endpoint authenticates a user with ClashKing credentials (email/password).
#     If the user doesn't exist, a new account is created. Otherwise, the password
#     is verified. Access and refresh tokens are returned.
#     """
#     device_id = request.headers.get("X-Device-ID", "unknown")
#
#     encrypted_email = await encrypt_data(email)
#     user = await db_client.app_users.find_one({"email": encrypted_email})
#
#     if not user:
#         # Create a new user
#         hashed_pw = hash_password(password)
#         new_user = {
#             "user_id": str(pend.now().int_timestamp),
#             "email": encrypted_email,
#             "password": hashed_pw,
#             "account_type": "clashking",
#             "created_at": pend.now()
#         }
#         await db_client.app_users.insert_one(new_user)
#         user = new_user
#     else:
#         # Verify the provided password
#         if not verify_password(password, user["password"]):
#             raise HTTPException(status_code=403, detail="Invalid credentials")
#
#     access_token = generate_jwt(user["user_id"], "clashking")
#     refresh_token = generate_refresh_token(user["user_id"], device_id)
#
#     # Encrypt the refresh token before storing in DB
#     encrypted_refresh = await encrypt_data(refresh_token)
#
#     await db_client.app_tokens.insert_one({
#         "user_id": user["user_id"],
#         "refresh_token": encrypted_refresh,
#         "device_id": device_id,
#         "expires_at": pend.now().add(days=90)
#     })
#
#     return {
#         "access_token": access_token,
#         "refresh_token": await encrypt_data(refresh_token)
#     }
#
# @router.post("/auth/discord", response_model=Token)
# async def auth_discord(request: Request):
#     form = await request.form()
#     code = form.get("code")
#     code_verifier = form.get("code_verifier")
#     device_id = request.headers.get("X-Device-ID", "unknown")
#
#     if not code or not code_verifier:
#         raise HTTPException(status_code=400, detail="Missing Discord code or code_verifier")
#
#     token_url = "https://discord.com/api/oauth2/token"
#     token_data = {
#         "client_id": DISCORD_CLIENT_ID,
#         "code": code,
#         "grant_type": "authorization_code",
#         "redirect_uri": DISCORD_REDIRECT_URI,
#         "code_verifier": code_verifier
#     }
#
#     async with httpx.AsyncClient() as client:
#         token_response = await client.post(token_url, data=token_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
#
#     if token_response.status_code != 200:
#         raise HTTPException(status_code=500, detail="Error during Discord authentication")
#
#     discord_data = token_response.json()
#     refresh_token_discord = discord_data.get("refresh_token")
#
#     user_response = await client.get(
#         "https://discord.com/api/users/@me",
#         headers={"Authorization": f"Bearer {discord_data['access_token']}"}
#     )
#
#     if user_response.status_code != 200:
#         raise HTTPException(status_code=500, detail="Error retrieving user info")
#
#     user_data = user_response.json()
#     discord_user_id = user_data["id"]
#
#     existing_user = await db_client.app_users.find_one({"user_id": discord_user_id})
#     if not existing_user:
#         await db_client.app_users.insert_one({"user_id": discord_user_id, "created_at": pend.now()})
#
#     encrypted_discord_refresh = await encrypt_data(refresh_token_discord) if refresh_token_discord else None
#
#     await db_client.app_discord_tokens.replace_one(
#         {"user_id": discord_user_id, "device_id": device_id},
#         {
#             "user_id": discord_user_id,
#             "device_id": device_id,
#             "discord_refresh_token": encrypted_discord_refresh
#         },
#         upsert=True  # Insert if not found
#     )
#
#     access_token = generate_refresh_token(discord_user_id, device_id)
#     encrypted_token = await encrypt_data(access_token)
#
#     await db_client.app_clashking_tokens.insert_one({
#         "user_id": discord_user_id,
#         "account_type": "discord",
#         "access_token": encrypted_token,
#         "device_id": device_id,
#         "expires_at": pend.now().add(days=180)
#     })
#
#     return {"access_token": access_token}
#
#
# # 5) Refresh token: generate a new access token
# @router.post("/refresh-token", response_model=Token)
# async def refresh_token(token: str, request: Request):
#     """
#     This endpoint receives an existing refresh token (encrypted in the DB),
#     validates it, checks device_id, and issues a new access/refresh token pair.
#     """
#     print("token", token)
#     # Decrypt the user-provided token to compare with the DB
#     stored_token = await db_client.app_tokens.find_one({"refresh_token": await encrypt_data(token)})
#
#     if not stored_token:
#         raise HTTPException(status_code=403, detail="Invalid token")
#
#     try:
#         payload = jwt.decode(token, REFRESH_SECRET, algorithms=["HS256"])
#         print("payload", payload)
#         user_id = payload.get("sub")
#         device_id = payload.get("device")
#
#         # Validate the device_id from the request
#         await validate_device_id(request, user_id)
#
#         new_access_token = generate_jwt(user_id, "clashking")
#         new_refresh_token = generate_refresh_token(user_id, device_id)
#         encrypted_new = await encrypt_data(new_refresh_token)
#
#         # Update the stored token in the DB
#         await db_client.app_tokens.update_one(
#             {"refresh_token": stored_token["refresh_token"]},
#             {"$set": {
#                 "refresh_token": encrypted_new,
#                 "expires_at": pend.now().add(days=90)
#             }}
#         )
#
#         return {
#             "access_token": new_access_token,
#             "refresh_token": await encrypt_data(new_refresh_token)
#         }
#
#     except jwt.ExpiredSignatureError:
#         raise HTTPException(status_code=403, detail="Refresh token expired")
#     except jwt.exceptions.PyJWTError:
#         raise HTTPException(status_code=403, detail="Invalid token")
#
# # 6) Get current user info
# @router.get("/users/me")
# async def read_users_me(current_user=Depends(get_current_user)):
#     """
#     Returns the current user's information:
#     - For ClashKing users: Returns decrypted email.
#     - For Discord users: Fetches username & avatar from the Discord API.
#     """
#     user_data = {
#         "user_id": current_user["user_id"],
#         "account_type": current_user.get("account_type", "unknown"),
#         "created_at": current_user.get("created_at"),
#     }
#
#     # If the user is a ClashKing account, return the decrypted email
#     if current_user["account_type"] == "clashking":
#         decrypted_email = None
#         if "email" in current_user:
#             try:
#                 decrypted_email = await decrypt_data(current_user["email"])
#             except:
#                 decrypted_email = "(error decrypting email)"
#         user_data["email"] = decrypted_email
#
#     # If the user is a Discord account, fetch their username and avatar
#     elif current_user["account_type"] == "discord":
#         try:
#             # Decrypt the stored Discord access token
#             discord_access = await decrypt_data(current_user["discord_access_token"])
#
#             # Call Discord API to get user information
#             response = requests.get(
#                 "https://discord.com/api/users/@me",
#                 headers={"Authorization": f"Bearer {discord_access}"}
#             )
#
#             if response.status_code == 200:
#                 discord_data = response.json()
#                 user_data["discord_username"] = discord_data["username"]
#                 user_data["avatar_url"] = f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png"
#             else:
#                 raise HTTPException(status_code=500, detail="Error from Discord API")
#
#         except Exception as e:
#             raise HTTPException(status_code=500, detail=f"Failed to fetch Discord profile: {str(e)}")
#
#     return user_data
#
# # 7) Get all user sessions
# @router.get("/users/sessions")
# async def get_sessions(current_user=Depends(get_current_user)):
#     """
#     This endpoint fetches all active sessions (refresh tokens) associated
#     with the current user.
#     """
#     user_id = current_user["user_id"]
#     sessions = await db_client.app_tokens.find({"user_id": user_id}).to_list(None)
#     return [
#         {
#             "device_id": s.get("device_id"),
#             "expires_at": s.get("expires_at")
#         } for s in sessions
#     ]
#
# # 8) Logout (invalidate one session)
# @router.post("/logout")
# async def logout(token: str):
#     """
#     This endpoint invalidates (removes) a refresh token from the DB,
#     effectively logging out of one session. Optionally, you can also
#     blacklist the associated access token if you need immediate invalidation.
#     """
#     encrypted_token = await encrypt_data(token)
#     result = await db_client.app_tokens.delete_one({"refresh_token": encrypted_token})
#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="No session found for given token")
#
#     # Optionally add the token to the blacklist
#     # add_to_blacklist(token)
#
#     return {"message": "Successfully logged out"}
#
# @router.get("/discord/me")
# async def get_discord_profile(current_user=Depends(get_current_user)):
#     user_id = current_user["user_id"]
#
#     # Retrieve the stored Discord tokens
#     user_record = await db_client.app_users.find_one({"user_id": user_id})
#     if not user_record or "discord_access_token" not in user_record:
#         raise HTTPException(status_code=404, detail="No Discord token found")
#
#     # Decrypt the access token
#     discord_access_token = await decrypt_data(user_record["discord_access_token"])
#
#     # 1) Tenter d'appeler l'API Discord
#     response = requests.get(
#         "https://discord.com/api/users/@me",
#         headers={"Authorization": f"Bearer {discord_access_token}"}
#     )
#
#     # 2) Si le token Discord est expiré (401), on tente un refresh
#     if response.status_code == 401:
#         if "discord_refresh_token" not in user_record or not user_record["discord_refresh_token"]:
#             raise HTTPException(status_code=401, detail="No Discord refresh token stored")
#
#         # On tente de rafraîchir le token
#         try:
#             new_discord_data = refresh_discord_access_token(user_record["discord_refresh_token"])
#         except Exception as e:
#             raise HTTPException(status_code=500, detail=f"Error refreshing Discord token: {e}")
#
#         # On met à jour la base avec les nouveaux tokens
#         new_access = new_discord_data["access_token"]
#         new_refresh = new_discord_data.get("refresh_token")  # peut être None
#         new_expires_in = new_discord_data.get("expires_in")
#
#         encrypted_discord_access = await encrypt_data(new_access)
#         encrypted_discord_refresh = await encrypt_data(new_refresh) if new_refresh else None
#
#         await db_client.app_users.update_one(
#             {"user_id": user_id},
#             {
#                 "$set": {
#                     "discord_access_token": encrypted_discord_access,
#                     "discord_refresh_token": encrypted_discord_refresh,
#                     "discord_expires_in": new_expires_in,
#                     "updated_at": pend.now()
#                 }
#             }
#         )
#
#         # On refait l'appel à Discord avec le nouveau token
#         response = requests.get(
#             "https://discord.com/api/users/@me",
#             headers={"Authorization": f"Bearer {new_access}"}
#         )
#
#     if response.status_code != 200:
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error from Discord: {response.json()}"
#         )
#
#     return response.json()
#
# async def refresh_discord_access_token(encrypted_refresh_token: str) -> dict:
#     """
#     Refreshes the Discord access token using the stored refresh token.
#     """
#     try:
#         refresh_token = await decrypt_data(encrypted_refresh_token)
#         token_data = {
#             "client_id": DISCORD_CLIENT_ID,
#             "client_secret": DISCORD_CLIENT_SECRET,
#             "grant_type": "refresh_token",
#             "refresh_token": refresh_token
#         }
#         headers = {"Content-Type": "application/x-www-form-urlencoded"}
#         token_response = requests.post("https://discord.com/api/oauth2/token", data=token_data, headers=headers)
#
#         if token_response.status_code == 200:
#             return token_response.json()
#         else:
#             raise HTTPException(
#                 status_code=401,
#                 detail=f"Failed to refresh Discord token: {token_response.json()}"
#             )
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error refreshing Discord token: {str(e)}")
