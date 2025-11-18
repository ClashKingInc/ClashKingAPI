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
