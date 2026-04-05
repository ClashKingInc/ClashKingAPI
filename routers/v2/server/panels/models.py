from typing import List, Literal, Optional
from pydantic import BaseModel

BUTTON_TYPES = Literal[
    "Link Button",
    "Link Help Button",
    "Refresh Button",
    "To-Do Button",
    "Roster Button",
]

BUTTON_COLORS = Literal["Blue", "Green", "Grey", "Red"]


class ServerPanel(BaseModel):
    embed_name: Optional[str] = None
    buttons: List[str] = []
    button_color: str = "Grey"
    welcome_channel: Optional[int] = None


class UpdatePanelRequest(BaseModel):
    embed_name: Optional[str] = None
    buttons: List[str] = []
    button_color: str = "Grey"
    welcome_channel: Optional[int] = None
