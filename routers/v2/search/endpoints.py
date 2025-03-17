import operator

import coc
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request, Depends
from utils.utils import fix_tag, remove_id_fields, coc_client
from utils.time import gen_season_date, gen_raid_date
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

router = APIRouter(prefix="/v2",tags=["Search"], include_in_schema=True)



@router.get("/search/clan/{query}",
         name="Search for a clan by name or tag")
async def search_clan(
        query: str,
        request: Request = Request,
        user_id: int = 0,
        guild_id: int = 0,
):

    recent_tags = []
    bookmarked_tags = []
    if user_id:
        result = await mongo.user_settings.find_one(
            {"discord_user": user_id},
            {"search.clan": 1, "_id": 0}
        )
        recent_tags = result.get("search", {}).get("clan", {}).get("recent", [])
        bookmarked_tags = result.get("search", {}).get("clan", {}).get("bookmarked", [])

    """
    for an empty query return:
    - 5 most recent queries
    - up to 20 bookmarks
    """

    guild_clans = []
    if guild_id:
        if query == '':
            pipeline = [
                {'$match': {'server': guild_id}},
                {'$sort': {'name': 1}},
                {'$limit': 25},
            ]
        else:
            pipeline = [
                {
                    '$search': {
                        'index': 'clan_name',
                        'autocomplete': {
                            'query': query,
                            'path': 'name',
                        },
                    }
                },
                {'$match': {'server': guild_id}},
            ]
        results = await mongo.clan_db.aggregate(pipeline=pipeline).to_list(length=None)
        for document in results:
            guild_clans.append(document.get("tag"))

    all_tags = set(recent_tags + bookmarked_tags + guild_clans)

    local_search = await mongo.basic_clan.find(
        {"tag": {"$in": list(all_tags)}},
        {"name": 1, "tag": 1, "members": 1, "level" : 1, "warLeague" : 1}
    ).to_list(length=None)

    final_data = []
    for result in local_search:
        final_data.append({
            "name" : result.get("name") or "Not Stored",
            "tag" : result.get("tag"),
            "memberCount" : result.get("members") or 0,
            "level" : result.get("level") or 0,
            "warLeague" : result.get("warLeague") or "Unranked"
        })
        all_tags.remove(result.get("tag"))

    for tag in all_tags:
        try:
            clan = await coc_client.get_clan(tag=tag)
        except Exception:
            continue
        final_data.append({
            "name" : clan.name,
            "tag" : clan.tag,
            "memberCount" : clan.member_count,
            "level" : clan.level,
            "warLeague" : clan.war_league.name
        })

    if not final_data and len(query) >= 3:
        clan = None
        if coc.utils.is_valid_tag(query):
            try:
                clan = await coc_client.get_clan(tag=query)
            except:
                pass
        if clan is None:
            results = await coc_client.search_clans(name=query, limit=10)
            for clan in results:
                final_data.append({
                    "name": clan.name,
                    "tag": clan.tag,
                    "memberCount": clan.member_count,
                    "level": clan.level,
                    "warLeague": clan.war_league.name
                })
                '''league = str(clan.war_league).replace('League ', '')
                clan_list.append(f'{clan.name} | {clan.member_count}/50 | LV{clan.level} | {league} | {clan.tag}')'''
        else:
            final_data.append({
                "name": clan.name,
                "tag": clan.tag,
                "memberCount": clan.member_count,
                "level": clan.level,
                "warLeague": clan.war_league.name
            })
    return final_data


