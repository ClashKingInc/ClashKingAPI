from pydantic import BaseModel

class BannedPlayerSearch(BaseModel):
    tag: str
    name: str