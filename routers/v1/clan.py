import coc
import pendulum as pend

from bson.objectid import ObjectId
from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from models.clan import JoinLeaveList
from slowapi import Limiter
from slowapi.util import get_ipaddr
from utils.utils import fix_tag, leagues, db_client


router = APIRouter(tags=["Clan Endpoints"])



@router.get("/clan/{clan_tag}/basic",
         name="Basic Clan Object")
@cache(expire=300)
async def clan_basic(clan_tag: str, request: Request, response: Response):
    clan_tag = fix_tag(clan_tag)
    result = await db_client.basic_clan.find_one({"tag": clan_tag})
    if result is not None:
        del result["_id"]
    return result




@router.get(
        path="/clan/{clan_tag}/join-leave",
        name="Join Leaves in a season",
        response_model=JoinLeaveList)
@cache(expire=300)
async def clan_join_leave(clan_tag: str, request: Request, response: Response, timestamp_start: int = 0, time_stamp_end: int = 9999999999, limit: int = 250):
    clan_tag = fix_tag(clan_tag)
    result = await db_client.join_leave_history.find(
        {"$and" : [
            {"clan" : clan_tag},
            {"time" : {"$gte" : pend.from_timestamp(timestamp=timestamp_start, tz=pend.UTC)}},
            {"time": {"$lte": pend.from_timestamp(timestamp=time_stamp_end, tz=pend.UTC)}}
        ]
    }, {"_id" : 0}).sort({"time" : -1}).limit(limit=limit).to_list(length=None)
    return {"items" : result}




@router.get("/clan/search",
         name="Search Clans by Filtering")
@cache(expire=300)
async def clan_filter(request: Request, response: Response,  limit: int= 100, location_id: int = None, minMembers: int = None, maxMembers: int = None,
                      minLevel: int = None, maxLevel: int = None, openType: str = None,
                      minWarWinStreak: int = None, minWarWins: int = None, minClanTrophies: int = None, maxClanTrophies: int = None, capitalLeague: str= None,
                      warLeague: str= None, memberList: bool = True, before:str =None, after: str=None):
    queries = {}
    queries['$and'] = []
    if location_id:
        queries['$and'].append({'location.id': location_id})

    if minMembers:
        queries['$and'].append({"members": {"$gte" : minMembers}})

    if maxMembers:
        queries['$and'].append({"members": {"$lte" : maxMembers}})

    if minLevel:
        queries['$and'].append({"level": {"$gte" : minLevel}})

    if maxLevel:
        queries['$and'].append({"level": {"$lte" : maxLevel}})

    if openType:
        queries['$and'].append({"type": openType})

    if capitalLeague:
        queries['$and'].append({"capitalLeague": capitalLeague})

    if warLeague:
        queries['$and'].append({"warLeague": warLeague})

    if minWarWinStreak:
        queries['$and'].append({"warWinStreak": {"$gte": minWarWinStreak}})

    if minWarWins:
        queries['$and'].append({"warWins": {"$gte": minWarWins}})

    if minClanTrophies:
        queries['$and'].append({"clanPoints": {"$gte": minClanTrophies}})

    if maxClanTrophies:
        queries['$and'].append({"clanPoints": {"$gte": maxClanTrophies}})

    if after:
        queries['$and'].append({"_id": {"$gt": ObjectId(after)}})

    if before:
        queries['$and'].append({"_id": {"$lt": ObjectId(before)}})


    if queries["$and"] == []:
        queries = {}

    limit = min(limit, 1000)
    results = await db_client.basic_clan.find(queries).limit(limit).sort("_id", 1).to_list(length=limit)
    return_data = {"items" : [], "before": "", "after" : ""}
    if results:
        return_data["before"] = str(results[0].get("_id"))
        return_data["after"] = str(results[-1].get("_id"))
        for data in results:
            del data["_id"]
            if not memberList:
                del data["memberList"]
        return_data["items"] = results
    return return_data




@router.get("/clan/{clan_tag}/historical",
         name="Historical data for a clan of player events")
@cache(expire=300)
async def clan_historical(clan_tag: str, request: Request, response: Response, timestamp_start: int = 0, time_stamp_end: int = 9999999999, limit: int = 100):
    clan_tag = fix_tag(clan_tag)

    historical_data = await db_client.player_history.find(
        {"$and": [
            {"clan": clan_tag},
            {"time": {"$gte": int(pend.from_timestamp(timestamp=timestamp_start, tz=pend.UTC).timestamp())}},
            {"time": {"$lte": int(pend.from_timestamp(timestamp=time_stamp_end, tz=pend.UTC).timestamp())}}
        ]
        }, {"_id": 0}).sort({"time": -1}).limit(limit=limit).to_list(length=25000)

    return {"items" : historical_data}
