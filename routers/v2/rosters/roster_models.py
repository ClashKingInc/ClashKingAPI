from typing import Optional, Literal, Union
from pydantic import Field, BaseModel, ConfigDict


class CreateRosterModel(BaseModel):
    clan_tag: str = Field(..., description="Clan tag with or without leading #")
    alias: str = Field(..., max_length=64)

    th_restriction: str = Field(..., description='e.g. "1-max" or "15-17"')

    description: Optional[str] = None

    recurrent: bool = Field(False)
    frequency: Optional[Literal["weekly", "monthly"]] = None

    # Template timing configuration (for recurrent=True)
    event_start_time: Optional[int] = Field(None, description="Actual event time start (war start, etc.)")

    signup_publish_time: Optional[int] = Field(None, description="When to open roster signups (timestamp)")
    registration_close_time: Optional[int] = Field(None, description="When to close registrations (timestamp)")
    result_publish_time: Optional[int] = Field(None, description="When to publish results (timestamp)")

    max_accounts_per_user: Optional[int] = Field(None,
                                                 description="Maximum accounts per Discord user (None = unlimited)")


class RosterUpdateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")  # reject unknown fields

    # Only fields allowed to change here (members handled by other endpoints)
    alias: Optional[str] = Field(None, max_length=64)

    clan_tag: Optional[str] = None
    th_restriction: Optional[str] = None
    description: Optional[str] = None
    roster_type: Optional[Literal["clan", "family"]] = None
    max_accounts_per_user: Optional[int] = None
    event_start_time: Optional[int] = None

    recurrent: bool = Field(False)
    frequency: Optional[Literal["weekly", "monthly"]] = None

    # Phase timing
    signup_publish_time: Optional[int] = None
    registration_close_time: Optional[int] = None
    result_publish_time: Optional[int] = None

    # Auto-phase control
    auto_signup_publish: Optional[bool] = None
    auto_registration_close: Optional[bool] = None
    auto_result_publish: Optional[bool] = None


class TemplateUpdateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: Optional[str] = Field(None, max_length=64)
    server_id: Optional[int] = None
    clan_tag: Optional[str] = None
    th_restriction: Optional[str] = None
    active: Optional[bool] = None
    frequency: Optional[Literal["weekly", "monthly", "cwl_season"]] = None

    # Template timing fields
    event_time: Optional[int] = Field(None, description="Actual event timestamp")
    signup_publish_time: Optional[int] = Field(None, description="When to open roster signups (timestamp)")
    registration_close_time: Optional[int] = Field(None, description="When to close registrations (timestamp)")
    result_publish_time: Optional[int] = Field(None, description="When to publish results (timestamp)")

    # Auto-phase control
    auto_signup_publish: Optional[bool] = None
    auto_registration_close: Optional[bool] = None
    auto_result_publish: Optional[bool] = None

    # Event system for templates
    event_type: Optional[Literal["cwl", "clan-games", "raids", "rush", "tournament"]] = None
    custom_event: Optional[str] = None

    # All roster fields (for complete template → roster generation)
    description: Optional[str] = None
    roster_type: Optional[Literal["clan", "family"]] = None
    max_accounts_per_user: Optional[int] = None


class RosterMemberModel(BaseModel):
    # Core fields matching Discord bot structure exactly
    name: str = Field(..., description="Player name")
    tag: str = Field(..., description="Player tag with or without leading #")
    hero_lvs: int = Field(..., description="Sum of hero levels")
    townhall: int = Field(..., description="Town Hall level")
    discord: str = Field(..., description="Discord user mention or 'No User'")
    current_clan: str = Field(..., description="Current clan name")
    current_clan_tag: str = Field(..., description="Current clan tag")
    war_pref: bool = Field(..., description="War opt in/out preference")
    trophies: int = Field(..., description="Current trophies")
    sub: bool = Field(False, description="Is this player a substitute")
    group: str = Field("No Group", description="Player group/category")

    # Data tracking fields
    last_updated: Optional[int] = Field(None, description="Last refresh timestamp")
    member_status: str = Field("active", description="Member data status: active, api_error")
    error_details: Optional[str] = Field(None, description="Error message if API error")


class AddMembersByTagModel(BaseModel):
    """Simplified model - just provide tags and discord IDs, API fetches all data"""

    class MemberTag(BaseModel):
        tag: str = Field(..., description="Player tag with or without leading #")
        group: str = Field(default=None, description="Player group/category")

    members: list[MemberTag] = Field(..., description="List of member tags to add")


class UpdateMemberModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sub: Optional[bool] = None
    group: Optional[str] = None





class TemplateFiltersModel(BaseModel):
    server_id: Optional[int] = None
    clan_tag: Optional[str] = None
    active: Optional[bool] = None
    frequency: Optional[Literal["weekly", "monthly", "cwl_season"]] = None
    limit: Optional[int] = Field(50, le=100)
    offset: Optional[int] = Field(0, ge=0)


class ImportRosterModel(BaseModel):
    import_code: str = Field(..., description="5-character import code from export")
    server_id: int = Field(..., description="Target server ID for imported roster")


class EventMissingMembersModel(BaseModel):
    """Filter model for finding missing members across all rosters of a specific event type"""
    server_id: int = Field(..., description="Discord server ID")
    event_type: Literal["cwl", "clan-games", "raids", "rush", "tournament"] = Field(...,
                                                                                    description="Event type to check")
    current_instance_only: bool = Field(True,
                                        description="Only check current event instance (e.g. current month's CWL)")