from pydantic import BaseModel
from typing import Optional, List


class ReminderConfig(BaseModel):
    """Configuration for a single reminder"""
    id: str
    type: str  # "War", "Clan Capital", "Clan Games", "Inactivity", "roster"
    clan_tag: Optional[str] = None
    channel_id: Optional[str] = None
    time: str
    custom_text: Optional[str] = None
    townhall_filter: Optional[List[int]] = None
    roles: Optional[List[str]] = None

    # War-specific
    war_types: Optional[List[str]] = None  # ["Random", "Friendly", "CWL"]

    # Clan Games-specific
    point_threshold: Optional[int] = None

    # Capital-specific
    attack_threshold: Optional[int] = None

    # Roster-specific
    roster_id: Optional[str] = None
    ping_type: Optional[str] = None


class ServerRemindersResponse(BaseModel):
    """All reminders for a server grouped by type"""
    war_reminders: List[ReminderConfig] = []
    capital_reminders: List[ReminderConfig] = []
    clan_games_reminders: List[ReminderConfig] = []
    inactivity_reminders: List[ReminderConfig] = []
    roster_reminders: List[ReminderConfig] = []


class CreateReminderRequest(BaseModel):
    """Request to create a new reminder"""
    type: str
    clan_tag: Optional[str] = None
    channel_id: str
    time: str
    custom_text: Optional[str] = None
    townhall_filter: Optional[List[int]] = None
    roles: Optional[List[str]] = None
    war_types: Optional[List[str]] = None
    point_threshold: Optional[int] = None
    attack_threshold: Optional[int] = None
    roster_id: Optional[str] = None
    ping_type: Optional[str] = None


class UpdateReminderRequest(BaseModel):
    """Request to update a reminder"""
    channel_id: Optional[str] = None
    time: Optional[str] = None
    custom_text: Optional[str] = None
    townhall_filter: Optional[List[int]] = None
    roles: Optional[List[str]] = None
    war_types: Optional[List[str]] = None
    point_threshold: Optional[int] = None
    attack_threshold: Optional[int] = None
    ping_type: Optional[str] = None
