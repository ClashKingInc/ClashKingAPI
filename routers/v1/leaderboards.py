import pendulum as pend

from fastapi import  Request, Response, HTTPException, APIRouter, Query
from fastapi_cache.decorator import cache
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_ipaddr
from utils.utils import fix_tag, db_client, leagues



router = APIRouter(tags=["Leaderboards"])


@router.get(
        path="/leaderboard/players/capital",
        name="Capital Attribute Leaderboard for Players (weekend: YYYY-MM-DD)")
@cache(expire=300)
async def leaderboard_players_capital(
                            weekend: str = Query(example="2024-05-03"),
                            type: str = Query(enum=["capital_looted"]),
                            request: Request = None, response: Response = None,
                            lower: int = Query(ge=1, default=1),
                            upper: int = Query(le=1000, default=50),
                            league: str = Query(enum=["All"] + leagues)):

    weekend_to_iso = pend.parse(weekend, strict=False)
    if (pend.now(tz=pend.UTC) - weekend_to_iso).total_seconds() <= 273600:
        raise HTTPException(status_code=404, detail=f"Please wait until 4 hours after Raid Weekend is completed to collect stats")

    results = await db_client.player_capital_lb.find({
        "$and" : [
            {"weekend" : weekend},
            {"type" : type},
            {"ranking.league" : league},
            {"ranking.rank" : {"$gte" : lower, "$lte" : upper}}
        ]
    }, {"_id" : 0, "type" : 0}).sort({"ranking.rank" : 1}).limit(250).to_list(length=None)
    for result in results:
        result["rank"] = result["ranking"]["rank"]
        del result["ranking"]
    return {"items" : results}


@router.get(
        path="/leaderboard/clans/capital",
        name="Leaderboard of capital loot for clans (weekend: YYYY-MM-DD)")
@cache(expire=300)
async def leaderboard_clans_capital(
                        weekend: str = Query(example="2024-05-03"),
                        type: str = Query(enum=["capitalTotalLoot", "raidsCompleted", "enemyDistrictsDestroyed", "medals"]),
                        request: Request = None, response: Response = None,
                        lower: int = Query(ge=1, default=1),
                        upper: int = Query(le=1000, default=50),
                        league: str = Query(enum=["All"] + leagues)):

    weekend_to_iso = pend.parse(weekend, strict=False)
    if (pend.now(tz=pend.UTC) - weekend_to_iso).total_seconds() <= 273600:
        raise HTTPException(status_code=404, detail=f"Please wait until 4 hours after Raid Weekend is completed to collect stats")

    results = await db_client.clan_capital_lb.find({
        "$and": [
            {"weekend": weekend},
            {"type": type},
            {"ranking.league": league},
            {"ranking.rank": {"$gte": lower, "$lte": upper}}
        ]
    }, {"_id": 0, "type": 0}).sort({"ranking.rank": 1}).limit(250).to_list(length=None)
    for result in results:
        result["rank"] = result["ranking"]["rank"]
        del result["ranking"]
    return {"items": results}







