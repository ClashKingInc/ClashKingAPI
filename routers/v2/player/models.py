from pydantic import BaseModel
from typing import List, Optional, Dict


class PlayerTagsRequest(BaseModel):
    player_tags: List[str]
    clan_tags: Optional[Dict[str, str]] = None  # {"player_tag": "clan_tag"}

class PlayerWarhitsFilter(BaseModel):
    player_tags: List[str]
    timestamp_start: int = 0
    timestamp_end: int = 2527625513
    limit: int = None
    own_th: Optional[int] = None
    enemy_th: Optional[int] = None
    same_th: bool = False
    type: str = "all"
    fresh_only: Optional[bool] = None
    min_stars: Optional[int] = None
    max_stars: Optional[int] = None
    min_destruction: Optional[float] = None
    max_destruction: Optional[float] = None
    map_position_min: Optional[int] = None
    map_position_max: Optional[int] = None