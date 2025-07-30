from pydantic import BaseModel

class BanRequest(BaseModel):
    reason: str
    added_by: str  # Discord user ID
    rollover_days: int