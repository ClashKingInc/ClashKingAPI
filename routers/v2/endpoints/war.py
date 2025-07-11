
import coc
import pendulum as pend
from collections import defaultdict
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from utils.utils import fix_tag, remove_id_fields
from utils.database import MongoClient as mongo

from routers.v2.utils.war import calculate_war_stats, deconstruct_type

router = APIRouter(prefix="/v2",tags=["War"], include_in_schema=True)



@router.get("/war/{clan_tag}/previous",
         tags=["War Endpoints"],
         name="Previous Wars for a clan")
async def war_previous(
        clan_tag: str,
        request: Request = Request,
        timestamp_start: int = 0,
        timestamp_end: int = 9999999999,
        include_cwl: bool = False,
        limit: int = 50,
):
    clan_tag = fix_tag(clan_tag)
    START = pend.from_timestamp(timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    query = {
        "$and": [
            {"$or": [{"data.clan.tag": clan_tag}, {"data.opponent.tag": clan_tag}]},
            {"data.preparationStartTime": {"$gte": START}},
            {"data.preparationStartTime": {"$lte": END}}
        ]
    }

    if not include_cwl:
        query["$and"].append({"data.season": None})

    full_wars = await mongo.clan_wars.find(query).sort("data.endTime", -1).limit(limit).to_list(length=None)

    #early on we had some duplicate wars, so just filter them out
    found_ids = set()
    new_wars = []
    for war in full_wars:
        id = war.get("data").get("preparationStartTime")
        if id in found_ids:
            continue
        war.pop("_response_retry", None)
        new_wars.append(war.get("data"))
        found_ids.add(id)

    return remove_id_fields({"items" : new_wars})



@router.get("/cwl/{clan_tag}/ranking-history", name="CWL ranking history for a clan")
async def cwl_ranking_history(clan_tag: str, request: Request):
    clan_tag = fix_tag(clan_tag)

    # Fetch all CWL group documents containing the clan
    results = await mongo.cwl_groups.find({"data.clans.tag": clan_tag}, {"data.clans" : 0}).to_list(length=None)
    if not results:
        raise HTTPException(status_code=404, detail="No CWL Data Found")

    # Get league changes for the clan
    clan_data = await mongo.basic_clan.find_one({"tag": clan_tag}, {"changes.clanWarLeague": 1})
    cwl_changes = clan_data.get("changes", {}).get("clanWarLeague", {})

    # Collect all war tags across all CWL results (across all seasons)
    all_war_tags = set()
    for cwl_result in results:
        rounds = cwl_result["data"].get("rounds", [])
        for rnd in rounds:
            for tag in rnd.get("warTags", []):
                if tag:
                    all_war_tags.add(tag)

    # Fetch all war documents in one go using the union of war tags
    if all_war_tags:
        matching_wars_data = await mongo.clan_wars.find({
            "data.tag": {"$in": list(all_war_tags)}
        },
        {"data.clan.members" : 0, "data.opponent.members" : 0}
        ).to_list(length=None)
        # Build a lookup dictionary keyed by war tag
        war_lookup = {w["data"]["tag"]: w["data"] for w in matching_wars_data}
    else:
        war_lookup = {}

    ranking_results = []
    for cwl_result in results:
        season = cwl_result["data"].get("season")
        rounds = cwl_result["data"].get("rounds", [])

        # Replace each war tag with the corresponding war data,
        # but only include wars that match the current season.
        for rnd in rounds:
            rnd["warTags"] = [
                war_lookup.get(tag)
                for tag in rnd.get("warTags", [])
                if war_lookup.get(tag) and war_lookup.get(tag).get("season") == season
            ]

        cwl_data = cwl_result["data"]
        cwl_data["rounds"] = rounds
        ranking = ranking_create(data=cwl_data)

        # Get the ranking for our clan tag along with its index (place)
        ranking_data = next(
            (
                {'rank': idx, **item}
                for idx, item in enumerate(ranking, start=1)
                if item["tag"] == clan_tag
            ),
            None
        )
        if ranking_data is None:
            continue

        # Calculate season offset and check league changes
        season_offset = pend.date(
            year=int(season[:4]),
            month=int(season[-2:]),
            day=1
        ).subtract(months=1).strftime('%Y-%m')
        if season_offset not in cwl_changes:
            continue

        league = cwl_changes[season_offset].get("league")
        ranking_results.append({"season": season, "league": league, **ranking_data})

    return {"items": sorted(ranking_results, key=lambda x: x["season"], reverse=True)}


@router.get("/cwl/league-thresholds", name="Promo and demotion thresholds for CWL leagues")
async def cwl_league_thresholds(request: Request):
    return {
      "items": [
        {
          "id": 48000001,
          "name": "Bronze League III",
          "promo" : 3,
          "demote" : 9
        },
        {
          "id": 48000002,
          "name": "Bronze League II",
          "promo" : 3,
          "demote" : 8
        },
        {
          "id": 48000003,
          "name": "Bronze League I",
          "promo" : 3,
          "demote" : 8
        },
        {
          "id": 48000004,
          "name": "Silver League III",
          "promo" : 2,
          "demote" : 8
        },
        {
          "id": 48000005,
          "name": "Silver League II",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000006,
          "name": "Silver League I",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000007,
          "name": "Gold League III",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000008,
          "name": "Gold League II",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000009,
          "name": "Gold League I",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000010,
          "name": "Crystal League III",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000011,
          "name": "Crystal League II",
          "promo" : 2,
          "demote" : 7
        },
        {
          "id": 48000012,
          "name": "Crystal League I",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000013,
          "name": "Master League III",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000014,
          "name": "Master League II",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000015,
          "name": "Master League I",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000016,
          "name": "Champion League III",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000017,
          "name": "Champion League II",
          "promo" : 1,
          "demote" : 7
        },
        {
          "id": 48000018,
          "name": "Champion League I",
          "promo" : 0,
          "demote" : 6
        }
      ]
    }

def ranking_create(data: dict):
    # Initialize accumulators
    star_dict = defaultdict(int)
    dest_dict = defaultdict(int)
    tag_to_name = {}
    rounds_won = defaultdict(int)
    rounds_lost = defaultdict(int)
    rounds_tied = defaultdict(int)

    for rnd in data.get("rounds", []):
        for war in rnd.get("warTags", []):
            if war is None:
                continue

            war_obj = coc.ClanWar(data=war, client=None)
            status = str(war_obj.status)
            if status == "won":
                rounds_won[war_obj.clan.tag] += 1
                rounds_lost[war_obj.opponent.tag] += 1
                star_dict[war_obj.clan.tag] += 10
            elif status == "lost":
                rounds_won[war_obj.opponent.tag] += 1
                rounds_lost[war_obj.clan.tag] += 1
                star_dict[war_obj.opponent.tag] += 10
            else:
                rounds_tied[war_obj.clan.tag] += 1
                rounds_tied[war_obj.opponent.tag] += 1

            tag_to_name[war_obj.clan.tag] = war_obj.clan.name
            tag_to_name[war_obj.opponent.tag] = war_obj.opponent.name

            for clan in [war_obj.clan, war_obj.opponent]:
                star_dict[clan.tag] += clan.stars
                dest_dict[clan.tag] += clan.destruction

    # Create a list of stats per clan for sorting
    star_list = []
    for tag, stars in star_dict.items():
        destruction = dest_dict[tag]
        name = tag_to_name.get(tag, "")
        star_list.append([name, tag, stars, destruction])

    # Sort descending by stars then destruction
    sorted_list = sorted(star_list, key=lambda x: (x[2], x[3]), reverse=True)
    return [
        {
            "name": x[0],
            "tag": x[1],
            "stars": x[2],
            "destruction": x[3],
            "rounds": {
                "won": rounds_won.get(x[1], 0),
                "tied": rounds_tied.get(x[1], 0),
                "lost": rounds_lost.get(x[1], 0)
            }
        }
        for x in sorted_list
    ]


@router.get("/war/clan/stats")
async def clan_war_stats(
        request: Request,
        clan_tags: list[str] = Query(..., min_length=1),
        timestamp_start: int = 0,
        timestamp_end: int = 9999999999,
        war_types: int = 7,
        townhall_filter: str = "all",
        limit: int = 1000
):
    clan_tags = [fix_tag(tag=tag) for tag in clan_tags]

    START = pend.from_timestamp(timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    first_match = {"$or": [{"data.clan.tag": {"$in" : clan_tags}}, {"data.opponent.tag": {"$in" : clan_tags}}]}

    query = {
        "$and": [
            first_match,
            {"data.preparationStartTime": {"$gte": START}},
            {"data.preparationStartTime": {"$lte": END}}
        ]
    }


    pipeline = [
        {"$match": query},
        {"$unset": ["_id"]},
        {"$sort": {"endTime": -1}},
        {"$project": {"data": "$data"}},
        {"$limit": limit}
    ]

    if war_types != 7:
        war_types: list[int] = deconstruct_type(war_types)
        check = []
        if 1 in war_types:
            check.append({"type": "random"})

        if 2 in war_types:
            check.append({"type": "friendly"})

        if 4 in war_types:
            check.append({"data.tag": {"$ne": None}})

        pipeline.insert(1, {"$match" : {"$or": check}})

    wars = await mongo.clan_wars.aggregate(pipeline, allowDiskUse=True).to_list(length=None)

    return await calculate_war_stats(
        wars=wars, clan_tags=set(clan_tags),
        townhall_filter=townhall_filter
    )

