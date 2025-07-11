from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from routers.v2.auth.utils import decode_jwt
from utils.utils import db_client

security = HTTPBearer()

async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract and validate user ID from JWT token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    try:
        decoded_token = decode_jwt(credentials.credentials)
        user_id = decoded_token["sub"]
        
        # Verify user still exists - try both string and int formats
        user = await db_client.app_users.find_one({"user_id": user_id})
        if not user:
            # Try as integer if string lookup failed
            try:
                user_id_int = int(user_id)
                user = await db_client.app_users.find_one({"user_id": user_id_int})
            except (ValueError, TypeError):
                pass
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return str(user_id)  # Always return as string for consistency
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid authentication token: " + str(e))

async def get_current_user(user_id: str = Depends(get_current_user_id)) -> dict:
    """Get full user object from validated user ID."""
    # Try both string and int formats for user_id lookup
    user = await db_client.app_users.find_one({"user_id": user_id})
    if not user:
        try:
            user_id_int = int(user_id)
            user = await db_client.app_users.find_one({"user_id": user_id_int})
        except (ValueError, TypeError):
            pass
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_auth_methods(*required_methods: str):
    """Decorator to require specific authentication methods."""
    async def check_auth_methods(user: dict = Depends(get_current_user)) -> dict:
        user_auth_methods = set(user.get("auth_methods", []))
        required_set = set(required_methods)
        
        if not required_set.intersection(user_auth_methods):
            raise HTTPException(
                status_code=403, 
                detail=f"This endpoint requires one of: {', '.join(required_methods)}"
            )
        return user
    
    return check_auth_methods