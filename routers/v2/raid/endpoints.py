import asyncio

import aiohttp
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException, Depends
from fastapi import APIRouter, Request
from routers.v2.clan.models import ClanTagsRequest, JoinLeaveQueryParams
from routers.v2.clan.utils import filter_leave_join, extract_join_leave_pairs, filter_join_leave, generate_stats
from utils.utils import fix_tag, remove_id_fields
from utils.time import gen_season_date, gen_raid_date, season_start_end
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2", tags=["Raid"], include_in_schema=True)
