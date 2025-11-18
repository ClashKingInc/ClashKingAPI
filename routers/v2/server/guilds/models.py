from pydantic import BaseModel
from typing import List, Optional


class GuildInfo(BaseModel):
    id: str
    name: str
    icon: Optional[str]
    owner: bool
    permissions: str
    role: str
    features: List[str]
    has_bot: bool
    member_count: Optional[int] = None


class GuildDetails(BaseModel):
    id: str
    name: str
    icon: Optional[str]
    owner_id: Optional[str]
    features: List[str]
    member_count: Optional[int]
    description: Optional[str]
    banner: Optional[str]
    premium_tier: Optional[int]
    boost_count: Optional[int]
