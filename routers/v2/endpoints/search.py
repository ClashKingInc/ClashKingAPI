
import coc
import re
import pendulum as pend

from fastapi import APIRouter, Query, Request, Depends, HTTPException
from utils.utils import fix_tag, check_authentication
from utils.database import MongoClient as mongo
from utils.dependencies import get_coc_client
from hashids import Hashids

router = APIRouter(prefix="/v2",tags=["Search"], include_in_schema=True)



@router.get("/search/clan",
         name="Search for a clan by name or tag")
async def search_clan(
        query: str = Query(default=""),
        request: Request = Request,
        user_id: int = 0,
        guild_id: int = 0,
        coc_client: coc.Client = Depends(get_coc_client)
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


@router.get("/search/{guild_id}/banned-players",
         name="Search for a banned player")
@check_authentication
async def search_banned_players(
        query: str = Query(default=""),
        guild_id: int = 0,
        request: Request = Request,
):
    query: str = re.escape(query)
    if query == '':
        docs = await mongo.banlist.find({'server': guild_id}, limit=25).to_list(length=25)
    else:
        docs = await mongo.banlist.find(
            {
                '$and': [
                    {'server': guild_id},
                    {'VillageName': {'$regex': f'^(?i).*{query}.*$'}},
                ]
            },
            limit=25,
        ).to_list(length=25)

    return {"items" : [{"tag": doc["VillageTag"], "name": doc.get("VillageName", "Missing")} for doc in docs]}


@router.post("/search/bookmark/{user_id}/{type}/{tag}",
         name="Add a bookmark for a clan or player for a user")
@check_authentication
async def bookmark_search(
        user_id: int,
        type: int,
        tag: str,
        request: Request = Request,
):
    tag = fix_tag(tag)
    type_field = {
        0: "player",
        1: "clan"
    }
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
@check_authentication
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

@router.post("/search/groups/create/{user_id}/{name}/{type}",
         name="Create a player or clan group")
@check_authentication
async def group_create(
        user_id: int,
        name: str,
        type: int,
        request: Request = Request,
):
    type_field = {
        0: "player",
        1: "clan"
    }
    group = await mongo.groups.find_one(
        {"$and" : [
            {"user_id": user_id},
            {"type": type_field.get(type)},
            {"name": name}
        ]},
        {"_id": 0}
    )
    if group:
        raise HTTPException(status_code=400, detail="Group already exists")
    hashids = Hashids(min_length=7)
    custom_id = hashids.encode(user_id + pend.now("UTC").int_timestamp)

    await mongo.groups.insert_one({
        "group_id" : custom_id,
        "user_id": user_id,
        "type" : type_field.get(type),
        "tags" : []
    })
    return {"success": True}


@router.post("/search/groups/{group_id}/add/{tag}",
         name="Add a player or clan to a group")
@check_authentication
async def group_add(
        group_id: str,
        tag: str,
        request: Request = Request,
):
    await mongo.groups.update_one(
        {"group_id": group_id},
        {"$addToSet": {"tags": fix_tag(tag)}}
    )
    return {"success": True}

@router.post("/search/groups/{group_id}/remove/{tag}",
         name="Remove a player or clan from a group")
@check_authentication
async def group_remove(
        group_id: str,
        tag: str,
        request: Request = Request,
):
    await mongo.groups.update_one(
        {"group_id": group_id},
        {"$pull": {"tags": fix_tag(tag)}}
    )
    return {"success": True}

@router.get("/search/groups/{group_id}",
         name="Get a specific group")
@check_authentication
async def group_get(
        group_id: str,
        request: Request = Request,
):
    group = await mongo.groups.find_one({"group_id": group_id}, {"_id" : 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("/search/groups/{user_id}/list",
         name="List groups for a user")
@check_authentication
async def group_list(
        user_id: int,
        request: Request = Request,
):
    groups = await mongo.groups.find({"user_id": user_id}, {"_id" : 0}).to_list(length=None)
    return {"items" : groups}


@router.delete("/search/groups/{group_id}",
         name="Delete a specific group")
@check_authentication
async def group_delete(
        group_id: int,
        request: Request = Request,
):
    await mongo.groups.delete_one({"group_id": group_id})
    return {"success": True}
