from pydantic import BaseModel
from typing import Optional

class ServerSettingsUpdate(BaseModel):
    embed_color: Optional[str] = None
    full_whitelist_role: Optional[int] = None
    nickname_rule: Optional[str] = None
    non_family_nickname_rule: Optional[str] = None
    auto_eval_nickname: Optional[bool] = None
    autoeval_triggers: Optional[list[str]] = None