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



@router.get("/search/clan",
         name="Search for a clan by name or tag")
async def search_clan(
        query: str = Query(default=""),
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
        if len(query) <= 1:
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
        if result.get("tag") in bookmarked_tags:
            find_type = "bookmarked"
        elif result.get("tag") in recent_tags:
            find_type = "recent_search"
        else:
            find_type = "guild_search"

        final_data.append({
            "name" : result.get("name") or "Not Stored",
            "tag" : result.get("tag"),
            "memberCount" : result.get("members") or 0,
            "level" : result.get("level") or 0,
            "warLeague" : result.get("warLeague") or "Unranked",
            "type" : find_type
        })
        all_tags.remove(result.get("tag"))

    for tag in all_tags:
        try:
            clan = await coc_client.get_clan(tag=tag)
        except Exception:
            continue
        if tag in bookmarked_tags:
            find_type = "bookmarked"
        elif tag in recent_tags:
            find_type = "recent_search"
        else:
            find_type = "guild_search"
        final_data.append({
            "name" : clan.name,
            "tag" : clan.tag,
            "memberCount" : clan.member_count,
            "level" : clan.level,
            "warLeague" : clan.war_league.name,
            "type" : find_type
        })

    final_data = [
        data for data in final_data
        if query.lower() in data.get("name").lower() or
        query.lower() == data.get("tag").lower()
    ]
    tags_found = {d.get("tag") for d in final_data}

    if len(final_data) < 25 and len(query) >= 3:
        clan = None
        if coc.utils.is_valid_tag(query):
            try:
                clan = await coc_client.get_clan(tag=query)
            except:
                pass
        if clan is None:
            results = await coc_client.search_clans(name=query, limit=10)
            for clan in results:
                if clan.tag in tags_found:
                    continue
                final_data.append({
                    "name": clan.name,
                    "tag": clan.tag,
                    "memberCount": clan.member_count,
                    "level": clan.level,
                    "warLeague": clan.war_league.name,
                    "type": "search_result"
                })
                '''league = str(clan.war_league).replace('League ', '')
                clan_list.append(f'{clan.name} | {clan.member_count}/50 | LV{clan.level} | {league} | {clan.tag}')'''
        else:
            final_data.append({
                "name": clan.name,
                "tag": clan.tag,
                "memberCount": clan.member_count,
                "level": clan.level,
                "warLeague": clan.war_league.name,
                "type": "search_result"
            })

    type_order = {
        "recent_search": 0,
        "bookmarked": 1,
        "guild_search": 2,
        "search_result": 3
    }
    final_data.sort(key=lambda x: type_order.get(x["type"], 99))

    return {"items" : final_data}



@router.post("/search/bookmark/{user_id}/{type}/{tag}",
         name="Add a bookmark for a clan or player for a user")
async def bookmark_search(
        user_id: int,
        type: int,
        tag: str,
        request: Request = Request,
):
    tag = fix_tag(tag)
    # First, remove the tag if it exists
    await mongo.user_settings.update_one(
        {"discord_user": user_id},
        {"$pull": {"search.clan.bookmarked": tag}}
    )

    # Then, push the new tag to the front while keeping only the last 20 items
    await mongo.user_settings.update_one(
        {"discord_user": user_id},
        {"$push": {"search.clan.bookmarked": {"$each": [tag], "$position": 0, "$slice": 20}}}
    )
    return {"success": True}


@router.post("/search/recent/{user_id}/{type}/{tag}",
         name="Add a recent search for a clan or player for a user")
async def recent_search(
        user_id: int,
        type: int,
        tag: str,
        request: Request = Request,
):

    type_field = {
        0: "player",
        1: "clan"
    }
    tag = fix_tag(tag)
    # First, remove the tag if it exists
    await mongo.user_settings.update_one(
        {"discord_user": user_id},
        {"$pull": {"search.clan.recent": tag}}
    )

    # Then, push the new tag to the front while keeping only the last 20 items
    await mongo.user_settings.update_one(
        {"discord_user": user_id},
        {"$push": {f"search.{type_field.get(type)}.recent": {"$each": [tag], "$position": 0, "$slice": 20}}}
    )
    return {"success": True}
