import aiohttp
import coc
import datetime
import pendulum as pend
import re
import time

from collections import defaultdict
from datetime import timedelta
from fastapi import Request, Response, HTTPException, Query, APIRouter
from fastapi_cache.decorator import cache
from slowapi import Limiter
from slowapi.util import get_ipaddr
from typing import List, Annotated
from utils.utils import fix_tag, redis, db_client, gen_legend_date, gen_games_season, leagues



router = APIRouter(tags=["Player Endpoints"])

@router.get("/player/{player_tag}/stats",
         name="All collected Stats for a player (clan games, looted, activity, etc)")
@cache(expire=300)
async def player_stat(player_tag: str, request: Request, response: Response):
    player_tag = player_tag and "#" + re.sub(r"[^A-Z0-9]+", "", player_tag.upper()).replace("O", "0")
    result = await db_client.player_stats_db.find_one({"tag": player_tag})
    lb_spot = await db_client.player_leaderboard_db.find_one({"tag": player_tag})

    if result is None:
        raise HTTPException(status_code=404, detail=f"No player found")
    try:
        del result["legends"]["streak"]
    except:
        pass
    result = {
        "name" : result.get("name"),
        "tag" : result.get("tag"),
        "townhall" : result.get("townhall"),
        "legends" : result.get("legends", {}),
        "last_online" : result.get("last_online"),
        "looted" : {"gold": result.get("gold", {}), "elixir": result.get("elixir", {}), "dark_elixir": result.get("dark_elixir", {})},
        "trophies" : result.get("trophies", 0),
        "warStars" : result.get("warStars"),
        "clanCapitalContributions" : result.get("aggressive_capitalism"),
        "donations": result.get("donations", {}),
        "capital" : result.get("capital_gold", {}),
        "clan_games" : result.get("clan_games", {}),
        "season_pass" : result.get("season_pass", {}),
        "attack_wins" : result.get("attack_wins", {}),
        "activity" : result.get("activity", {}),
        "clan_tag" : result.get("clan_tag"),
        "league" : result.get("league")
    }

    if lb_spot is not None:
        try:
            result["legends"]["global_rank"] = lb_spot["global_rank"]
            result["legends"]["local_rank"] = lb_spot["local_rank"]
        except:
            pass
        try:
            result["location"] = lb_spot["country_name"]
        except:
            pass

    return result


@router.get("/player/{player_tag}/legends",
         name="Legend stats for a player")
@cache(expire=300)
async def player_legend(player_tag: str, request: Request, response: Response, season: str = None):
    player_tag = fix_tag(player_tag)
    c_time = time.time()
    result = await db_client.player_stats_db.find_one({"tag": player_tag}, projection={"name" : 1, "townhall" : 1, "legends" : 1, "tag" : 1})
    if result is None:
        raise HTTPException(status_code=404, detail=f"No player found")
    ranking_data = await db_client.player_leaderboard_db.find_one({"tag": player_tag}, projection={"_id" : 0})

    default = {"country_code": None,
               "country_name": None,
               "local_rank": None,
               "global_rank": None}
    if ranking_data is None:
        ranking_data = default
    if ranking_data.get("global_rank") is None:
        self_global_ranking = await db_client.legend_rankings.find_one({"tag": player_tag})
        if self_global_ranking:
            ranking_data["global_rank"] = self_global_ranking.get("rank")

    legend_data = result.get('legends', {})
    if season and legend_data != {}:
        year, month = season.split("-")
        season_start = coc.utils.get_season_start(month=int(month) - 1, year=int(year))
        season_end = coc.utils.get_season_end(month=int(month) - 1, year=int(year))
        delta = season_end - season_start
        days = [season_start + timedelta(days=i) for i in range(delta.days)]
        days = [day.strftime("%Y-%m-%d") for day in days]

        _holder = {}
        for day in days:
            _holder[day] = legend_data.get(day, {})
        legend_data = _holder

    result = {
        "name" : result.get("name"),
        "tag" : result.get("tag"),
        "townhall" : result.get("townhall"),
        "legends" : legend_data,
        "rankings" : ranking_data
    }

    result["legends"].pop("global_rank", None)
    result["legends"].pop("local_rank", None)
    result["streak"] = result["legends"].pop("streak", 0)
    return dict(result)


@router.get("/player/{player_tag}/historical/{season}",
         name="Historical data for player events")
@cache(expire=300)
async def player_historical(player_tag: str, season: str, request: Request, response: Response):
    player_tag = player_tag and "#" + re.sub(r"[^A-Z0-9]+", "", player_tag.upper()).replace("O", "0")
    year = season[:4]
    month = season[-2:]
    season_start = coc.utils.get_season_start(month=int(month) - 1, year=int(year))
    season_end = coc.utils.get_season_end(month=int(month) - 1, year=int(year))
    historical_data = await db_client.player_history.find({"$and" : [{"tag": player_tag}, {"time" : {"$gte" : season_start.timestamp()}}, {"time" : {"$lte" : season_end.timestamp()}}]}).sort("time", 1).to_list(length=25000)
    breakdown = defaultdict(list)
    for data in historical_data:
        del data["_id"]
        breakdown[data["type"]].append(data)

    result = {}
    for key, item in breakdown.items():
        result[key] = item

    return dict(result)


@router.get("/player/{player_tag}/warhits",
         name="War attacks done/defended by a player")
@cache(expire=300)
async def player_warhits(player_tag: str, request: Request, response: Response, timestamp_start: int = 0, timestamp_end: int = 2527625513, limit: int = 50):
    client = coc.Client(raw_attribute=True)
    player_tag = fix_tag(player_tag)
    START = pend.from_timestamp(timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    pipeline = [
        {"$match": {"$or": [{"data.clan.members.tag": player_tag}, {"data.opponent.members.tag": player_tag}]}},
        {"$match" : {"$and" : [{"data.preparationStartTime" : {"$gte" : START}}, {"data.preparationStartTime" : {"$lte" : END}}]}},
        {"$unset": ["_id"]},
        {"$project": {"data": "$data"}},
        {"$sort" : {"data.preparationStartTime" : -1}}
    ]
    wars = await db_client.clan_wars.aggregate(pipeline, allowDiskUse=True).to_list(length=None)
    found_wars = set()
    stats = {"items" : []}
    local_limit = 0
    for war in wars:
        war = war.get("data")
        war = coc.ClanWar(data=war, client=client)
        war_unique_id = "-".join(sorted([war.clan_tag, war.opponent.tag])) + f"-{int(war.preparation_start_time.time.timestamp())}"
        if war_unique_id in found_wars:
            continue
        found_wars.add(war_unique_id)
        if limit == local_limit:
            break
        local_limit += 1

        war_member = war.get_member(player_tag)

        war_data: dict = war._raw_data
        war_data.pop("status_code", None)
        war_data.pop("_response_retry", None)
        war_data.pop("timestamp", None)
        war_data.pop("timestamp", None)
        del war_data["clan"]["members"]
        del war_data["opponent"]["members"]
        war_data["type"] = war.type

        member_raw_data = war_member._raw_data
        member_raw_data.pop("bestOpponentAttack", None)
        member_raw_data.pop("attacks", None)

        done_holder = {
            "war_data": war_data,
            "member_data" : member_raw_data,
            "attacks": [],
            "defenses" : []
        }
        for attack in war_member.attacks:
            raw_attack: dict = attack._raw_data
            raw_attack["fresh"] = attack.is_fresh_attack
            defender_raw_data = attack.defender._raw_data
            defender_raw_data.pop("attacks", None)
            defender_raw_data.pop("bestOpponentAttack", None)
            raw_attack["defender"] = defender_raw_data
            raw_attack["attack_order"] = attack.order
            done_holder["attacks"].append(raw_attack)

        for defense in war_member.defenses:
            raw_defense: dict = defense._raw_data
            raw_defense["fresh"] = defense.is_fresh_attack

            defender_raw_data = defense.attacker._raw_data
            defender_raw_data.pop("attacks", None)
            defender_raw_data.pop("bestOpponentAttack", None)

            raw_defense["attacker"] = defender_raw_data
            raw_defense["attack_order"] = defense.order
            done_holder["defenses"].append(raw_defense)

        stats["items"].append(done_holder)
    return stats


@router.get(
    path="/player/{player_tag}/raids",
    name="Raids participated in by a player"
)
@cache(expire=300)
async def player_raids(player_tag: str, request: Request, response: Response, limit: int = 1):
    results = await db_client.capital.find({"data.members.tag" : player_tag}).sort({"data.endTime" : -1}).limit(limit=limit).to_list(length=None)
    results = [r.get("data") for r in results]
    return {"items" : results}


@router.get("/player/to-do",
         name="List of in-game items to complete (legends, war, raids, etc)")
@cache(expire=300)
async def player_to_do(request: Request, response: Response, player_tags: Annotated[List[str], Query(min_length=1, max_length=50)]):
    return_data = {"items" : []}
    for player_tag in player_tags:
        player_tag = fix_tag(player_tag)

        player_data = await db_client.player_stats_db.find_one({"tag" : player_tag},
                                                               {"legends" : 1, "clan_games" : 1, "season_pass" : 1, "last_online" : 1})
        player_data = player_data or {}

        legends_data = player_data.get("legends", {}).get(gen_legend_date(), {})
        games_data = player_data.get("clan_games", {}).get(gen_games_season(), {})
        pass_data = player_data.get("season_pass", {}).get(gen_games_season(), {})
        last_active_data = player_data.get("last_online")

        player_clan_tag = None
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://proxy.clashk.ing/v1/players/{player_tag.replace('#', '%23')}") as response:
                if response.status == 200:
                    player_json = await response.json()
                    player_clan_tag = player_json.get("clan", {}).get("tag")

        raid_data = {}
        if player_clan_tag:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://proxy.clashk.ing/v1/clans/{player_clan_tag.replace('#', '%23')}/capitalraidseasons?limit=1") as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("items"):
                            raid_weekend_entry = coc.RaidLogEntry(data=data.get("items")[0], client=None, clan_tag=player_clan_tag)
                            if raid_weekend_entry.end_time.seconds_until >= 0:
                                raid_member = raid_weekend_entry.get_member(tag=player_tag)
                                if raid_member:
                                    raid_data = {
                                        "attacks_done" : raid_member.attack_count,
                                        "attack_limit" : raid_member.attack_limit + raid_member.bonus_attack_limit,
                                    }


        war_data = await db_client.war_timer.find_one({"_id" : player_tag}, {"_id" : 0})
        war_data = war_data or {}

        cwl_data = {}

        if player_clan_tag:
            group_data = None
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://proxy.clashk.ing/v1/clans/{player_clan_tag.replace('#', '%23')}/currentwar/leaguegroup") as response:
                    if response.status == 200:
                        group_data = await response.json()

            if group_data and group_data.get("season") == gen_games_season():
                cwl_group = coc.ClanWarLeagueGroup(data=group_data, client=None)
                last_round = cwl_group.rounds[-1] if len(cwl_group.rounds) == 1 or len(cwl_group.rounds) == cwl_group.number_of_rounds else cwl_group.rounds[-2]

                our_war = None
                for war_tag in last_round:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(f"https://proxy.clashk.ing/v1/clanwarleagues/wars/{war_tag.replace('#', '%23')}") as response:
                            if response.status == 200:
                                war_json = await response.json()
                                war = coc.ClanWar(data=war_json, client=None)
                                if player_clan_tag in [war.clan.tag, war.opponent.tag]:
                                    our_war = war
                                    break

                war_member = our_war.get_member(tag=player_tag)
                if war_member:
                    cwl_data = {
                        "attack_limit" : war.attacks_per_member,
                        "attacks_done" : len(war_member.attacks)
                    }

        return_data["items"].append({
            "player_tag" : player_tag,
            "current_clan" : player_clan_tag,
            "legends" : legends_data,
            "clan_games" : games_data,
            "season_pass" : pass_data,
            "last_active" : last_active_data,
            "raids" : raid_data,
            "war" : war_data,
            "cwl" : cwl_data
        })

    return return_data



@router.get("/player/{player_tag}/legend_rankings",
         name="Previous player legend rankings")
@cache(expire=300)
async def player_legend_rankings(player_tag: str, request: Request, response: Response, limit:int = 10):

    player_tag = fix_tag(player_tag)
    results = await db_client.legend_history.find({"tag": player_tag}).sort("season", -1).limit(limit).to_list(length=None)
    for result in results:
        del result["_id"]

    return results


@router.get("/player/{player_tag}/wartimer",
         name="Get the war timer for a player")
@cache(expire=300)
async def player_wartimer(player_tag: str, request: Request, response: Response):
    player_tag = fix_tag(player_tag)
    result = await db_client.war_timer.find_one({"_id" : player_tag})
    if result is None:
        return result
    result["tag"] = result.pop("_id")
    time: datetime.datetime = result["time"]
    time = time.replace(tzinfo=pend.UTC)
    result["unix_time"] = time.timestamp()
    result["time"] = time.isoformat()
    return result


@router.get("/player/search/{name}",
         name="Search for players by name")
@cache(expire=300)
async def search_players(name: str, request: Request, response: Response):
    pipeline = [
        {
            "$search": {
                "index": "player_search",
                "autocomplete": {
                    "query": name,
                    "path": "name",
                },
            }
        },
        {"$limit": 25}
    ]
    results = await db_client.player_search.aggregate(pipeline=pipeline).to_list(length=None)
    for result in results:
        del result["_id"]
    return {"items" : results}


@router.get("/player/full-search/{name}",
         name="Search for players by name")
@cache(expire=300)
async def full_search_players(name: str, request: Request, response: Response,
                        role:str =Query(default=None, description='An in-game player role, uses API values like admin however'),
                        league:str =Query(default=None, description='An in-game player league'),
                        townhall: str = Query(default=None, description='A comma seperated value of low, high values like: 1,16'),
                        exp:str =Query(default=None, description='A comma seperated value of low, high values like: 0,500'),
                        trophies:str =Query(default=None, description='A comma seperated value of low, high values like: 0,6000'),
                        donations:str =Query(default=None, description='A comma seperated value of low, high values like: 0,90000'),
                        limit: int = 25):
    conditions = [
        {"$regexMatch": {"input": "$$member.name", "regex": name, "options": "i"}},
    ]

    if role is not None:
        conditions.append({"$eq": ["$$member.role", role]})

    if exp is not None:
        exp = exp.split(',')
        conditions.extend([
            {"$gte": ["$$member.expLevel", int(exp[0])]},
            {"$lte": ["$$member.expLevel", int(exp[1])]}
        ])
    if townhall is not None:
        townhall = townhall.split(',')
        conditions.extend([
            {"$gte": ["$$member.townhall", int(townhall[0])]},
            {"$lte": ["$$member.townhall", int(townhall[1])]}
        ])
    if trophies is not None:
        trophies = trophies.split(',')
        conditions.extend([
            {"$gte": ["$$member.trophies", int(trophies[0])]},
            {"$lte": ["$$member.trophies", int(trophies[1])]}
        ])
    if league is not None:
        conditions.append({"$eq": ["$$member.league", league]})
    if donations is not None:
        donations = donations.split(',')
        conditions.extend([
            {"$gte": ["$$member.donations", int(donations[0])]},
            {"$lte": ["$$member.donations", int(donations[1])]}
        ])

    pipeline =[
        {
            "$match": {"$text": {"$search": name}}
        },
        {
            "$project": {
                '_id' : 0,
                'clan_name' : '$name',
                'clan_tag' : '$tag',
                "memberList": {
                    "$filter": {
                        "input": "$memberList",
                        "as": "member",
                        "cond": {
                            "$and": conditions
                        }
                    }
                }
            }
        },
        {
            "$match": {"memberList.0": {"$exists": True}}
        },
        {"$limit" : min(limit, 1000)}
    ]

    results = await db_client.basic_clan.aggregate(pipeline=pipeline).to_list(length=None)
    return {"items" : [member | {'clan_name' : doc['clan_name'], 'clan_tag' : doc['clan_tag']} for doc in results for member in doc['memberList']]}


@router.get("/player/{player_tag}/join-leave",
            name="Get join leave history for a player")
@cache(expire=300)
async def player_join_leave(player_tag: str, request: Request, response: Response, timestamp_start: int = 0, time_stamp_end: int = 9999999999, limit: int = 250):
    player_tag = fix_tag(player_tag)

    pipeline = [
        {
            "$match": {
                "$and": [
                    {"tag": player_tag},
                    {"time": {"$gte": pend.from_timestamp(timestamp_start, tz='UTC')}},
                    {"time": {"$lte": pend.from_timestamp(time_stamp_end, tz='UTC')}}
                ]
            }
        },
        {
            "$lookup": {
                "from": "clan_tags",
                "localField": "clan",
                "foreignField": "tag",
                "as": "clan_info"
            }
        },
        {
            "$unwind": "$clan_info"
        },
        {
            "$project": {
                "_id": 0,
                "type": 1,
                "clan": 1,
                "clan_name": "$clan_info.name",
                "time": 1,
                "tag": 1,
                "name": 1,
                "th": 1
            }
        },
        {
            "$sort": {"time": -1}
        },
        {
            "$limit": limit
        }
    ]
    result = await db_client.join_leave_history.aggregate(pipeline).to_list(length=None)
    return {"items": result}



