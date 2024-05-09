
import coc
import operator
import pendulum as pend
from collections import defaultdict
from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from slowapi import Limiter
from slowapi.util import get_remote_address
from utils.utils import fix_tag, db_client, gen_season_date
from datetime import datetime, timedelta

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["War Endpoints"])



@router.get("/war/{clan_tag}/previous",
         tags=["War Endpoints"],
         name="Previous Wars for a clan")
@cache(expire=300)
@limiter.limit("30/second")
async def war_previous(clan_tag: str, request: Request, response: Response,  timestamp_start: int = 0, timestamp_end: int = 9999999999, limit: int= 50):
    clan_tag = fix_tag(clan_tag)
    START = pend.from_timestamp(timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    full_wars = await db_client.clan_wars.find({"$and" : [
        {"$or" : [{"data.clan.tag" : clan_tag}, {"data.opponent.tag" : clan_tag}]},
        {"data.preparationStartTime" : {"$gte" : START}},
        {"data.preparationStartTime" : {"$lte" : END}}
    ]}).to_list(length=None)
    found_ids = set()
    new_wars = []
    for war in full_wars:
        id = war.get("data").get("preparationStartTime")
        if id in found_ids:
            continue
        try:
            del war["_response_retry"]
        except:
            pass
        new_wars.append(war.get("data"))
        found_ids.add(id)

    actual_results = sorted(new_wars, key=lambda x: x.get("endTime", 0), reverse=True)
    return actual_results[:limit]


@router.get("/war/{clan_tag}/previous/{end_time}",
         tags=["War Endpoints"],
         name="Previous War at an endtime, for a clan")
@cache(expire=300)
@limiter.limit("30/second")
async def war_previous_time(clan_tag: str, end_time: str, request: Request, response: Response):
    end_time = coc.Timestamp(data=end_time).time.replace(tzinfo=pend.UTC)
    lower_end_time = end_time - timedelta(minutes=2)
    higher_end_time = end_time + timedelta(minutes=2)

    clan_tag = fix_tag(clan_tag)
    war = await db_client.clan_wars.find_one({"$and" : [{"$or" : [{"data.clan.tag" : clan_tag}, {"data.opponent.tag" : clan_tag}]},
                                                        {"data.endTime" : {"$gte" : lower_end_time.strftime('%Y%m%dT%H%M%S.000Z')}},
                                                        {"data.endTime" : {"$lte" : higher_end_time.strftime('%Y%m%dT%H%M%S.000Z')}}]})
    if war is None:
        raise HTTPException(status_code=404, detail="War Not Found")
    return war.get("data", {})



@router.get("/war/{clan_tag}/basic",
         tags=["War Endpoints"],
         name="Basic War Info, Bypasses Private War Log if Possible")
@cache(expire=300)
@limiter.limit("30/second")
async def basic_war_info(clan_tag: str, request: Request, response: Response):
    now = datetime.utcnow().timestamp() - 183600
    result = await db_client.clan_wars.find_one({"$and" : [{"clans" : fix_tag(clan_tag)}, {"custom_id": None}, {"endTime" : {"$gte" : now}}]})
    if result is not None:
        del result["_id"]
    return result



@router.get("/cwl/{clan_tag}/group",
         tags=["War Endpoints"],
         name="Cwl group info for a clan for current season")
@cache(expire=300)
@limiter.limit("30/second")
async def cwl_group(clan_tag: str, request: Request, response: Response):
    clan_tag = fix_tag(clan_tag)
    season = gen_season_date()
    cwl_result = await db_client.cwl_groups.find_one({"$and" : [{"data.clans.tag" : clan_tag}, {"data.season" : season}]}, {"_id":0})
    return cwl_result



@router.get("/cwl/{clan_tag}/{season}",
         tags=["War Endpoints"],
         name="Cwl Info for a clan in a season (yyyy-mm)")
@cache(expire=300)
@limiter.limit("30/second")
async def cwl(clan_tag: str, season: str, request: Request, response: Response):
    clan_tag = fix_tag(clan_tag)
    cwl_result = await db_client.cwl_groups.find_one({"$and" : [{"data.clans.tag" : clan_tag}, {"data.season" : season}]})

    if cwl_result is None:
        raise HTTPException(status_code=404, detail="No CWL Data Found")
    rounds = cwl_result.get("data").get("rounds")
    war_tags = []
    for round in rounds:
        for tag in round.get("warTags"):
            war_tags.append(tag)
    matching_wars = await db_client.clan_wars.find({"$and" : [{"data.tag" : {"$in" : war_tags}}, {"data.season" : season}]}).to_list(length=None)
    matching_wars = {w.get("data").get("tag") : w.get("data") for w in matching_wars}
    for r_count, round in enumerate(rounds):
        for count, tag in enumerate(round.get("warTags")):
            rounds[r_count].get("warTags")[count] = matching_wars.get(tag)
    cwl_result = cwl_result["data"]
    cwl_result["rounds"] = rounds
    cwl_result["clan_rankings"] = ranking_create(data=cwl_result)
    return cwl_result
    


def ranking_create(data: dict):

    star_dict = defaultdict(int)
    dest_dict = defaultdict(int)
    tag_to_name = defaultdict(str)
    rounds_won = defaultdict(int)
    rounds_lost = defaultdict(int)
    rounds_tied = defaultdict(int)

    for round in data.get("rounds"):
        for war in round.get("warTags"):
            war = coc.ClanWar(data=war, client=None)
            if str(war.status) == "won":
                rounds_won[war.clan.tag] += 1
                rounds_lost[war.opponent.tag] += 1
                star_dict[war.clan.tag] += 10
            elif str(war.status) == "lost":
                rounds_won[war.opponent.tag] += 1
                rounds_lost[war.clan.tag] += 1
                star_dict[war.opponent.tag] += 10
            else:
                rounds_tied[war.clan.tag] += 1
                rounds_tied[war.opponent.tag] += 1

            tag_to_name[war.clan.tag] = war.clan.name
            tag_to_name[war.opponent.tag] = war.opponent.name
            on_each_player = {}
            for player in war.members:
                for attack in player.attacks:
                    if on_each_player.get(attack.defender_tag) is None:
                        on_each_player[attack.defender_tag] = (attack, player.clan.tag)
                    else:
                        prev, clan_tag = on_each_player.get(attack.defender_tag)
                        if attack.stars > prev.stars or (attack.stars == prev.stars and attack.destruction > prev.destruction):
                            on_each_player[attack.defender_tag] = (attack, player.clan.tag)

            for attack, clan_tag in on_each_player.values():
                star_dict[clan_tag] += attack.stars
                dest_dict[clan_tag] += attack.destruction

    star_list = []
    for tag, stars in star_dict.items():
        destruction = dest_dict[tag]
        name = tag_to_name[tag]
        star_list.append([name, tag, stars, destruction])

    sorted_list = sorted(star_list, key=operator.itemgetter(2, 3), reverse=True)
    return  [{"name" : x[0], "tag" : x[1], "stars": x[2], "destruction" : x[3],
              "rounds" : {"won" : rounds_won.get(x[1], 0), "tied" : rounds_tied.get(x[1], 0), "lost" : rounds_lost.get(x[1], 0)}} for x in sorted_list]

