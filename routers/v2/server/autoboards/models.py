from pydantic import BaseModel
from typing import Optional, List


class AutoBoardConfig(BaseModel):
    """Configuration for a single autoboard"""
    id: str
    type: str  # "post" or "refresh"
    board_type: str  # e.g., "clandetailed", "familyoverview", "legendclan"
    button_id: str  # The custom_id from the original board button
    webhook_id: str
    thread_id: Optional[str] = None
    channel_id: Optional[str] = None
    days: Optional[List[str]] = None  # For auto-post: ["monday", "friday", etc]
    locale: Optional[str] = "en-US"
    created_at: Optional[str] = None


class ServerAutoBoardsResponse(BaseModel):
    """All autoboards for a server"""
    autoboards: List[AutoBoardConfig] = []
    total: int = 0
    post_count: int = 0
    refresh_count: int = 0
    limit: int = 0


class CreateAutoBoardRequest(BaseModel):
    """Request to create a new autoboard"""
    type: str  # "post" or "refresh"
    board_type: str
    button_id: str
    webhook_id: str
    thread_id: Optional[str] = None
    channel_id: Optional[str] = None
    days: Optional[List[str]] = None
    locale: Optional[str] = "en-US"


class UpdateAutoBoardRequest(BaseModel):
    """Request to update an autoboard"""
    type: Optional[str] = None
    days: Optional[List[str]] = None
    webhook_id: Optional[str] = None
    thread_id: Optional[str] = None