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
async def war_previous(
        query: str,
        request: Request = Request,
        user_id: int = 0,
        guild_id: int = 0,
):

    if not query:
        recent_tags = []
        bookmarked = []
        if user_id:
            result = await mongo.user_settings.find_one(
                {"discord_user": user_id},
                {"search.clan": 1, "_id": 0}
            )
            recent_tags = result.get("search", {}).get("clan", {}).get("recent", [])
            bookmarked_tags = result.get("search", {}).get("clan", {}).get("bookmarked", [])



    if ctx.guild is None:
        last_record = await self.bot.command_stats.find_one(
            {'$and': [{'user': ctx.user.id}, {'server': {'$ne': None}}]}, sort=[('time', -1)]
        )
        guild_id = 0
        if last_record:
            guild_id = last_record.get('server')
    else:
        guild_id = ctx.guild.id

    """
    for an empty query return:
    - 5 most recent queries
    - up to 20 bookmarks
    """


    clan_list = []
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
        clan_list.append(f'{document.get("name")} | {document.get("tag")}')

    if clan_list == [] and len(query) >= 3:
        clan = None
        if coc.utils.is_valid_tag(query):
            try:
                clan = await coc_client.get_clan(tag=query)
            except:
                pass
        if clan is None:
            results = await coc_client.search_clans(name=query, limit=10)
            for clan in results:
                league = str(clan.war_league).replace('League ', '')
                clan_list.append(f'{clan.name} | {clan.member_count}/50 | LV{clan.level} | {league} | {clan.tag}')
        else:
            clan_list.append(f'{clan.name} | {clan.tag}')
            return clan_list
    return clan_list[:25]


