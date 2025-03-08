from typing import List
from pydantic import BaseModel


class ClanTagsRequest(BaseModel):
    clan_tags: List[str]