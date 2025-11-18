from pydantic import BaseModel, Field
from typing import Optional


class StrikeRequest(BaseModel):
    reason: str
    added_by: int = Field(description="Discord user ID who added the strike")
    rollover_days: Optional[int] = Field(None, description="Days until strike expires")
    strike_weight: int = Field(1, description="Weight/severity of the strike", ge=1)
    image: Optional[str] = Field(None, description="Optional image URL for evidence")


class StrikeResponse(BaseModel):
    strike_id: str
    tag: str
    date_created: str
    reason: str
    server: int
    added_by: int
    strike_weight: int
    rollover_date: Optional[int] = None
    image: Optional[str] = None
