from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Dict, Any


# Enum for role types
RoleType = Literal[
    "townhall",
    "league",
    "builderhall",
    "builder_league",
    "achievement",
    "status",
    "family_position"
]


class TownhallRoleCreate(BaseModel):
    """Create a townhall role"""
    role: int = Field(..., description="Discord role ID")
    th: int = Field(..., description="Townhall level", ge=1, le=17)


class LeagueRoleCreate(BaseModel):
    """Create a league role"""
    role: int = Field(..., description="Discord role ID")
    type: str = Field(..., description="League type (e.g., 'Legend League', 'Titan League I')")


class BuilderHallRoleCreate(BaseModel):
    """Create a builder hall role"""
    role: int = Field(..., description="Discord role ID")
    bh: int = Field(..., description="Builder hall level", ge=1, le=10)


class BuilderLeagueRoleCreate(BaseModel):
    """Create a builder league role"""
    role: int = Field(..., description="Discord role ID")
    type: str = Field(..., description="Builder league type")


class AchievementRoleCreate(BaseModel):
    """Create an achievement role"""
    id: int = Field(..., description="Discord role ID")
    type: str = Field(..., description="Achievement type")
    season: str = Field(..., description="Season (e.g., '2024-01')")
    amount: int = Field(..., description="Amount required")


class StatusRoleCreate(BaseModel):
    """Create a status role (Discord tenure)"""
    id: int = Field(..., description="Discord role ID")
    months: int = Field(..., description="Months in server required")


class FamilyPositionRoleCreate(BaseModel):
    """Create a family position role"""
    role: int = Field(..., description="Discord role ID")
    type: Literal["family_elder_roles", "family_co-leader_roles", "family_leader_roles"] = Field(
        ..., description="Position type"
    )


class RoleResponse(BaseModel):
    """Response for role operations"""
    message: str
    server_id: int
    role_type: str
    role_id: Optional[int] = None


class RolesListResponse(BaseModel):
    """Response listing roles"""
    server_id: int
    role_type: str
    roles: List[Dict[str, Any]]
    count: int


class DiscordRole(BaseModel):
    """Discord role information"""
    id: str
    name: str
    color: int
    position: int
    managed: bool
    mentionable: bool


class DiscordRolesResponse(BaseModel):
    """Response for Discord roles list"""
    server_id: int
    roles: List[DiscordRole]
    count: int


class RoleSettingsResponse(BaseModel):
    """Response for role settings"""
    server_id: int
    auto_eval_status: Optional[bool] = None
    auto_eval_nickname: Optional[bool] = None
    autoeval_triggers: Optional[List[str]] = None
    autoeval_log: Optional[int] = None
    blacklisted_roles: Optional[List[int]] = None
    role_treatment: Optional[List[str]] = None
    category_roles: Optional[dict] = None


class RoleSettingsUpdate(BaseModel):
    """Update role settings"""
    auto_eval_status: Optional[bool] = Field(None, description="Enable/disable auto-eval", alias="autoeval")
    auto_eval_nickname: Optional[bool] = Field(None, description="Enable/disable auto-eval for nicknames")
    autoeval_triggers: Optional[List[str]] = Field(None, description="List of auto-eval triggers")
    autoeval_log: Optional[int] = Field(None, description="Auto-eval log channel ID")
    blacklisted_roles: Optional[List[int]] = Field(None, description="List of blacklisted role IDs")
    role_treatment: Optional[List[str]] = Field(None, description="Role treatment types")

    class Config:
        populate_by_name = True


class AllRolesResponse(BaseModel):
    """Response for all roles"""
    server_id: int
    roles: Dict[str, List[Dict[str, Any]]]
    total_count: int
