
import asyncio
import coc
import aiohttp
import pendulum as pend
import linkd
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Query, Request, HTTPException, Path, Depends
from utils.utils import fix_tag, remove_id_fields
from utils.time_utils import gen_season_date, gen_raid_date, season_start_end
from utils.database import MongoClient
from routers.v2.clan.models import PlayerTagsRequest, ClanTagsRequest, JoinLeaveQueryParams, RaidsRequest
from routers.v2.clan.utils import (
    generate_stats,
    generate_raids_clan_stats,
    predict_rewards,
    PLAYER_TAGS_EMPTY,
    CLAN_TAGS_EMPTY,
    ERROR_FETCHING_DATA,
    calculate_clan_games_points,
    calculate_donations,
    calculate_capital_donations,
    calculate_activity_stats,
    build_join_leave_query,
    apply_join_leave_filters,
    get_default_programmatic_filters,
    build_programmatic_join_leave_query,
    apply_programmatic_filters,
    process_member_buckets,
    create_join_leave_filters
)

router = APIRouter(prefix="/v2",tags=["Clan"], include_in_schema=True)


@router.get("/clan/{clan_tag}/ranking",
             name="Get ranking of a clan")
async def clan_ranking(clan_tag: str):
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
async def clan_board_totals(clan_tag: str, _request: Request, body: PlayerTagsRequest):
    """Get aggregated board totals for a clan.

    Includes clan games, donations, capital contributions, and activity stats.

    Args:
        clan_tag: Clan tag
        _request: FastAPI request (not used)
        body: Request body with player tags list

    Returns:
        Dict with totals for clan games, donations, and activity

    Raises:
        HTTPException: 400 if player_tags is empty
    """
    if not body.player_tags:
        raise HTTPException(status_code=400, detail=PLAYER_TAGS_EMPTY)

    player_tags = [fix_tag(tag) for tag in body.player_tags]
    previous_season, season = gen_season_date(num_seasons=2)

    # Fetch player stats
    player_stats = await mongo.player_stats.find(
        {'tag': {'$in': player_tags}},
        {"tag": 1, "capital_gold": 1, "last_online_times": 1}
    ).to_list(length=None)

    # Fetch clan stats
    clan_stats = await mongo.clan_stats.find_one({'tag': fix_tag(clan_tag)})

    # Calculate all metrics using helpers
    clan_games_points = calculate_clan_games_points(clan_stats, season, previous_season)
    donations_data = calculate_donations(clan_stats, season)
    donated_cc = calculate_capital_donations(player_stats, gen_raid_date(num_weeks=4))
    activity = calculate_activity_stats(player_stats, season, previous_season)

    return {
        "tag": clan_tag,
        "tracked_player_count": len(player_stats),
        "clan_games_points": clan_games_points,
        "troops_donated": donations_data["total_donated"],
        "troops_received": donations_data["total_received"],
        "clan_capital_donated": donated_cc,
        "activity": activity
    }


@router.get("/clan/{clan_tag}/donations/{season}",
             name="Get donations for a clan's members in a specific season")
async def clan_donations(clan_tag: str, season: str):
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
@linkd.ext.fastapi.inject
async def clan_compo(
        _request: Request,
        clan_tags: list[str] = Query(..., min_length=1, max_length=100),
        *,
        coc_client: coc.Client
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

    # Process all members using helper
    for clan in clans:
        for member in clan.members:
            member_data = process_member_buckets(member, tag_to_location)

            if member_data["townhall"] is not None:
                buckets["townhall"][member_data["townhall"]] += 1

            buckets["trophies"][member_data["trophies"]] += 1

            if member_data["location"] is not None:
                buckets["location"][member_data["location"]] += 1

            buckets["role"][member_data["role"]] += 1
            buckets["league"][member_data["league"]] += 1

    return buckets


@router.get("/clan/donations/{season}",
             name="Get donations of a clan or clans")
async def clan_donations(
        season: str = Path(description="Season to get donations for"),
        clan_tags: list[str] = Query(..., min_length=1, max_length=100)
):
    clan_tags = [fix_tag(t) for t in clan_tags]
    pipeline = [
        {"$match": {
            "clan_tag": {"$in": clan_tags},
            "season": season,
            "$or": [
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
    cursor = await mongo.new_player_stats.aggregate(pipeline)
    stats = await cursor.to_list(length=None)
    return stats


@router.post("/clans/details", name="Get full stats for a list of clans")
async def get_clans_stats(body: ClanTagsRequest):
    """Retrieve Clash of Clans account details for a list of clans."""

    if not body.clan_tags:
        raise HTTPException(status_code=400, detail=CLAN_TAGS_EMPTY)

    clan_tags = [fix_tag(tag) for tag in body.clan_tags]

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_responses = await asyncio.gather(*(fetch_clan_data(session, tag) for tag in clan_tags))

    return {"items": remove_id_fields(api_responses)}


@router.get("/clan/{clan_tag}/details", name="Get full stats for a single clan")
async def get_clan_stats(clan_tag: str):
    """Retrieve Clash of Clans account details for a single clan."""

    if not clan_tag:
        raise HTTPException(status_code=400, detail="clan_tag is required")

    fixed_tag = fix_tag(clan_tag)

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_response = await fetch_clan_data(session, fixed_tag)

    if not api_response:
        raise HTTPException(status_code=404, detail="Clan not found")

    return remove_id_fields(api_response)


@router.get("/clan/{clan_tag}/members", name="Get Clan Members")
async def get_clan_members(clan_tag: str):
    """Retrieve the member list for a specific clan."""
    if not clan_tag:
        raise HTTPException(status_code=400, detail="clan_tag is required")

    fixed_tag = fix_tag(clan_tag)

    async with aiohttp.ClientSession() as session:
        url = f"https://proxy.clashk.ing/v1/clans/{fixed_tag.replace('#', '%23')}"
        async with session.get(url) as response:
            if response.status != 200:
                raise HTTPException(status_code=404, detail="Clan not found")
            clan_data = await response.json()

    return {
        'clan_tag': fixed_tag,
        'clan_name': clan_data.get('name', ''),
        'members': clan_data.get('memberList', []),
    }


@router.get("/clan/{clan_tag}/join-leave", name="Join Leaves in a season")
async def clan_join_leave(
    clan_tag: str,
    timestamp_start: int = Query(0),
    time_stamp_end: int = Query(9999999999),
    season: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    current_season: Optional[bool] = Query(False),
    limit: int = Query(50),
    filter_leave_join_enabled: bool = Query(False),
    filter_join_leave_enabled: bool = Query(False),
    filter_time: Optional[int] = Query(86400),
    only_type: Optional[str] = Query(None, pattern="^(join_leave|leave_join)$"),
    townhall: Optional[list[int]] = Query(None),
    type: Optional[str] = Query(None, pattern="^(join|leave)$"),
    tag: Optional[list[str]] = Query(None)
):
    """Get join/leave events for a clan with optional filtering.

    Args:
        clan_tag: Clan tag
        timestamp_start: Start timestamp filter
        time_stamp_end: End timestamp filter
        season: Season filter (format YYYY-MM)
        current_season: Filter for current season
        limit: Maximum number of results
        filter_leave_join_enabled: Enable leave-join filtering
        filter_join_leave_enabled: Enable join-leave filtering
        filter_time: Time window for filtering in seconds
        only_type: Filter by join/leave pattern type
        townhall: Filter by townhall levels
        type: Filter by join or leave type
        tag: Filter by player tags

    Returns:
        Dict with timestamp range, stats, and join/leave event list

    Raises:
        HTTPException: 500 if error fetching data
    """
    try:
        # Initialize filters object using helper
        filters = create_join_leave_filters(
            timestamp_start=timestamp_start,
            time_stamp_end=time_stamp_end,
            season=season,
            current_season=current_season,
            limit=limit,
            filter_leave_join_enabled=filter_leave_join_enabled,
            filter_join_leave_enabled=filter_join_leave_enabled,
            filter_time=filter_time,
            only_type=only_type,
            townhall=townhall,
            type=type,
            tag=tag,
            name_contains=None
        )

        clan_tag = fix_tag(clan_tag)

        # Set time range based on season filters
        if filters.season:
            season_start, season_end = season_start_end(filters.season)
            filters.timestamp_start = int(season_start.timestamp())
            filters.time_stamp_end = int(season_end.timestamp())
        elif filters.current_season:
            season_start, season_end = season_start_end(pend.now(tz=pend.UTC).format("YYYY-MM"))
            filters.timestamp_start = int(season_start.timestamp())
            filters.time_stamp_end = int(season_end.timestamp())

        # Build query using helper
        base_query = build_join_leave_query(
            clan_tag,
            filters.timestamp_start,
            filters.time_stamp_end,
            filters
        )

        # Execute query
        cursor = mongo.clan_join_leave.find(base_query, {"_id": 0}).sort("time", -1)
        if not filters.season and not filters.current_season:
            cursor = cursor.limit(filters.limit)

        result = await cursor.to_list(length=None)

        # Apply filters using helper
        result = apply_join_leave_filters(result, filters)

        return {
            "timestamp_start": filters.timestamp_start,
            "timestamp_end": filters.time_stamp_end,
            "stats": generate_stats(result),
            "join_leave_list": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{ERROR_FETCHING_DATA}: {str(e)}")


@router.post("/clans/join-leave", name="Join Leaves in a season")
@linkd.ext.fastapi.inject
async def get_multiple_clan_join_leave(
    body: ClanTagsRequest = None,
    filters: JoinLeaveQueryParams = Depends(),
    # Programmatic parameters
    clan_tags: list[str] = None,
    programmatic_filters: dict = None,
    *,
    mongo: MongoClient
):
    """Unified function for both FastAPI endpoint and programmatic calls.

    For FastAPI endpoint: Use body and filters
    For programmatic calls: Use clan_tags and programmatic_filters

    Args:
        body: Request body with clan tags (for API calls)
        filters: Query parameters (for API calls)
        clan_tags: List of clan tags (for programmatic calls)
        programmatic_filters: Filter dict (for programmatic calls)

    Returns:
        Dict with items list of join/leave data per clan

    Raises:
        HTTPException: 400 if clan_tags empty, 500 if error
    """
    try:
        # Determine call type and get clan tags
        if clan_tags is not None:
            # Programmatic call
            return await _process_programmatic_join_leave(clan_tags, programmatic_filters, mongo)
        else:
            # FastAPI endpoint call
            return await _process_api_join_leave(body, filters, mongo)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching bulk data: {str(e)}")


async def _process_programmatic_join_leave(
    clan_tags: list[str],
    programmatic_filters: dict = None,
    mongo: MongoClient = None
) -> dict:
    """Process programmatic join/leave call.

    Args:
        clan_tags: List of clan tags
        programmatic_filters: Optional filter dict
        mongo: MongoDB client instance

    Returns:
        Dict with items list
    """
    clan_tags_list = [fix_tag(tag) for tag in clan_tags]
    filters = programmatic_filters or get_default_programmatic_filters()

    async def process_clan(clan_tag: str):
        try:
            # Build query and get timestamps
            base_query, timestamp_start, time_stamp_end = build_programmatic_join_leave_query(
                clan_tag, filters
            )

            # Execute query
            cursor = mongo.clan_join_leave.find(base_query, {"_id": 0}).sort("time", -1)
            if not filters.get("current_season", True):
                cursor = cursor.limit(filters.get("limit", 50))

            result = await cursor.to_list(length=None)

            # Apply filters
            result = apply_programmatic_filters(result, filters)

            return {
                "clan_tag": clan_tag,
                "timestamp_start": timestamp_start,
                "timestamp_end": time_stamp_end,
                "stats": generate_stats(result),
                "join_leave_list": result
            }

        except (KeyError, ValueError, TypeError):
            # Return empty result on data processing errors
            return {
                "clan_tag": clan_tag,
                "timestamp_start": 0,
                "timestamp_end": 0,
                "stats": {},
                "join_leave_list": []
            }

    results = await asyncio.gather(*(process_clan(tag) for tag in clan_tags_list))
    return {"items": results}


async def _process_api_join_leave(
    body: ClanTagsRequest = None,
    filters: JoinLeaveQueryParams = Depends(),
    mongo: MongoClient = None
) -> dict:
    """Process API join/leave call.

    Args:
        body: Request body with clan tags
        filters: Query parameters
        mongo: MongoDB client instance

    Returns:
        Dict with items list

    Raises:
        HTTPException: 400 if clan_tags empty
    """
    if not body or not body.clan_tags:
        raise HTTPException(status_code=400, detail=CLAN_TAGS_EMPTY)

    clan_tags_list = [fix_tag(tag) for tag in body.clan_tags]

    async def process_clan(clan_tag: str):
        response = await clan_join_leave(clan_tag=clan_tag, filters=filters or JoinLeaveQueryParams())
        return {
            "clan_tag": clan_tag,
            "timestamp_start": response["timestamp_start"],
            "timestamp_end": response["timestamp_end"],
            "stats": response["stats"],
            "join_leave_list": response["join_leave_list"]
        }

    results = await asyncio.gather(*(process_clan(tag) for tag in clan_tags_list))
    return {"items": results}


@router.post("/clans/capital-raids", name="Get capital raids history & stats for a list of clans")
async def get_clans_capital_raids(body: RaidsRequest):
    """Retrieve Clash of Clans account details for a list of clans."""

    if not body.clan_tags:
        raise HTTPException(status_code=400, detail=CLAN_TAGS_EMPTY)

    if not body.limit:
        body.limit = 1

    clan_tags = [fix_tag(tag) for tag in body.clan_tags]

    async def fetch_clan_data(session, tag):
        url = f"https://proxy.clashk.ing/v1/clans/{tag.replace('#', '%23')}/capitalraidseasons?limit={body.limit}"
        async with session.get(url) as response:
            if response.status == 200:
                return await response.json()
            return None

    async with aiohttp.ClientSession() as session:
        api_responses = await asyncio.gather(*(fetch_clan_data(session, tag) for tag in clan_tags))

    result = []
    for i, clan_data in enumerate(api_responses):
        if clan_data:
            history = clan_data.get("items", [])
            predict_rewards(history)
            result.append({
                "clan_tag": clan_tags[i],  # Add clan_tag to associate data with clan
                "stats": generate_raids_clan_stats(history),
                "history": remove_id_fields(history)
            })

    return {"items": result}




















