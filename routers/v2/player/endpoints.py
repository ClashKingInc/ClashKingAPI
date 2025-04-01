from collections import defaultdict

import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request

from utils.time import get_season_raid_weeks, season_start_end, CLASH_ISO_FORMAT
from utils.utils import fix_tag, remove_id_fields, bulk_requests
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2",tags=["Player"], include_in_schema=True)


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
            "name" : p.get("name"),
            "tag" : p.get("tag"),
            "value" : fetch_attribute(data=p, attr=attribute),
            "clan" : p.get("clan", {})
        }
        for p in player_responses
    ]

    return {"items": sorted(new_data, key=lambda x: (x["value"] is not None, x["value"]), reverse=True)}


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
            new_data[name].append({"tag" : result["tag"], "value" : field, "count" : count})

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

    return {"items" : [{key : value} for key, value in new_data.items()]}

