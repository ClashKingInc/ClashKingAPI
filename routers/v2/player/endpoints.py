import asyncio

import aiohttp
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
import pendulum

from routers.v2.player.utils import get_legend_season_range, group_legends_by_season
from utils.utils import fix_tag, remove_id_fields, bulk_requests
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

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


@router.post("/players/full-stats", name="Get full stats for a list of players")
async def get_full_player_stats(request: Request, body: PlayerTagsRequest):
    """Retrieve Clash of Clans account details for a list of players."""

    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]

    players_info = await mongo.player_stats.find(
        {'tag': {'$in': player_tags}},
        {'_id': 0, 'tag': 1, 'donations': 1, 'legends': 1, 'clan_games': 1, 'season_pass': 1, 'activity': 1,
         'last_online': 1, 'last_online_time': 1, 'attack_wins': 1, 'dark_elixir': 1, 'gold': 1,
         'capital_gold': 1, 'season_trophies': 1, 'last_updated': 1}
    ).to_list(length=None)

    mongo_data_dict = {player["tag"]: player for player in players_info}

    async def fetch_player_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/players/{tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_responses = await asyncio.gather(*(fetch_player_data(session, tag) for tag in player_tags))

    combined_results = []
    for tag, api_data in zip(player_tags, api_responses):
        player_data = mongo_data_dict.get(tag, {})
        if api_data:
            player_data.update(api_data)

        # Process each day in the legends data to extract trophy deltas and counts
        # Transform legends days into seasons
        raw_legends = player_data.get("legends", {})

        # Enrich each day with start/end trophies and per-day stats before grouping by season
        for day, data in raw_legends.items():
            if not isinstance(data, dict):
                continue

            new_attacks = data.get("new_attacks", [])
            new_defenses = data.get("new_defenses", [])

            all_events = sorted(new_attacks + new_defenses, key=lambda x: x.get("time", 0))
            if all_events and "trophies" in all_events[-1]:
                end_trophies = all_events[-1]["trophies"]
                trophies_gained = sum(entry.get("change", 0) for entry in new_attacks)
                trophies_lost = sum(entry.get("change", 0) for entry in new_defenses)
                trophies_total = trophies_gained + trophies_lost
                start_trophies = end_trophies - trophies_total

                data["start_trophies"] = start_trophies
                data["end_trophies"] = end_trophies
                data["trophies_gained_total"] = trophies_gained
                data["trophies_lost_total"] = trophies_lost
                data["trophies_total"] = trophies_total
                data["total_attacks"] = len(new_attacks)
                data["total_defenses"] = len(new_defenses)

        grouped_legends = group_legends_by_season(raw_legends)
        player_data["legends_by_season"] = grouped_legends
        player_data.pop("legends", None)

        combined_results.append(player_data)

    return {"items": remove_id_fields(combined_results)}

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
