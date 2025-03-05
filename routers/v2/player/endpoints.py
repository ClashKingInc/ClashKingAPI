import asyncio

import aiohttp
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from utils.utils import fix_tag, remove_id_fields
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2", tags=["Player"], include_in_schema=True)


@router.post("/players/location",
             name="Get locations for a list of players")
async def player_location_list(request: Request, body: PlayerTagsRequest):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

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
        {'_id': 0, 'tag' : 1, 'donations': 1, 'legends': 1, 'clan_games': 1, 'season_pass': 1, 'activity': 1,
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
        combined_results.append(player_data)

    return {"items": remove_id_fields(combined_results)}
