from pydantic import BaseModel


class CocAccountRequest(BaseModel):
    coc_tag: str
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
