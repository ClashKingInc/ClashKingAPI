import re
import ujson
import coc
import pendulum as pend

from collections import defaultdict
from datetime import datetime
from pymongo import UpdateOne
from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from utils.utils import fix_tag, db_client

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Leaderboards"])


@router.get(
        path="/leaderboard/capital/looted/players",
        name="Leaderboard of capital loot for players (weekend: YYYY-MM-DD)")
@cache(expire=8000000)
@limiter.limit("1/minute")
async def capital_looted_player(weekend: str, request: Request, response: Response, limit: int = 50, league = None):
    limit = min(limit, 1000)
    if league is None:
        condition = {}
    else:
        condition = {"changes.old_league" : {"$eq" : league}}
    weekend_to_iso = pend.parse(weekend, strict=False)
    if (pend.now(tz=pend.UTC) - weekend_to_iso).total_seconds() <= 273600:
        raise HTTPException(status_code=404, detail=f"Please wait until 4 hours after Raid Weekend is completed to collect stats")
    weekend_to_iso = weekend_to_iso.replace(hour=7)
    weekend = weekend_to_iso.strftime('%Y%m%dT%H%M%S.000Z')
    pipeline = [
        {
            '$match': {'data.startTime': weekend}
        },
        {"$match": condition},
        {"$unwind": "$data.members"},
        {"$project" : {
            "tag" : "$data.members.tag",
            "name" : "$data.members.name",
            "looted" : "$data.members.capitalResourcesLooted",
            "clan_tag" : "$clan_tag",
            "league" : "$league"
        }},
        {"$sort" : {"looted" : -1}},
        {"$limit" : limit},
        {"$unset" : "_id"}
    ]
    results = await db_client.capital.aggregate(pipeline=pipeline).to_list(length=None)
    return {"items" : results}


@router.get(
        path="/leaderboard/capital/looted/clans",
        name="Leaderboard of capital loot for clans (weekend: YYYY-MM-DD)")
@cache(expire=8000000)
@limiter.limit("1/minute")
async def capital_looted_clans(weekend: str, request: Request, response: Response, limit: int = 50, league = None):

    limit = min(limit, 1000)
    if league is None:
        condition = {}
    else:
        condition = {"changes.old_league" : {"$eq" : league}}
    weekend_to_iso = pend.parse(weekend, tz=pend.UTC)

    if (pend.now(tz=pend.UTC) - weekend_to_iso).total_seconds() <= 273600:
        raise HTTPException(status_code=404, detail=f"Please wait until 4 hours after Raid Weekend is completed to collect stats")
    weekend_to_iso = weekend_to_iso.replace(hour=7)
    weekend = weekend_to_iso.strftime('%Y%m%dT%H%M%S.000Z')
    '''#clans_that_did_raid_weekend = await db_client.capital.distinct("clan_tag", filter={'data.startTime': weekend})
    pipeline = [{"$match": {'data.startTime': weekend}}, {"$group": {"_id": "$clan_tag"}}]
    clans_that_did_raid_weekend = [x["_id"] for x in (await db_client.capital.aggregate(pipeline).to_list(length=None))]

    print(len(clans_that_did_raid_weekend), "clans did raid weekend")
    size_break = 100_000
    all_tags = [clans_that_did_raid_weekend[i:i + size_break] for i in range(0, len(clans_that_did_raid_weekend), size_break)]

    leagues = []
    for group in all_tags:
        l = await db_client.basic_clan.find({"tag" : {"$in" : group}}, {f'changes.clanCapital.{next_week}.league' : 1,
                                               f'changes.clanCapital.{og_weekend}.league': 1,
                                               f'changes.clanCapital.{next_week}.trophies': 1,
                                               f'changes.clanCapital.{og_weekend}.trophies': 1,
                                               "tag" : 1}).to_list(length=None)
        leagues += l

    print(len(leagues), "leagues found")
    changes = []
    for clan in leagues:
        if clan.get("changes", {}).get("clanCapital", {}).get(og_weekend, {}).get("league", None) is not None:
            changes.append(UpdateOne({"$and" : [{"clan_tag" : clan.get("tag")}, {'data.startTime': weekend}]},
                                     {"$set" : {"changes" : {"old_league" : clan.get("changes", {}).get("clanCapital", {}).get(og_weekend, {}).get("league", None),
                                                             "new_league" : clan.get("changes", {}).get("clanCapital", {}).get(next_week, {}).get("league", None),
                                                             "old_trophies" : clan.get("changes", {}).get("clanCapital", {}).get(og_weekend, {}).get("trophies", 0),
                                                             "new_trophies": clan.get("changes", {}).get("clanCapital", {}).get(next_week, {}).get("trophies", 0)
                                                             }}}))
    print(len(changes), "changes")
    await db_client.capital.bulk_write(changes, ordered=False)
    print("done")
    return'''
    pipeline = [
        {
            '$match': {'data.startTime': weekend}
        },
        {"$match": condition},
        {"$sort": {"data.capitalTotalLoot": -1}},
        {"$limit": limit},
        {"$project": {
            "clan_tag": "$clan_tag",
            "looted" : "$data.capitalTotalLoot",
            "raidsCompleted" : "$data.raidsCompleted",
            "districtsDestroyed" : "$data.enemyDistrictsDestroyed",
            "totalAttacks" : "$data.totalAttacks",
            "league": "$league"
        }},
        {"$unset" : "_id"}
    ]
    results = await db_client.capital.aggregate(pipeline=pipeline).to_list(length=None)
    return {"items" : results}






