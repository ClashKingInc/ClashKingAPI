
import coc
import pendulum as pend
from collections import defaultdict

from fastapi import APIRouter, Query, Request, Depends, HTTPException, Path
from utils.utils import fix_tag, remove_id_fields
from utils.dependencies import get_coc_client

from utils.time import gen_season_date, gen_raid_date
from utils.database import MongoClient as mongo
from routers.v2.clan.clan_models import PlayerTagsRequest

router = APIRouter(prefix="/v2",tags=["Clan"], include_in_schema=True)


@router.get("/clan/{clan_tag}/ranking",
             name="Get ranking of a clan")
async def clan_ranking(clan_tag: str, request: Request):
    clan_ranking = await mongo.clan_leaderboard_db.find_one({'tag': fix_tag(clan_tag)})

    fallback = {
        "tag": "#L0J9RURP",
        "global_rank": None,
        "country_code": None,
        "country_name": None,
        "local_rank": None
    }

    return remove_id_fields(clan_ranking) or fallback


@router.get("/clan/{clan_tag}/board/totals")
async def clan_board_totals(clan_tag: str, request: Request, body: PlayerTagsRequest):
    if not body.player_tags:
        raise HTTPException(status_code=400, detail="player_tags cannot be empty")

    player_tags = [fix_tag(tag) for tag in body.player_tags]
    previous_season, season = gen_season_date(num_seasons=2)

    player_stats = await mongo.player_stats.find(
        {'tag': {'$in': player_tags}},
        {"tag" : 1, "capital_gold" : 1, "last_online_times" : 1}
    ).to_list(length=None)

    clan_stats = await mongo.clan_stats.find_one({'tag': fix_tag(clan_tag)})

    clan_games_points = 0
    total_donated = 0
    total_received = 0
    if clan_stats:
        for s in [season, previous_season]:
            for tag, data in clan_stats.get(s, {}).items():
                #i forget why, but it can be None sometimes, so fallover to zero if that happens
                clan_games_points += data.get('clan_games', 0) or 0
            if clan_games_points != 0:
                #if it is zero, likely means CG hasn't happened this season, so check the previous
                #eventually add a real check
                break
        for tag, data in clan_stats.get(season, {}).items():
            total_donated += data.get('donated', 0)
            total_received += data.get('received', 0)

    donated_cc = 0
    for date in gen_raid_date(num_weeks=4):
        donated_cc += sum(
            [
                sum(player.get('capital_gold', {}).get(f'{date}', {}).get('donate', []))
                for player in player_stats
            ]
        )

    now = pend.now(tz=pend.UTC)
    thirty_days_ago = now.subtract(days=30)
    forty_eight_hours_ago = now.subtract(hours=48)

    time_add = defaultdict(set)
    recent_active = set()

    for player in player_stats:
        for season_key in [season, previous_season]:
            for timestamp in player.get('last_online_times', {}).get(season_key, []):
                date = pend.from_timestamp(timestamp)

                # Only keep dates within the last 30 days
                if date >= thirty_days_ago:
                    time_add[date.date()].add(player.get("tag"))

                # Track players active in the last 48 hours
                if date >= forty_eight_hours_ago:
                    recent_active.add(player.get("tag"))

    num_players_day = [len(players) for players in time_add.values()]
    total_players = sum(num_players_day)
    avg_players = int(total_players / len(num_players_day)) if num_players_day else 0
    total_active_48h = len(recent_active)

    return {
        "tag": clan_tag,
        "tracked_player_count": len(player_stats),
        "clan_games_points": clan_games_points,
        "troops_donated": total_donated,
        "troops_received": total_received,
        "clan_capital_donated": donated_cc,
        "activity" : {
            "per_day": avg_players,
            "last_48h": total_active_48h,
            "score": total_players
        }
    }


@router.get("/clan/{clan_tag}/donations/{season}",
             name="Get donations for a clan's members in a specific season")
async def clan_donations(clan_tag: str, season: str, request: Request):
    clan_stats = await mongo.clan_stats.find_one({'tag': fix_tag(clan_tag)}, projection={'_id': 0, f'{season}': 1})
    clan_season_donations = clan_stats.get(season, {})

    items = []
    for tag, data in clan_season_donations.items():
        items.append({
            "tag" : tag,
            "donated" : data.get('donated', 0),
            "received" : data.get('received', 0)
        })
    return {"items": items}


@router.get("/clan/compo",
             name="Get composition of a clan or clans")
async def clan_compo(
        request: Request,
        clan_tags: list[str] = Query(..., min_length=1, max_length=100),
        coc_client: coc.Client = Depends(get_coc_client)
):
    clans = []
    async for clan in coc_client.get_clans(tags=clan_tags):
        clans.append(clan)

    member_tags = [m.tag for clan in clans for m in clan.members]

    location_info = await mongo.leaderboard_db.find(
        {'tag': {'$in': member_tags}},
        {'_id': 0, 'tag': 1, 'country_name': 1, 'country_code': 1}
    ).to_list(length=None)

    tag_to_location = {x.get("tag") : x for x in location_info}

    country_map = {x.get("country_code") : x.get("country_name") for x in location_info}

    buckets = {
        "townhall" : defaultdict(int),
        "trophies" : defaultdict(int),
        "location" : defaultdict(int),
        "role" : defaultdict(int),
        "league" : defaultdict(int),
        "country_map" : country_map,
        "total_members" : len(member_tags),
        "clan_count" : len(clans)
    }

    if len(clans) == 1:
        buckets["clan"] = clans[0]._raw_data

    for clan in clans:
        for member in clan.members:
            buckets["townhall"][member.town_hall] += 1 if member.town_hall != 0 else 0

            if member.trophies >= 1000:
                buckets["trophies"][str((member.trophies // 1000) * 1000)] += 1
            else:
                buckets["trophies"]['100'] += 1

            if member.tag in tag_to_location:
                location = tag_to_location[member.tag]
                if location.get("country_code") is not None:
                    buckets["location"][(location.get("country_code"))] += 1

            buckets["role"][member.role.in_game_name] += 1
            buckets["league"][member.league.name] += 1

    return buckets


@router.get("/clan/donations/{season}",
             name="Get donations of a clan or clans")
async def clan_donations(
        request: Request,
        season: str = Path(description="Season to get donations for"),
        clan_tags: list[str] = Query(..., min_length=1, max_length=100),
        only_current_members: bool = Query(False, description="Only include members currently in the clan"),
        coc_client: coc.Client = Depends(get_coc_client)
):
    clan_tags = [fix_tag(t) for t in clan_tags]
    pipeline = [
        {"$match": {"clan_tag": {"$in": clan_tags}, "$or": [
                    {"donated": {"$ne": None}},
                    {"received": {"$ne": None}}
                ]
            }},
        {"$group": {
            "_id": "$tag",
            "donated": {"$sum": {"$ifNull": ["$donated", 0]}},
            "received": {"$sum": {"$ifNull": ["$received", 0]}},
        }},
        {"$project": {
            "_id": 0,
            "tag": "$_id",
            "donated": 1,
            "received": 1
        }}
    ]
    stats = await mongo.new_player_stats.aggregate(pipeline).to_list(length=None)
    return stats




















