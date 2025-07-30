from pydantic import BaseModel
from typing import List, Optional, Dict


class PlayerTagsRequest(BaseModel):
    player_tags: List[str]
    clan_tags: Optional[Dict[str, str]] = None

