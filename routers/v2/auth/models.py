from pydantic import BaseModel, EmailStr


class CocAccountRequest(BaseModel):
    player_tag: str
    player_token: str = None

class UserInfo(BaseModel):
    user_id: str
    username: str
    avatar_url: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserInfo

class RefreshTokenRequest(BaseModel):
    refresh_token: str
    device_id: str

class EmailAuthRequest(BaseModel):
    email: EmailStr
    password: str
    device_id: str
    device_name: str

class EmailRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    username: str
    device_id: str
    device_name: str
