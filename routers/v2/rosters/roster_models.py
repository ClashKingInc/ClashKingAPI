from typing import List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class CreateRosterModel(BaseModel):
    clan_tag: Optional[str] = Field(
        None, description='Clan tag (required for clan type, optional for family type)'
    )
    roster_type: Literal['clan', 'family'] = Field('clan', description='Organization: clan-specific or family-wide')
    signup_scope: Literal['clan-only', 'family-wide'] = Field('clan-only', description='Who can signup: clan members only or entire family')
    alias: str = Field(..., max_length=64)


class RosterUpdateModel(BaseModel):
    model_config = ConfigDict(extra='forbid')  # reject unknown fields

    # Only fields allowed to change here (members handled by other endpoints)
    alias: Optional[str] = Field(None, max_length=64)

    clan_tag: Optional[str] = None
    min_th: Optional[int] = Field(None, ge=1, le=17, description="Minimum town hall level")
    max_th: Optional[int] = Field(None, ge=1, le=17, description="Maximum town hall level")
    description: Optional[str] = None
    roster_type: Optional[Literal['clan', 'family']] = None
    signup_scope: Optional[Literal['clan-only', 'family-wide']] = None
    max_accounts_per_user: Optional[int] = None
    event_start_time: Optional[int] = None
    signup_close_time: Optional[int] = None

    allowed_signup_categories: Optional[List[str]] = Field(
        None,
        description='List of roster_signup_categories.custom_id allowed for this roster',
    )
    group_id: Optional[str] = None  # Move roster to different group

    # Display and UI configuration
    roster_size: Optional[int] = None
    columns: Optional[List[str]] = None
    missing_text: Optional[str] = None
    image: Optional[str] = None
    sort: Optional[list] = None



class TemplateUpdateModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

    alias: Optional[str] = Field(None, max_length=64)
    server_id: Optional[int] = None
    clan_tag: Optional[str] = None
    min_th: Optional[int] = Field(None, ge=1, le=17, description="Minimum town hall level")
    max_th: Optional[int] = Field(None, ge=1, le=17, description="Maximum town hall level")
    th_restriction: Optional[str] = Field(None, description="Legacy TH restriction format (will be overridden by min_th/max_th)")
    active: Optional[bool] = None
    frequency: Optional[Literal['weekly', 'monthly', 'cwl_season']] = None

    # Template timing fields
    event_time: Optional[int] = Field(
        None, description='Actual event timestamp'
    )

    # Event system for templates
    event_type: Optional[
        Literal['cwl', 'clan-games', 'raids', 'rush', 'tournament']
    ] = None
    custom_event: Optional[str] = None

    # All roster fields (for complete template → roster generation)
    description: Optional[str] = None
    roster_type: Optional[Literal['clan', 'family']] = None
    max_accounts_per_user: Optional[int] = None


class RosterMemberModel(BaseModel):
    # Core fields matching Discord bot structure exactly
    name: str = Field(..., description='Player name')
    tag: str = Field(..., description='Player tag with or without leading #')
    hero_lvs: int = Field(..., description='Sum of hero levels')
    townhall: int = Field(..., description='Town Hall level')
    discord: str = Field(..., description="Discord user mention or 'No User'")
    current_clan: str = Field(..., description='Current clan name')
    current_clan_tag: str = Field(..., description='Current clan tag')
    war_pref: bool = Field(..., description='War opt in/out preference')
    trophies: int = Field(..., description='Current trophies')
    sub: bool = Field(False, description='Is this player a substitute')
    signup_group: Optional[str] = Field(
        None, description='Reference to roster_signup_categories.custom_id'
    )

    # Enhanced fields per requirements
    hitrate: Optional[float] = Field(
        None, description='Hit rate percentage (last 30 days)'
    )
    last_online: Optional[int] = Field(
        None, description='Last online timestamp'
    )
    current_league: Optional[str] = Field(
        None, description='Current league name'
    )
    added_at: Optional[int] = Field(
        None, description='When player was added to roster (timestamp)'
    )

    # Data tracking fields
    last_updated: Optional[int] = Field(
        None, description='Last refresh timestamp'
    )
    member_status: str = Field(
        'active', description='Member data status: active, api_error'
    )
    error_details: Optional[str] = Field(
        None, description='Error message if API error'
    )


class AddMembersByTagModel(BaseModel):
    """Simplified model - just provide tags and discord IDs, API fetches all data"""

    class MemberTag(BaseModel):
        tag: str = Field(
            ..., description='Player tag with or without leading #'
        )
        signup_group: Optional[str] = Field(
            default=None,
            description='Reference to roster_signup_categories.custom_id',
        )

    members: list[MemberTag] = Field(
        ..., description='List of member tags to add'
    )


class UpdateMemberModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

    sub: Optional[bool] = None
    signup_group: Optional[str] = Field(
        None, description='Reference to roster_signup_categories.custom_id'
    )


class TemplateFiltersModel(BaseModel):
    server_id: Optional[int] = None
    clan_tag: Optional[str] = None
    active: Optional[bool] = None
    frequency: Optional[Literal['weekly', 'monthly', 'cwl_season']] = None
    limit: Optional[int] = Field(50, le=100)
    offset: Optional[int] = Field(0, ge=0)


class EventMissingMembersModel(BaseModel):
    """Filter model for finding missing members across all rosters of a specific event type"""

    server_id: int = Field(..., description='Discord server ID')
    event_type: Literal[
        'cwl', 'clan-games', 'raids', 'rush', 'tournament'
    ] = Field(..., description='Event type to check')
    current_instance_only: bool = Field(
        True,
        description="Only check current event instance (e.g. current month's CWL)",
    )


# ======================== ROSTER GROUPS ========================


class CreateRosterGroupModel(BaseModel):
    """Model for creating a new roster group"""

    alias: str = Field(
        ..., max_length=64, description='Changeable group name/alias'
    )

class UpdateRosterGroupModel(BaseModel):
    """Model for updating roster group settings"""

    model_config = ConfigDict(extra='forbid')

    alias: Optional[str] = Field(None, max_length=64)
    max_accounts_per_user: Optional[int] = None
    auto_signup_publish: Optional[bool] = None
    auto_registration_close: Optional[bool] = None
    auto_result_publish: Optional[bool] = None


# ======================== ROSTER PLACEMENTS ========================


class CreateRosterSignupCategoryModel(BaseModel):
    """Model for creating roster signup category categories"""

    server_id: Union[int, str] = Field(..., description='Discord server ID')
    custom_id: Optional[str] = Field(None, description='Custom signup category ID (auto-generated if not provided)')
    alias: str = Field(
        ..., max_length=32, description='Display name for signup category'
    )


class UpdateRosterSignupCategoryModel(BaseModel):
    """Model for updating roster signup category"""

    model_config = ConfigDict(extra='forbid')

    alias: Optional[str] = Field(None, max_length=32)


# ======================== ROSTER AUTOMATION ========================


class CreateRosterAutomationModel(BaseModel):
    """Model for creating roster automation rules"""

    server_id: int = Field(..., description='Discord server ID')
    roster_id: Optional[str] = Field(
        None, description='Specific roster ID (optional)'
    )
    group_id: Optional[str] = Field(
        None, description='Roster group ID (optional)'
    )

    action_type: Literal[
        'roster_delete',
        'roster_clear',
        'roster_post',
        'roster_signup',
        'roster_signup_close',
        'roster_archive',
        'roster_ping',
    ] = Field(..., description='Type of automation action')

    scheduled_time: int = Field(
        ..., description='When to execute the action (timestamp)'
    )
    discord_channel_id: Optional[str] = Field(
        None, description='Discord channel for posting/pinging'
    )

    # Action-specific options
    options: Optional[dict] = Field(
        default={}, description='Action-specific configuration'
    )


class UpdateRosterAutomationModel(BaseModel):
    """Model for updating roster automation rules"""

    model_config = ConfigDict(extra='forbid')

    scheduled_time: Optional[int] = None
    discord_channel_id: Optional[str] = None
    options: Optional[dict] = None
    active: Optional[bool] = None


# ======================== ENHANCED ROSTER MODELS ========================


class RosterCloneModel(BaseModel):
    """Model for cloning rosters - options only, roster_id and server_id come from URL"""

    new_alias: Optional[str] = Field(
        None,
        description='New alias for cloned roster (auto-generated if not provided)',
    )
    copy_members: bool = Field(
        False, description='Whether to copy members to new roster'
    )
    group_id: Optional[str] = Field(
        None, description='Group to add cloned roster to (same-server only)'
    )


class RosterMemberBulkOperationModel(BaseModel):
    """Model for bulk member add/remove operations"""

    add: Optional[List[AddMembersByTagModel.MemberTag]] = Field(
        default_factory=list, description='Members to add'
    )
    remove: Optional[List[str]] = Field(
        default_factory=list, description='Player tags to remove'
    )


# ======================== RESPONSE MODELS ========================


class RosterWithStatsResponse(BaseModel):
    """Enhanced roster response with computed stats"""

    # All existing roster fields would be here
    roster: dict
    member_stats: Optional[dict] = Field(
        None, description='Computed member statistics'
    )
    group_info: Optional[dict] = Field(
        None, description='Associated group information'
    )
