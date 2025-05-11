from typing import Optional, List
from pydantic import BaseModel
from fastapi import Query


class JoinLeaveQueryParams:
    def __init__(
        self,
        timestamp_start: int = Query(0),
        time_stamp_end: int = Query(9999999999),
        season: Optional[str] = Query(
            None, regex=r"^\d{4}-\d{2}$", description="Season format YYYY-MM"
        ),
        current_season: Optional[bool] = Query(False),
        limit: int = Query(50),
        filter_leave_join_enabled: bool = Query(False),
        filter_join_leave_enabled: bool = Query(False),
        filter_time: Optional[int] = Query(86400),
        only_type: Optional[str] = Query(
            None, pattern="^(join_leave|leave_join)$"
        ),
        townhall: Optional[List[int]] = Query(None),
        type: Optional[str] = Query(None, regex="^(join|leave)$"),
        tag: Optional[List[str]] = Query(None),
        name_contains: Optional[str] = Query(None),
    ):
        self.timestamp_start = timestamp_start
        self.time_stamp_end = time_stamp_end
        self.season = season
        self.current_season = current_season
        self.limit = limit
        self.filter_leave_join_enabled = filter_leave_join_enabled
        self.filter_join_leave_enabled = filter_join_leave_enabled
        self.filter_time = filter_time
        self.only_type = only_type
        self.townhall = townhall
        self.type = type
        self.tag = tag
        self.name_contains = name_contains


class ClanTagsRequest(BaseModel):
    clan_tags: List[str]

class RaidsRequest(BaseModel):
    clan_tags: List[str]
    limit : int = 100