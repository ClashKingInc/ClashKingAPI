
import coc
import linkd

from fastapi import APIRouter
from fastapi_cache.decorator import cache
from datetime import timezone
from utils.database import MongoClient
import dateutil.relativedelta

router = APIRouter(tags=["List Endpoints"])


@router.get("/list/townhalls",
         name="List of current townhall levels")
@cache(expire=300)
@linkd.ext.fastapi.inject
async def list_townhalls(*, mongo: MongoClient):
    townhalls = await mongo.basic_clan.distinct("memberList.townhall")
    return [th for th in townhalls if th != 0]


@router.get("/list/seasons",
         name="List of last X seasons")
@cache(expire=300)
async def list_seasons(last: int = 12):
    last = min(last, 1000)
    dates = []
    for x in range(0, last + 1):
        end = coc.utils.get_season_end().replace(tzinfo=timezone.utc) - dateutil.relativedelta.relativedelta(months=x)
        month = end.month
        if end.month <= 9:
            month = f"0{month}"
        dates.append(f"{end.year}-{month}")
    return dates




