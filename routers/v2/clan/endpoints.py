
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from utils.utils import fix_tag, remove_id_fields
from utils.time import gen_season_date, gen_raid_date
from utils.database import MongoClient as mongo
from routers.v2.player.models import PlayerTagsRequest

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
                sum(player.get(f'capital_gold', {}).get(f'{date}', {}).get('donate', []))
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












