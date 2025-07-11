from pydantic import BaseModel

class BanRequest(BaseModel):
    reason: str | None
    added_by: int
    image: str | None
