from pydantic import BaseModel, Field
from typing import Optional, List


class LinkParseSettings(BaseModel):
    """Link parsing configuration"""
    clan: Optional[bool] = None
    army: Optional[bool] = None
    player: Optional[bool] = None
    base: Optional[bool] = None
    show: Optional[bool] = None


class ServerSettingsUpdate(BaseModel):
    """
    Update server settings. All fields are optional.
    Only provided fields will be updated.
    """
    # Embed & Display
    embed_color: Optional[int] = Field(None, description="Embed color as integer (hex)")

    # Nickname Settings
    nickname_rule: Optional[str] = Field(None, description="Family member nickname convention")
    non_family_nickname_rule: Optional[str] = Field(None, description="Non-family nickname convention")
    change_nickname: Optional[bool] = Field(None, description="Enable/disable nickname changes")
    flair_non_family: Optional[bool] = Field(None, description="Enable/disable non-family flair")
    auto_eval_nickname: Optional[bool] = Field(None, description="Enable/disable auto-eval for nicknames")

    # Auto-Eval Configuration
    autoeval_triggers: Optional[List[str]] = Field(None, description="List of auto-eval triggers")
    autoeval_log: Optional[int] = Field(None, description="Auto-eval log channel ID")
    autoeval: Optional[bool] = Field(None, description="Enable/disable auto-eval")

    # Role Management
    blacklisted_roles: Optional[List[int]] = Field(None, description="List of blacklisted role IDs")
    role_treatment: Optional[List[str]] = Field(None, description="Role treatment types")
    full_whitelist_role: Optional[int] = Field(None, description="Full whitelist role ID")

    # General Settings
    leadership_eval: Optional[bool] = Field(None, description="Enable/disable leadership eval")
    autoboard_limit: Optional[int] = Field(None, description="Autoboard limit")
    api_token: Optional[bool] = Field(None, description="Enable/disable API token")
    tied: Optional[bool] = Field(None, description="Enable/disable tied stats")

    # Channels
    banlist: Optional[int] = Field(None, description="Banlist channel ID")
    strike_log: Optional[int] = Field(None, description="Strike log channel ID")
    reddit_feed: Optional[int] = Field(None, description="Reddit feed channel ID")

    # Text & Labels
    family_label: Optional[str] = Field(None, description="Family label text")
    greeting: Optional[str] = Field(None, description="Server welcome message")

    # Link Parse Settings
    link_parse: Optional[LinkParseSettings] = Field(None, description="Link parsing configuration")


class ServerSettingsResponse(BaseModel):
    """Response after updating server settings"""
    message: str
    server_id: int
    updated_fields: int
