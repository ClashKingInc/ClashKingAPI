from typing import Optional, List, Union
from pydantic import BaseModel

class ClanWarHitsFilter(BaseModel):
    clan_tags: List[str]
    timestamp_start: int = 0
    timestamp_end: int = 2527625513
    limit: Optional[int] = 50
    own_th: Optional[Union[int, List[int]]] = None
    enemy_th: Optional[Union[int, List[int]]] = None
    same_th: bool = False
    type: Union[str, List[str]] = "all"
    fresh_only: Optional[bool] = None
    min_stars: Optional[int] = None
    max_stars: Optional[int] = None
    stars: Optional[List[int]] = None
    season: Optional[str] = None
    min_destruction: Optional[float] = None
    max_destruction: Optional[float] = None
    map_position_min: Optional[int] = None
    map_position_max: Optional[int] = None

class PlayerWarhitsFilter(BaseModel):
    player_tags: List[str]
    timestamp_start: int = 0
    timestamp_end: int = 2527625513
    limit: Optional[int] = 50
    own_th: Optional[Union[int, List[int]]] = None
    enemy_th: Optional[Union[int, List[int]]] = None
    same_th: bool = False
    type: Union[str, List[str]] = "all"
    fresh_only: Optional[bool] = None
    min_stars: Optional[int] = None
    max_stars: Optional[int] = None
    stars: Optional[List[int]] = None
    season: Optional[str] = None
    min_destruction: Optional[float] = None
    max_destruction: Optional[float] = None
    map_position_min: Optional[int] = None
    map_position_max: Optional[int] = None