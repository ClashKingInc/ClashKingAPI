from pydantic import BaseModel
from typing import Optional, List


class LinkedAccount(BaseModel):
    """A single linked CoC account"""
    player_tag: str
    player_name: Optional[str] = None
    town_hall: Optional[int] = None
    is_verified: bool = False
    added_at: Optional[str] = None


class MemberLinks(BaseModel):
    """Discord member with their linked accounts"""
    user_id: str
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    linked_accounts: List[LinkedAccount] = []
    account_count: int = 0


class ServerLinksResponse(BaseModel):
    """All member links for a server"""
    members: List[MemberLinks] = []
    total_members: int = 0
    members_with_links: int = 0
    total_linked_accounts: int = 0
    verified_accounts: int = 0


class BulkUnlinkRequest(BaseModel):
    """Request to unlink accounts from a member"""
    user_id: str
    player_tags: List[str]