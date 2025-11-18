from pydantic import BaseModel, Field
from typing import Optional, List


class PlayerLeaderboardEntry(BaseModel):
    """Single player entry in a leaderboard"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    trophies: Optional[int] = None
    global_rank: Optional[int] = None
    local_rank: Optional[int] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    legend_trophies: Optional[int] = None


class ClanLeaderboardEntry(BaseModel):
    """Single clan entry in a leaderboard"""
    clan_tag: str
    clan_name: str
    clan_level: Optional[int] = None
    clan_points: Optional[int] = None
    member_count: Optional[int] = None
    global_rank: Optional[int] = None
    local_rank: Optional[int] = None
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    capital_points: Optional[int] = None


class ServerLeaderboardResponse(BaseModel):
    """Response for server-wide leaderboards"""
    server_id: int
    total_players: int = 0
    total_clans: int = 0
    players: List[PlayerLeaderboardEntry] = Field(default_factory=list)
    clans: List[ClanLeaderboardEntry] = Field(default_factory=list)


class WarPerformanceEntry(BaseModel):
    """Player war performance entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    total_stars: int = 0
    total_destruction: float = 0.0
    attack_count: int = 0
    defense_count: int = 0
    triple_stars: int = 0
    average_stars: float = 0.0
    average_destruction: float = 0.0
    war_count: int = 0


class DonationsEntry(BaseModel):
    """Player donations entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    donations_sent: int = 0
    donations_received: int = 0
    donation_ratio: Optional[float] = None  # sent / received


class CapitalRaidEntry(BaseModel):
    """Player capital raid performance entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    total_capital_gold: int = 0
    total_raids: int = 0
    average_capital_gold: float = 0.0
    total_attacks: int = 0


class WarPerformanceLeaderboardResponse(BaseModel):
    """Response for war performance leaderboard"""
    server_id: int
    total_count: int
    players: List[WarPerformanceEntry] = Field(default_factory=list)


class DonationsLeaderboardResponse(BaseModel):
    """Response for donations leaderboard"""
    server_id: int
    total_count: int
    players: List[DonationsEntry] = Field(default_factory=list)


class CapitalRaidLeaderboardResponse(BaseModel):
    """Response for capital raid leaderboard"""
    server_id: int
    total_count: int
    players: List[CapitalRaidEntry] = Field(default_factory=list)


class LegendLeagueEntry(BaseModel):
    """Player legend league performance entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    current_trophies: int = 0
    trophy_change: int = 0  # Net change for the period
    attack_wins: int = 0
    defense_wins: int = 0
    total_attacks: int = 0
    total_defenses: int = 0
    streak: Optional[int] = None


class ClanGamesEntry(BaseModel):
    """Player clan games entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    points: int = 0


class ActivityEntry(BaseModel):
    """Player activity entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    activity_count: int = 0
    last_online: Optional[int] = None  # Unix timestamp
    days_since_online: Optional[int] = None


class LootingEntry(BaseModel):
    """Player looting/resources entry"""
    player_tag: str
    player_name: str
    townhall_level: Optional[int] = None
    clan_tag: Optional[str] = None
    clan_name: Optional[str] = None
    gold_looted: int = 0
    elixir_looted: int = 0
    dark_elixir_looted: int = 0
    total_looted: int = 0  # Sum of all resources


class LegendLeagueLeaderboardResponse(BaseModel):
    """Response for legend league leaderboard"""
    server_id: int
    total_count: int
    players: List[LegendLeagueEntry] = Field(default_factory=list)


class ClanGamesLeaderboardResponse(BaseModel):
    """Response for clan games leaderboard"""
    server_id: int
    season: str  # Format: YYYY-MM
    total_count: int
    players: List[ClanGamesEntry] = Field(default_factory=list)


class ActivityLeaderboardResponse(BaseModel):
    """Response for activity leaderboard"""
    server_id: int
    season: str  # Format: YYYY-MM
    total_count: int
    players: List[ActivityEntry] = Field(default_factory=list)


class LootingLeaderboardResponse(BaseModel):
    """Response for looting leaderboard"""
    server_id: int
    season: str  # Format: YYYY-MM
    total_count: int
    sort_by: str  # gold, elixir, dark_elixir, or total
    players: List[LootingEntry] = Field(default_factory=list)

