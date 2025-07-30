import asyncio
from collections import defaultdict

import aiohttp
from fastapi import HTTPException, Query
from fastapi import APIRouter, Request
from routers.v2.player.utils import get_legend_rankings_for_tag, get_legend_stats_common, \
    assemble_full_player_data, fetch_full_player_data, fetch_player_api_data
from utils.time import get_season_raid_weeks, season_start_end, CLASH_ISO_FORMAT
from utils.utils import fix_tag, remove_id_fields, bulk_requests
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2", tags=["Player"], include_in_schema=True)


# ============================================================================
# BASIC PLAYER DATA ENDPOINTS
# ============================================================================

@router.post("/players", name="Get basic API data for multiple players")
async def get_players_basic_stats(body: PlayerTagsRequest, request: Request):
    """Retrieve basic Clash of Clans API data for multiple players.
    
    Fast endpoint that returns only core player information from the CoC API:
    - Basic player stats (trophies, level, townhall, etc.)
    - Clan information (if player is in a clan)
    - Heroes, troops, spells, and achievements
    - No extended tracking data or MongoDB statistics
    """

    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]

    async with aiohttp.ClientSession() as session:
        fetch_tasks = [fetch_player_api_data(session, tag) for tag in player_tags]
        api_results = await asyncio.gather(*fetch_tasks)

    result = []
    for tag, data in zip(player_tags, api_results):
        if isinstance(data, HTTPException):
            if data.status_code == 503 or data.status_code == 500:
                raise data
            else:
                continue
        if data:
            result.append({
                "tag": tag,
                **data
            })

    return {"items": result}


# ============================================================================
# EXTENDED PLAYER DATA ENDPOINTS
# ============================================================================

@router.post("/players/extended", name="Get comprehensive stats for multiple players")
async def get_players_extended_stats(body: PlayerTagsRequest, request: Request):
    """Retrieve comprehensive player data combining API and tracking statistics.
    
    Returns enriched player profiles including:
    - Core API data (trophies, level, townhall, etc.)
    - Extended tracking stats (donations, clan games, activity, etc.)
    - Season-based statistics (gold, elixir, dark elixir earnings)
    - Capital gold contributions and raid data
    - Legend league statistics and rankings
    - War performance data
    """

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
            fetch_full_player_data(
                session,
                tag,
                mongo_data_dict.get(tag, {}),
                body.clan_tags.get(tag) if body.clan_tags else None
            )
            for tag in player_tags
        ]

        player_results = await asyncio.gather(*fetch_tasks)

    # Assemble enriched player data in parallel
    combined_results = await asyncio.gather(*[
        assemble_full_player_data(tag, raid_data, war_data, mongo_data, tag_to_legends)
        for tag, raid_data, war_data, mongo_data in player_results
    ])

    return {"items": remove_id_fields(combined_results)}


@router.get("/player/{player_tag}/extended", name="Get comprehensive stats for single player")
async def get_player_extended_stats(player_tag: str, request: Request, clan_tag: str = Query(None)):
    """Retrieve comprehensive data for a single player.
    
    Same as /players/extended but optimized for single player queries.
    Includes all tracking statistics, legends data, and war performance.
    Optional clan_tag parameter for clan-specific context.
    """
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
        tag, raid_data, war_data, mongo_data = await fetch_full_player_data(session, fixed_tag, mongo_data, clan_tag)

    player_data = await assemble_full_player_data(tag, raid_data, war_data, mongo_data, tag_to_legends)

    return remove_id_fields(player_data)


# ============================================================================
# LEGEND LEAGUE ENDPOINTS
# ============================================================================

@router.post("/players/legend-days", name="Get legend league statistics for multiple players")
async def get_players_legend_stats(body: PlayerTagsRequest, request: Request):
    """Retrieve legend league daily statistics for multiple players.
    
    Returns detailed legend league performance data including:
    - Daily trophy gains/losses by season
    - Attack and defense statistics
    - Ranking history and best finishes
    - Season-over-season performance trends
    """
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")
    return {"items": await get_legend_stats_common(body.player_tags)}


@router.post("/players/legend_rankings", name="Get historical legend league rankings for multiple players")
async def get_multiple_legend_rankings(body: PlayerTagsRequest, limit: int = 10):
    """Retrieve historical legend league rankings for multiple players.
    
    Returns each player's best legend league finishes with timestamps.
    Processes multiple players in parallel for efficient bulk queries.
    """
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


# ============================================================================
# ANALYTICS & STATISTICS ENDPOINTS
# ============================================================================

@router.post("/players/summary/{season}/top",
             name="Get top player statistics for a season")
async def players_season_leaderboard(season: str, request: Request, body: PlayerTagsRequest, limit: int = 10):
    """Generate season leaderboards for various player statistics.
    
    Creates ranked lists for multiple categories:
    - Resource earnings (gold, elixir, dark elixir)
    - Activity levels and attack wins
    - Donation statistics (given and received)
    - Capital gold contributions (donated and raided)
    - War performance (total stars earned)
    - Trophy progression for the season
    
    Returns top performers in each category with rankings.
    """
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


@router.post("/players/location",
             name="Get location data for multiple players")
async def player_location_list(request: Request, body: PlayerTagsRequest):
    """Retrieve geographic location information (country name/code) for a list of players.
    
    Returns country names and codes for players based on leaderboard data.
    Used for analytics and geographic distribution analysis.
    """
    player_tags = [fix_tag(tag) for tag in body.player_tags]
    location_info = await mongo.leaderboard_db.find(
        {'tag': {'$in': player_tags}},
        {'_id': 0, 'tag': 1, 'country_name': 1, 'country_code': 1}
    ).to_list(length=None)

    return {"items": remove_id_fields(location_info)}


# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================

@router.post("/players/sorted/{attribute}",
             name="Sort players by any attribute value")
async def player_sorted(attribute: str, request: Request, body: PlayerTagsRequest):
    """Sort a list of players by any attribute in descending order.
    
    Supports nested attributes (e.g., 'league.name') and achievement lookups.
    Special attribute 'cumulative_heroes' sums all home village hero levels.
    Returns players with their name, tag, clan, and the sorted attribute value.
    """
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