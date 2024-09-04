from pydantic import BaseModel, Field
from datetime import datetime

class JoinLeaveEntry(BaseModel):
    name: str
    tag: str
    townhall: int = Field(alias="th")
    time: datetime
    clan_tag: str = Field(alias="clan")
    type: str

class JoinLeaveList(BaseModel):
    items: list[JoinLeaveEntry]