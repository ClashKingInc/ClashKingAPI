from pydantic import BaseModel
from typing import Optional, List, Literal


GiveawayStatus = Literal["scheduled", "ongoing", "ended"]
GiveawayRolesMode = Literal["allow", "deny", "none"]


class GiveawayBooster(BaseModel):
    value: float
    roles: List[str] = []


class GiveawayWinner(BaseModel):
    user_id: str
    username: Optional[str] = None
    status: Literal["winner", "rerolled"] = "winner"
    timestamp: Optional[str] = None
    reason: Optional[str] = None


class GiveawayConfig(BaseModel):
    id: str
    prize: str
    channel_id: Optional[str] = None
    status: GiveawayStatus
    start_time: str
    end_time: str
    winners: int
    mentions: List[str] = []
    text_above_embed: str = ""
    text_in_embed: str = ""
    text_on_end: str = ""
    image_url: Optional[str] = None
    profile_picture_required: bool = False
    coc_account_required: bool = False
    roles_mode: GiveawayRolesMode = "none"
    roles: List[str] = []
    boosters: List[GiveawayBooster] = []
    entry_count: int = 0
    updated: bool = False
    message_id: Optional[str] = None
    winners_list: List[GiveawayWinner] = []


class ServerGiveawaysResponse(BaseModel):
    ongoing: List[GiveawayConfig] = []
    upcoming: List[GiveawayConfig] = []
    ended: List[GiveawayConfig] = []
    total: int = 0


class GiveawayMutationResponse(BaseModel):
    message: str
    giveaway_id: str
    server_id: int


class GiveawayRerollRequest(BaseModel):
    user_ids_to_replace: List[str]


class GiveawayRerollResponse(BaseModel):
    message: str
    giveaway_id: str
    server_id: int
    new_winners: List[str]
