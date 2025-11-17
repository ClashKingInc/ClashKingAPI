from pydantic import BaseModel
from typing import Optional, List


class LogConfig(BaseModel):
    """Configuration for a single log type"""
    enabled: bool
    channel: Optional[str] = None
    thread: Optional[str] = None
    webhook: Optional[str] = None
    include_buttons: Optional[bool] = None
    ping_role: Optional[str] = None
    clans: Optional[List[str]] = None


class ServerLogsConfig(BaseModel):
    """Complete logs configuration for a server"""
    join_leave_log: Optional[LogConfig] = None
    donation_log: Optional[LogConfig] = None
    clan_achievement_log: Optional[LogConfig] = None
    clan_requirements_log: Optional[LogConfig] = None
    clan_description_log: Optional[LogConfig] = None
    war_log: Optional[LogConfig] = None
    war_panel: Optional[LogConfig] = None
    cwl_lineup_change_log: Optional[LogConfig] = None
    capital_donation_log: Optional[LogConfig] = None
    capital_raid_log: Optional[LogConfig] = None
    raid_panel: Optional[LogConfig] = None
    capital_weekly_summary: Optional[LogConfig] = None
    player_upgrade_log: Optional[LogConfig] = None
    legend_log: Optional[LogConfig] = None
    ban_log: Optional[LogConfig] = None
    strike_log: Optional[LogConfig] = None


class ChannelInfo(BaseModel):
    """Discord channel information"""
    id: str
    name: str
    type: str
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None


class ThreadInfo(BaseModel):
    """Discord thread information"""
    id: str
    name: str
    parent_channel_id: str
    parent_channel_name: Optional[str] = None
    archived: bool = False


class ClanLogTypeConfig(BaseModel):
    """Configuration for a single log type for a specific clan"""
    webhook: Optional[str] = None
    channel: Optional[str] = None
    thread: Optional[str] = None


class ClanLogsConfig(BaseModel):
    """All logs configuration for a single clan"""
    tag: str
    name: str
    join_log: Optional[ClanLogTypeConfig] = None
    leave_log: Optional[ClanLogTypeConfig] = None
    donation_log: Optional[ClanLogTypeConfig] = None
    clan_achievement_log: Optional[ClanLogTypeConfig] = None
    clan_requirements_log: Optional[ClanLogTypeConfig] = None
    clan_description_log: Optional[ClanLogTypeConfig] = None
    war_log: Optional[ClanLogTypeConfig] = None
    war_panel: Optional[ClanLogTypeConfig] = None
    cwl_lineup_change_log: Optional[ClanLogTypeConfig] = None
    capital_donations: Optional[ClanLogTypeConfig] = None
    capital_attacks: Optional[ClanLogTypeConfig] = None
    raid_panel: Optional[ClanLogTypeConfig] = None
    capital_weekly_summary: Optional[ClanLogTypeConfig] = None
    role_change: Optional[ClanLogTypeConfig] = None
    troop_upgrade: Optional[ClanLogTypeConfig] = None
    super_troop_boost_log: Optional[ClanLogTypeConfig] = None
    th_upgrade: Optional[ClanLogTypeConfig] = None
    league_change: Optional[ClanLogTypeConfig] = None
    spell_upgrade: Optional[ClanLogTypeConfig] = None
    hero_upgrade: Optional[ClanLogTypeConfig] = None
    hero_equipment_upgrade: Optional[ClanLogTypeConfig] = None
    name_change: Optional[ClanLogTypeConfig] = None
    legend_log_attacks: Optional[ClanLogTypeConfig] = None
    legend_log_defenses: Optional[ClanLogTypeConfig] = None


class UpdateClanLogRequest(BaseModel):
    """Request to update logs for a specific clan"""
    channel_id: Optional[str | int] = None
    thread_id: Optional[str | int] = None
    log_types: List[str]
