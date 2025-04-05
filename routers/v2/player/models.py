from pydantic import BaseModel
from typing import List

class PlayerTagsRequest(BaseModel):
    player_tags: List[str]
