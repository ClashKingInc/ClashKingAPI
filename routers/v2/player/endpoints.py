import asyncio
from collections import defaultdict
import coc

import aiohttp
from fastapi import HTTPException
from fastapi import APIRouter, Request, Response
import pendulum as pend
from routers.v2.player.utils import get_legend_rankings_for_tag, get_legend_stats_common, get_current_rankings, \
    assemble_full_player_data, fetch_full_player_data, compute_warhit_stats
from utils.time import get_season_raid_weeks, season_start_end, CLASH_ISO_FORMAT, is_raids
from utils.utils import fix_tag, remove_id_fields, bulk_requests
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest, PlayerWarhitsFilter

router = APIRouter(prefix="/v2", tags=["Player"], include_in_schema=True)


@router.post("/players/location",
             name="Get locations for a list of players")
async def player_location_list(request: Request, body: PlayerTagsRequest):
    player_tags = [fix_tag(tag) for tag in body.player_tags]
    location_info = await mongo.leaderboard_db.find(
        {'tag': {'$in': player_tags}},
        {'_id': 0, 'tag': 1, 'country_name': 1, 'country_code': 1}
    ).to_list(length=None)

    return {"items": remove_id_fields(location_info)}


@router.post("/players/sorted/{attribute}",
             name="Get players sorted by an attribute")
async def player_sorted(attribute: str, request: Request, body: PlayerTagsRequest):
    urls = [f"players/{fix_tag(t).replace('#', '%23')}" for t in body.player_tags]
    player_responses = await bulk_requests(urls=urls)

    def fetch_attribute(data: dict, attr: str):
        """
        Fetches a nested attribute from a dictionary using dot notation.

        Supports:
        - Standard dictionary lookups (e.g., "name" -> data["name"])
        - Nested dictionary lookups (e.g., "league.name" -> data["league"]["name"])
        - List item lookups (e.g., "achievements[name=test].value" -> gets "value" from the achievement where name="test")

        :param data: The dictionary to fetch the attribute from.
        :param attr: The attribute path in dot notation.
        :return: The fetched value or None if not found.
        """

        if attr == "cumulative_heroes":
            return sum([h.get("level") for h in data.get("heroes", []) if h.get("village") == "home"])

        keys = attr.split(".")
        for i, key in enumerate(keys):
            # Handle list lookup pattern: "achievements[name=test]"
            if "[" in key and "]" in key:
                list_key, condition = key[:-1].split("[", 1)  # Extract list name and condition
                if "=" in condition:
                    cond_key, cond_value = condition.split("=", 1)
                    if list_key in data and isinstance(data[list_key], list):
                        for item in data[list_key]:
                            if isinstance(item, dict) and item.get(cond_key) == cond_value:
                                data = item  # Move into the matched dictionary
                                break
                        else:
                            return None  # No matching item found
                    else:
                        return None
                else:
                    return None  # Invalid format
            else:
                data = data.get(key, {}) if i < len(keys) - 1 else data.get(key)  # Move deeper into dict

            if data is None:
                return None  # Key not found

        return data

    new_data = [
        {
            "name": p.get("name"),
            "tag": p.get("tag"),
            "value": fetch_attribute(data=p, attr=attribute),
            "clan": p.get("clan", {})
        }
        for p in player_responses
    ]

    return {"items": sorted(new_data, key=lambda x: (x["value"] is not None, x["value"]), reverse=True)}


@router.post("/players/full-stats", name="Get full stats for a list of players")
async def get_players_stats(body: PlayerTagsRequest, request: Request):
    """Retrieve Clash of Clans account details for a list of players."""

    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]

    # Fetch MongoDB player_stats in bulk
    players_info = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {
            "_id": 0,
            "tag": 1,
            "donations": 1,
            "clan_games": 1,
            "season_pass": 1,
            "activity": 1,
            "last_online": 1,
            "last_online_time": 1,
            "attack_wins": 1,
            "dark_elixir": 1,
            "gold": 1,
            "capital_gold": 1,
            "season_trophies": 1,
            "last_updated": 1
        }
    ).to_list(length=None)

    mongo_data_dict = {player["tag"]: player for player in players_info}

    # Load legends data in bulk
    legends_data = await get_legend_stats_common(player_tags)
    tag_to_legends = {entry["tag"]: entry["legends_by_season"] for entry in legends_data}

    # Fetch API, raid & war data per player in parallel
    async with aiohttp.ClientSession() as session:
        fetch_tasks = [
            fetch_full_player_data(session, tag, mongo_data_dict.get(tag, {}))
            for tag in player_tags
        ]
        player_results = await asyncio.gather(*fetch_tasks)

    # Assemble enriched player data in parallel
    combined_results = await asyncio.gather(*[
        assemble_full_player_data(tag, api_data, raid_data, war_data, mongo_data, tag_to_legends)
        for tag, api_data, raid_data, war_data, mongo_data in player_results
    ])

    return {"items": remove_id_fields(combined_results)}


@router.get("/player/{player_tag}/full-stats", name="Get full stats for a single player")
async def get_player_stats(player_tag: str, request: Request):
    if not player_tag:
        raise HTTPException(status_code=400, detail="player_tag is required")

    fixed_tag = fix_tag(player_tag)

    mongo_data = await mongo.player_stats.find_one(
        {"tag": fixed_tag},
        {
            '_id': 0,
            'tag': 1,
            'donations': 1,
            'clan_games': 1,
            'season_pass': 1,
            'activity': 1,
            'last_online': 1,
            'last_online_time': 1,
            'attack_wins': 1,
            'dark_elixir': 1,
            'gold': 1,
            'capital_gold': 1,
            'season_trophies': 1,
            'last_updated': 1
        }
    ) or {}

    legends_data = await get_legend_stats_common([fixed_tag])
    tag_to_legends = {entry["tag"]: entry["legends_by_season"] for entry in legends_data}

    async with aiohttp.ClientSession() as session:
        tag, api_data, raid_data, war_data, mongo_data = await fetch_full_player_data(session, fixed_tag, mongo_data)

    player_data = await assemble_full_player_data(tag, api_data, raid_data, war_data, mongo_data, tag_to_legends)

    return remove_id_fields(player_data)


@router.post("/players/legend-days", name="Get legend stats for multiple players")
async def get_legend_stats(body: PlayerTagsRequest, request: Request):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")
    return {"items": await get_legend_stats_common(body.player_tags)}


@router.get("/player/{player_tag}/legend-days", name="Get legend stats for one player")
async def get_legend_stats_by_player(player_tag: str, request: Request):
    return await get_legend_stats_common(player_tag)


@router.get("/player/{player_tag}/legend_rankings", name="Get previous player legend rankings")
async def get_player_legend_rankings(player_tag: str, limit: int = 10):
    return await get_legend_rankings_for_tag(player_tag, limit=limit)


@router.post("/players/legend_rankings", name="Get legend rankings for multiple players")
async def get_bulk_legend_rankings(body: PlayerTagsRequest, limit: int = 10):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]
    results = []

    for tag in player_tags:
        rankings = await get_legend_rankings_for_tag(tag, limit)
        results.append({
            "tag": tag,
            "rankings": rankings
        })

    return {"items": results}


@router.post("/players/summary/{season}/top",
             name="Get summary of top stats for a list of players")
async def players_summary_top(season: str, request: Request, body: PlayerTagsRequest, limit: int = 10):
    results = await mongo.player_stats.find(
        {'$and': [{'tag': {'$in': body.player_tags}}]}
    ).to_list(length=None)

    new_data = defaultdict(list)

    def key_fetcher(d: dict, attr: str):
        keys = attr.split(".")
        for i, key in enumerate(keys):
            d = d.get(key, {}) if i < len(keys) - 1 else d.get(key, 0)
        return d

    options = [
        f'gold.{season}', f'elixir.{season}', f'dark_elixir.{season}',
        f'activity.{season}', f'attack_wins.{season}', f'season_trophies.{season}',
        (f'donations.{season}.donated', "donated"), (f'donations.{season}.received', "received"),
    ]

    for option in options:
        if isinstance(option, tuple):
            option, name = option
        else:
            option = option
            name = option.split(".")[0]
        top_results = sorted(results, key=lambda d: key_fetcher(d, attr=option), reverse=True)[:limit]
        for count, result in enumerate(top_results, 1):
            field = key_fetcher(result, attr=option)
            new_data[name].append({"tag": result["tag"], "value": field, "count": count})

    season_raid_weeks = get_season_raid_weeks(season=season)

    def capital_gold_donated(elem):
        cc_results = []
        for week in season_raid_weeks:
            week_result = elem.get('capital_gold', {}).get(week, {})
            cc_results.append(sum(week_result.get('donate', [])))
        return sum(cc_results)

    top_capital_donos = sorted(results, key=capital_gold_donated, reverse=True)[:limit]
    for count, result in enumerate(top_capital_donos, 1):
        cg_donated = capital_gold_donated(result)
        new_data["capital_donated"].append({"tag": result["tag"], "value": cg_donated, "count": count})

    def capital_gold_raided(elem):
        cc_results = []
        for week in season_raid_weeks:
            week_result = elem.get('capital_gold', {}).get(week, {})
            cc_results.append(sum(week_result.get('raid', [])))
        return sum(cc_results)

    top_capital_raided = sorted(results, key=capital_gold_raided, reverse=True)[:limit]
    for count, result in enumerate(top_capital_raided, 1):
        cg_raided = capital_gold_raided(result)
        new_data["capital_raided"].append({"tag": result["tag"], "value": cg_raided, "count": count})

    # ADD HITRATE
    SEASON_START, SEASON_END = season_start_end(season=season)
    SEASON_START, SEASON_END = SEASON_START.format(CLASH_ISO_FORMAT), SEASON_END.format(CLASH_ISO_FORMAT)

    pipeline = [
        {
            '$match': {
                '$and': [
                    {
                        '$or': [
                            {'data.clan.members.tag': {'$in': body.player_tags}},
                            {'data.opponent.members.tag': {'$in': body.player_tags}},
                        ]
                    },
                    {'data.preparationStartTime': {'$gte': SEASON_START}},
                    {'data.preparationStartTime': {'$lte': SEASON_END}},
                    {'type': {'$ne': 'friendly'}},
                ]
            }
        },
        {
            '$project': {
                '_id': 0,
                'uniqueKey': {
                    '$concat': [
                        {
                            '$cond': {
                                'if': {'$lt': ['$data.clan.tag', '$data.opponent.tag']},
                                'then': '$data.clan.tag',
                                'else': '$data.opponent.tag',
                            }
                        },
                        {
                            '$cond': {
                                'if': {'$lt': ['$data.opponent.tag', '$data.clan.tag']},
                                'then': '$data.opponent.tag',
                                'else': '$data.clan.tag',
                            }
                        },
                        '$data.preparationStartTime',
                    ]
                },
                'data': 1,
            }
        },
        {'$group': {'_id': '$uniqueKey', 'data': {'$first': '$data'}}},
        {'$project': {'members': {'$concatArrays': ['$data.clan.members', '$data.opponent.members']}}},
        {'$unwind': '$members'},
        {'$match': {'members.tag': {'$in': body.player_tags}}},
        {
            '$project': {
                '_id': 0,
                'tag': '$members.tag',
                'name': '$members.name',
                'stars': {'$sum': '$members.attacks.stars'},
            }
        },
        {
            '$group': {
                '_id': '$tag',
                'name': {'$last': '$name'},
                'totalStars': {'$sum': '$stars'},
            }
        },
        {'$sort': {'totalStars': -1}},
        {'$limit': limit},
    ]
    war_star_results = await mongo.clan_wars.aggregate(pipeline=pipeline).to_list(length=None)

    new_data["war_stars"] = [{"tag": result["_id"], "value": result["totalStars"], "count": count}
                             for count, result in enumerate(war_star_results, 1)]

    return {"items": [{key: value} for key, value in new_data.items()]}


@router.post("/players/warhits", name="Bulk war hits overview and detailed stats")
async def players_warhits_stats(filter: PlayerWarhitsFilter, request: Request):
    client = coc.Client(raw_attribute=True)

    START = pend.from_timestamp(filter.timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(filter.timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    player_tags = [fix_tag(tag) for tag in filter.player_tags]

    pipeline = [
        {"$match": {
            "$and": [
                {"$or": [
                    {"data.clan.members.tag": {"$in": player_tags}},
                    {"data.opponent.members.tag": {"$in": player_tags}}
                ]},
                {"data.preparationStartTime": {"$gte": START}},
                {"data.preparationStartTime": {"$lte": END}}
            ]
        }},
        {"$unset": ["_id"]},
        {"$project": {"data": "$data"}},
        {"$sort": {"data.preparationStartTime": -1}}
    ]

    wars = await mongo.clan_wars.aggregate(pipeline, allowDiskUse=True).to_list(length=None)

    found_wars = set()
    player_data = {tag: {"attacks": [], "defenses": [], "townhall": None, "missedAttacks": 0, "missedDefenses": 0,
                         "warsCount": 0} for tag in player_tags}

    for war_doc in wars:
        war_raw = war_doc["data"]
        war = coc.ClanWar(data=war_raw, client=client)
        war_id = "-".join(
            sorted([war.clan_tag, war.opponent.tag])) + f"-{int(war.preparation_start_time.time.timestamp())}"
        if war_id in found_wars:
            continue
        if len(found_wars) >= filter.limit:
            break
        found_wars.add(war_id)

        if filter.type != "all" and war.type.lower() != filter.type.lower():
            continue

        for tag in player_tags:
            war_member = war.get_member(tag)
            if not war_member:
                continue

            player_data[tag]["townhall"] = war_member.town_hall
            player_data[tag]["missedAttacks"] += war.attacks_per_member - len(war_member.attacks)
            player_data[tag]["missedDefenses"] += 1 if not war_member.best_opponent_attack else 0
            player_data[tag]["warsCount"] += 1

            for atk in war_member.attacks:
                atk_data = atk._raw_data
                atk_data["defender"] = {
                    "tag": atk.defender.tag,
                    "townhallLevel": atk.defender.town_hall,
                    "mapPosition": atk.defender.map_position,
                }
                atk_data["attacker"] = {
                    "townhallLevel": war_member.town_hall
                }

                if filter.enemy_th and atk.defender.town_hall != filter.enemy_th:
                    continue
                if filter.same_th and atk.defender.town_hall != war_member.town_hall:
                    continue
                if filter.fresh_only and not atk.is_fresh_attack:
                    continue
                if filter.min_stars and atk.stars < filter.min_stars:
                    continue
                if filter.max_stars and atk.stars > filter.max_stars:
                    continue
                if filter.min_destruction and atk.destruction < filter.min_destruction:
                    continue
                if filter.max_destruction and atk.destruction > filter.max_destruction:
                    continue
                if filter.map_position_min and atk.defender.map_position < filter.map_position_min:
                    continue
                if filter.map_position_max and atk.defender.map_position > filter.map_position_max:
                    continue

                player_data[tag]["attacks"].append(atk_data)

            for defn in war_member.defenses:
                def_data = defn._raw_data
                def_data["attacker"] = {
                    "tag": defn.attacker.tag,
                    "townhallLevel": defn.attacker.town_hall,
                    "mapPosition": defn.attacker.map_position,
                }
                def_data["defender"] = {
                    "townhallLevel": war_member.town_hall
                }

                if filter.enemy_th and defn.attacker.town_hall != filter.enemy_th:
                    continue
                if filter.same_th and defn.defender.town_hall != war_member.town_hall:
                    continue
                if filter.fresh_only and not defn.is_fresh_attack:
                    continue
                if filter.min_stars and defn.stars < filter.min_stars:
                    continue
                if filter.max_stars and defn.stars > filter.max_stars:
                    continue
                if filter.min_destruction and defn.destruction < filter.min_destruction:
                    continue
                if filter.max_destruction and defn.destruction > filter.max_destruction:
                    continue
                if filter.map_position_min and defn.attacker.map_position < filter.map_position_min:
                    continue
                if filter.map_position_max and defn.attacker.map_position > filter.map_position_max:
                    continue

                player_data[tag]["defenses"].append(def_data)

    enriched_data = []
    for tag, data in player_data.items():
        enriched_data.append({
            "tag": tag,
            "stats": compute_warhit_stats(
                tag=tag,
                townhall_level=data["townhall"],
                attacks=data["attacks"],
                defenses=data["defenses"],
                filter=filter,
                missed_attacks=data["missedAttacks"],
                missed_defenses=data["missedDefenses"],
                num_wars=data["warsCount"]
            ),
            "attacks": data["attacks"],
            "defenses": data["defenses"]
        })

    return {"items": enriched_data}
