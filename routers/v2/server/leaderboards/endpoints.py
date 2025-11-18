import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional

from utils.database import MongoClient
from utils.security import check_authentication
from utils.sentry_utils import capture_endpoint_errors
from utils.custom_coc import CustomClashClient
from .models import (
    PlayerLeaderboardEntry,
    ClanLeaderboardEntry,
    ServerLeaderboardResponse,
    WarPerformanceEntry,
    WarPerformanceLeaderboardResponse,
    DonationsEntry,
    DonationsLeaderboardResponse,
    CapitalRaidEntry,
    CapitalRaidLeaderboardResponse,
    LegendLeagueEntry,
    LegendLeagueLeaderboardResponse,
    ClanGamesEntry,
    ClanGamesLeaderboardResponse,
    ActivityEntry,
    ActivityLeaderboardResponse,
    LootingEntry,
    LootingLeaderboardResponse
)

security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Server Leaderboards"], include_in_schema=True)


@router.get("/{server_id}/leaderboards",
            name="Get server leaderboards",
            response_model=ServerLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_leaderboards(
        server_id: int,
        limit_players: int = Query(default=100, le=500, ge=1),
        limit_clans: int = Query(default=50, le=200, ge=1),
        sort_by: str = Query(default="global_rank", enum=["global_rank", "local_rank", "trophies", "legend_trophies"]),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp,
        coc_client: CustomClashClient
) -> ServerLeaderboardResponse:
    """
    Get comprehensive leaderboards for a Discord server.

    Returns top players and clans based on various ranking metrics.

    Args:
        server_id: Discord server ID
        limit_players: Maximum number of players to return (default 100, max 500)
        limit_clans: Maximum number of clans to return (default 50, max 200)
        sort_by: Sort criterion (global_rank, local_rank, trophies, legend_trophies)

    Returns:
        Leaderboards showing top players and clans from the server
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    if not clans:
        return ServerLeaderboardResponse(
            server_id=server_id,
            total_players=0,
            total_clans=0,
            players=[],
            clans=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    # Fetch player rankings from leaderboard_db
    player_rankings = await mongo.leaderboard_db.find(
        {"tag": {"$in": player_tags}}
    ).to_list(length=None)

    # Create map for quick lookup
    player_ranking_map = {p["tag"]: p for p in player_rankings}

    # Fetch player stats to get current info
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "trophies": 1, "clan": 1}
    ).to_list(length=None)

    # Build player leaderboard entries
    player_entries = []

    for player in player_stats:
        player_tag = player.get("tag")
        ranking = player_ranking_map.get(player_tag, {})

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = player_clan.get("name") if isinstance(player_clan, dict) else None

        entry = PlayerLeaderboardEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            trophies=player.get("trophies"),
            global_rank=ranking.get("global_rank"),
            local_rank=ranking.get("local_rank"),
            country_code=ranking.get("country_code"),
            country_name=ranking.get("country_name"),
            legend_trophies=ranking.get("legend_trophies")
        )

        player_entries.append(entry)

    # Sort players based on sort_by parameter
    if sort_by == "global_rank":
        # Sort by global rank (lower is better), None values go to end
        player_entries.sort(key=lambda x: (x.global_rank is None, x.global_rank or float('inf')))
    elif sort_by == "local_rank":
        player_entries.sort(key=lambda x: (x.local_rank is None, x.local_rank or float('inf')))
    elif sort_by == "trophies":
        player_entries.sort(key=lambda x: -(x.trophies or 0))
    elif sort_by == "legend_trophies":
        player_entries.sort(key=lambda x: -(x.legend_trophies or 0))

    # Limit players
    player_entries = player_entries[:limit_players]

    # Fetch clan rankings from clan_leaderboard_db
    clan_rankings = await mongo.clan_leaderboard_db.find(
        {"tag": {"$in": clan_tags}}
    ).to_list(length=None)

    clan_ranking_map = {c["tag"]: c for c in clan_rankings}

    # Fetch clan stats
    clan_stats_list = await mongo.clan_stats.find(
        {"tag": {"$in": clan_tags}}
    ).to_list(length=None)

    clan_stats_map = {c["tag"]: c for c in clan_stats_list}

    # Build clan leaderboard entries
    clan_entries = []

    for clan in clans:
        clan_tag = clan.get("tag")
        ranking = clan_ranking_map.get(clan_tag, {})
        stats = clan_stats_map.get(clan_tag, {})

        entry = ClanLeaderboardEntry(
            clan_tag=clan_tag,
            clan_name=clan.get("name", "Unknown"),
            clan_level=stats.get("level"),
            clan_points=stats.get("points"),
            member_count=stats.get("memberCount"),
            global_rank=ranking.get("global_rank"),
            local_rank=ranking.get("local_rank"),
            country_code=ranking.get("country_code"),
            country_name=ranking.get("country_name"),
            capital_points=stats.get("capitalPoints")
        )

        clan_entries.append(entry)

    # Sort clans by global rank
    clan_entries.sort(key=lambda x: (x.global_rank is None, x.global_rank or float('inf')))

    # Limit clans
    clan_entries = clan_entries[:limit_clans]

    return ServerLeaderboardResponse(
        server_id=server_id,
        total_players=len(player_stats),
        total_clans=len(clans),
        players=player_entries,
        clans=clan_entries
    )

@router.get("/{server_id}/leaderboards/war-performance",
            name="Get war performance leaderboard",
            response_model=WarPerformanceLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_war_performance_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> WarPerformanceLeaderboardResponse:
    """
    Get war performance leaderboard for a Discord server.

    Returns top players by war stars, destruction, and attack success.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)

    Returns:
        War performance leaderboard
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    if not clans:
        return WarPerformanceLeaderboardResponse(
            server_id=server_id,
            total_count=0,
            players=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    # Aggregate war hits data from OldMongoClient
    from utils.database import OldMongoClient

    # Use aggregation to get war stats per player
    pipeline = [
        {
            "$match": {
                "$or": [
                    {"data.clan.members.tag": {"$in": player_tags}},
                    {"data.opponent.members.tag": {"$in": player_tags}}
                ]
            }
        },
        {
            "$project": {
                "clan_members": "$data.clan.members",
                "opponent_members": "$data.opponent.members"
            }
        }
    ]

    wars = await OldMongoClient.clan_wars.aggregate(pipeline).to_list(length=None)

    # Build war stats per player
    player_war_stats = {}

    for war in wars:
        all_members = war.get("clan_members", []) + war.get("opponent_members", [])

        for member in all_members:
            tag = member.get("tag")
            if tag not in player_tags:
                continue

            if tag not in player_war_stats:
                player_war_stats[tag] = {
                    "name": member.get("name", "Unknown"),
                    "townhall": member.get("townhallLevel"),
                    "total_stars": 0,
                    "total_destruction": 0.0,
                    "attack_count": 0,
                    "defense_count": 0,
                    "triple_stars": 0,
                    "war_count": 0
                }

            stats = player_war_stats[tag]
            stats["war_count"] += 1

            # Process attacks
            attacks = member.get("attacks", [])
            for attack in attacks:
                stats["attack_count"] += 1
                stats["total_stars"] += attack.get("stars", 0)
                stats["total_destruction"] += attack.get("destructionPercentage", 0.0)

                if attack.get("stars", 0) == 3:
                    stats["triple_stars"] += 1

            # Count defenses (opponent attacks against this player)
            if member.get("bestOpponentAttack"):
                stats["defense_count"] += 1

    # Fetch player current info
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "clan": 1}
    ).to_list(length=None)

    player_info_map = {p["tag"]: p for p in player_stats}

    # Build leaderboard entries
    entries = []

    for player_tag, stats in player_war_stats.items():
        player_info = player_info_map.get(player_tag, {})
        player_clan = player_info.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        attack_count = stats["attack_count"]
        avg_stars = stats["total_stars"] / attack_count if attack_count > 0 else 0.0
        avg_destruction = stats["total_destruction"] / attack_count if attack_count > 0 else 0.0

        entry = WarPerformanceEntry(
            player_tag=player_tag,
            player_name=player_info.get("name", stats["name"]),
            townhall_level=player_info.get("townhall", stats["townhall"]),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            total_stars=stats["total_stars"],
            total_destruction=round(stats["total_destruction"], 2),
            attack_count=attack_count,
            defense_count=stats["defense_count"],
            triple_stars=stats["triple_stars"],
            average_stars=round(avg_stars, 2),
            average_destruction=round(avg_destruction, 2),
            war_count=stats["war_count"]
        )

        entries.append(entry)

    # Sort by total stars (descending)
    entries.sort(key=lambda x: (-x.total_stars, -x.average_stars, -x.triple_stars))

    # Limit results
    entries = entries[:limit]

    return WarPerformanceLeaderboardResponse(
        server_id=server_id,
        total_count=len(player_war_stats),
        players=entries
    )


@router.get("/{server_id}/leaderboards/donations",
            name="Get donations leaderboard",
            response_model=DonationsLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_donations_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        sort_by: str = Query(default="sent", enum=["sent", "received", "ratio"]),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp,
        coc_client: CustomClashClient
) -> DonationsLeaderboardResponse:
    """
    Get donations leaderboard for a Discord server.

    Returns top players by donations sent, received, or ratio.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        sort_by: Sort by sent, received, or ratio (default: sent)

    Returns:
        Donations leaderboard
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    if not clans:
        return DonationsLeaderboardResponse(
            server_id=server_id,
            total_count=0,
            players=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Fetch current clan data from CoC API to get donations
    entries = []

    for clan_tag in clan_tags:
        try:
            clan = await coc_client.get_clan(clan_tag)

            for member in clan.members:
                # Calculate ratio
                ratio = None
                if member.donations_received > 0:
                    ratio = round(member.donations / member.donations_received, 2)

                entry = DonationsEntry(
                    player_tag=member.tag,
                    player_name=member.name,
                    townhall_level=member.town_hall,
                    clan_tag=clan_tag,
                    clan_name=clan_name_map.get(clan_tag, clan.name),
                    donations_sent=member.donations,
                    donations_received=member.donations_received,
                    donation_ratio=ratio
                )

                entries.append(entry)

        except Exception as e:
            print(f"Error fetching clan {clan_tag}: {e}")
            continue

    # Sort based on sort_by parameter
    if sort_by == "sent":
        entries.sort(key=lambda x: -x.donations_sent)
    elif sort_by == "received":
        entries.sort(key=lambda x: -x.donations_received)
    elif sort_by == "ratio":
        entries.sort(key=lambda x: -(x.donation_ratio or 0))

    # Limit results
    entries = entries[:limit]

    return DonationsLeaderboardResponse(
        server_id=server_id,
        total_count=len(entries),
        players=entries
    )


@router.get("/{server_id}/leaderboards/capital-raids",
            name="Get capital raids leaderboard",
            response_model=CapitalRaidLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_capital_raids_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        weekend: Optional[str] = Query(None, description="Weekend date YYYY-MM-DD (optional, defaults to latest)"),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> CapitalRaidLeaderboardResponse:
    """
    Get capital raids leaderboard for a Discord server.

    Returns top players by capital gold looted.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        weekend: Optional weekend date (YYYY-MM-DD), defaults to latest

    Returns:
        Capital raids leaderboard
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    if not clans:
        return CapitalRaidLeaderboardResponse(
            server_id=server_id,
            total_count=0,
            players=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    # Fetch capital raid data from OldMongoClient
    from utils.database import OldMongoClient

    # Build query
    query = {"data.members.tag": {"$in": player_tags}}

    if weekend:
        query["data.startTime"] = {"$regex": f"^{weekend}"}

    # Fetch raids
    raids = await OldMongoClient.raid_weekend_db.find(query).sort("data.startTime", -1).limit(10).to_list(length=None)

    # Aggregate player stats
    player_raid_stats = {}

    for raid in raids:
        members = raid.get("data", {}).get("members", [])

        for member in members:
            tag = member.get("tag")
            if tag not in player_tags:
                continue

            if tag not in player_raid_stats:
                player_raid_stats[tag] = {
                    "name": member.get("name", "Unknown"),
                    "total_capital_gold": 0,
                    "total_raids": 0,
                    "total_attacks": 0
                }

            stats = player_raid_stats[tag]
            stats["total_capital_gold"] += member.get("capitalResourcesLooted", 0)
            stats["total_raids"] += 1
            stats["total_attacks"] += member.get("attacks", 0)

    # Fetch player current info
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "clan": 1}
    ).to_list(length=None)

    player_info_map = {p["tag"]: p for p in player_stats}

    # Build leaderboard entries
    entries = []

    for player_tag, stats in player_raid_stats.items():
        player_info = player_info_map.get(player_tag, {})
        player_clan = player_info.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        avg_gold = stats["total_capital_gold"] / stats["total_raids"] if stats["total_raids"] > 0 else 0.0

        entry = CapitalRaidEntry(
            player_tag=player_tag,
            player_name=player_info.get("name", stats["name"]),
            townhall_level=player_info.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            total_capital_gold=stats["total_capital_gold"],
            total_raids=stats["total_raids"],
            average_capital_gold=round(avg_gold, 2),
            total_attacks=stats["total_attacks"]
        )

        entries.append(entry)

    # Sort by total capital gold (descending)
    entries.sort(key=lambda x: -x.total_capital_gold)

    # Limit results
    entries = entries[:limit]

    return CapitalRaidLeaderboardResponse(
        server_id=server_id,
        total_count=len(player_raid_stats),
        players=entries
    )


@router.get("/{server_id}/leaderboards/legends",
            name="Get legend league leaderboard",
            response_model=LegendLeagueLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_legend_league_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        days: int = Query(default=7, le=30, ge=1, description="Number of days to analyze (1-30)"),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> LegendLeagueLeaderboardResponse:
    """
    Get legend league leaderboard for a Discord server.

    Returns top players by legend league performance over a specified period.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        days: Number of days to analyze (default 7, max 30)

    Returns:
        Legend league leaderboard
    """
    import pendulum
    from datetime import datetime, timedelta

    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    if not player_tags:
        return LegendLeagueLeaderboardResponse(
            server_id=server_id,
            total_count=0,
            players=[]
        )

    # Generate list of dates to query
    today = pendulum.now(tz="UTC")
    dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]

    # Build projection for legend days
    projection = {
        "tag": 1,
        "name": 1,
        "townhall": 1,
        "clan": 1,
        "legends.streak": 1
    }
    for date in dates:
        projection[f"legends.{date}"] = 1

    # Fetch legend data
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        projection
    ).to_list(length=None)

    # Get all clans for this server for clan name mapping
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Process legend stats
    entries = []

    for player in player_stats:
        player_tag = player.get("tag")
        legends_data = player.get("legends", {})

        if not isinstance(legends_data, dict):
            continue

        # Calculate stats across all days
        total_attacks = 0
        total_defenses = 0
        attack_wins = 0
        defense_wins = 0
        first_trophies = None
        last_trophies = None

        for i, date in enumerate(reversed(dates)):  # Process chronologically
            day_data = legends_data.get(date)
            if not isinstance(day_data, dict):
                continue

            # Get trophy counts
            if first_trophies is None:
                first_trophies = day_data.get("start", 0)
            last_trophies = day_data.get("end", 0)

            # Process attacks
            attacks = day_data.get("attacks", day_data.get("new_attacks", []))
            if isinstance(attacks, list):
                total_attacks += len(attacks)
                for attack in attacks:
                    if isinstance(attack, dict) and attack.get("stars", 0) >= 1:
                        attack_wins += 1

            # Process defenses
            defenses = day_data.get("defenses", day_data.get("new_defenses", []))
            if isinstance(defenses, list):
                total_defenses += len(defenses)
                for defense in defenses:
                    if isinstance(defense, dict) and defense.get("stars", 0) == 0:
                        defense_wins += 1

        # Skip players with no legend activity
        if total_attacks == 0 and total_defenses == 0:
            continue

        # Calculate trophy change
        trophy_change = 0
        current_trophies = 0
        if first_trophies is not None and last_trophies is not None:
            trophy_change = last_trophies - first_trophies
            current_trophies = last_trophies

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        entry = LegendLeagueEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            current_trophies=current_trophies,
            trophy_change=trophy_change,
            attack_wins=attack_wins,
            defense_wins=defense_wins,
            total_attacks=total_attacks,
            total_defenses=total_defenses,
            streak=legends_data.get("streak")
        )

        entries.append(entry)

    # Sort by trophy change (descending), then by current trophies
    entries.sort(key=lambda x: (-x.trophy_change, -x.current_trophies))

    # Limit results
    entries = entries[:limit]

    return LegendLeagueLeaderboardResponse(
        server_id=server_id,
        total_count=len(entries),
        players=entries
    )


@router.get("/{server_id}/leaderboards/clan-games",
            name="Get clan games leaderboard",
            response_model=ClanGamesLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_clan_games_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        season: Optional[str] = Query(None, description="Season in YYYY-MM format (defaults to current)"),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> ClanGamesLeaderboardResponse:
    """
    Get clan games leaderboard for a Discord server.

    Returns top players by clan games points for a season.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        season: Season in YYYY-MM format (defaults to current season)

    Returns:
        Clan games leaderboard
    """
    import pendulum

    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Default to current season if not provided
    if not season:
        now = pendulum.now(tz="UTC")
        season = now.strftime("%Y-%m")

    # Validate season format
    try:
        pendulum.from_format(season, "YYYY-MM")
    except:
        raise HTTPException(status_code=400, detail="Invalid season format. Use YYYY-MM")

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    if not player_tags:
        return ClanGamesLeaderboardResponse(
            server_id=server_id,
            season=season,
            total_count=0,
            players=[]
        )

    # Fetch player stats with clan games data
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "clan": 1, f"clan_games.{season}": 1}
    ).to_list(length=None)

    # Get all clans for this server for clan name mapping
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Build entries
    entries = []

    for player in player_stats:
        player_tag = player.get("tag")
        clan_games_data = player.get("clan_games", {})
        season_data = clan_games_data.get(season, {})

        points = season_data.get("points", 0) if isinstance(season_data, dict) else 0

        # Skip players with 0 points
        if points == 0:
            continue

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        entry = ClanGamesEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            points=points
        )

        entries.append(entry)

    # Sort by points (descending)
    entries.sort(key=lambda x: -x.points)

    # Limit results
    entries = entries[:limit]

    return ClanGamesLeaderboardResponse(
        server_id=server_id,
        season=season,
        total_count=len(entries),
        players=entries
    )


@router.get("/{server_id}/leaderboards/activity",
            name="Get activity leaderboard",
            response_model=ActivityLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_activity_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        season: Optional[str] = Query(None, description="Season in YYYY-MM format (defaults to current)"),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> ActivityLeaderboardResponse:
    """
    Get activity leaderboard for a Discord server.

    Returns top players by activity count and last online time.

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        season: Season in YYYY-MM format (defaults to current season)

    Returns:
        Activity leaderboard
    """
    import pendulum
    from datetime import datetime

    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Default to current season if not provided
    if not season:
        now = pendulum.now(tz="UTC")
        season = now.strftime("%Y-%m")

    # Validate season format
    try:
        pendulum.from_format(season, "YYYY-MM")
    except:
        raise HTTPException(status_code=400, detail="Invalid season format. Use YYYY-MM")

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    if not player_tags:
        return ActivityLeaderboardResponse(
            server_id=server_id,
            season=season,
            total_count=0,
            players=[]
        )

    # Fetch player stats with activity data
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {"tag": 1, "name": 1, "townhall": 1, "clan": 1, f"activity.{season}": 1, "last_online": 1}
    ).to_list(length=None)

    # Get all clans for this server for clan name mapping
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Build entries
    entries = []
    now_timestamp = int(datetime.now().timestamp())

    for player in player_stats:
        player_tag = player.get("tag")
        activity_data = player.get("activity", {})
        activity_count = activity_data.get(season, 0) if isinstance(activity_data, dict) else 0

        last_online = player.get("last_online")
        days_since_online = None
        if last_online is not None:
            days_since_online = (now_timestamp - last_online) // 86400  # Convert to days

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        entry = ActivityEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            activity_count=activity_count,
            last_online=last_online,
            days_since_online=days_since_online
        )

        entries.append(entry)

    # Sort by activity count (descending), then by last online (most recent first)
    entries.sort(key=lambda x: (-x.activity_count, -(x.last_online or 0)))

    # Limit results
    entries = entries[:limit]

    return ActivityLeaderboardResponse(
        server_id=server_id,
        season=season,
        total_count=len(entries),
        players=entries
    )


@router.get("/{server_id}/leaderboards/looting",
            name="Get looting leaderboard",
            response_model=LootingLeaderboardResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_looting_leaderboard(
        server_id: int,
        limit: int = Query(default=100, le=500, ge=1),
        season: Optional[str] = Query(None, description="Season in YYYY-MM format (defaults to current)"),
        sort_by: str = Query(default="total", enum=["gold", "elixir", "dark_elixir", "total"]),
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> LootingLeaderboardResponse:
    """
    Get looting/resources leaderboard for a Discord server.

    Returns top players by resources looted (gold, elixir, dark elixir).

    Args:
        server_id: Discord server ID
        limit: Maximum number of players to return (default 100, max 500)
        season: Season in YYYY-MM format (defaults to current season)
        sort_by: Sort by gold, elixir, dark_elixir, or total (default: total)

    Returns:
        Looting leaderboard
    """
    import pendulum

    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Default to current season if not provided
    if not season:
        now = pendulum.now(tz="UTC")
        season = now.strftime("%Y-%m")

    # Validate season format
    try:
        pendulum.from_format(season, "YYYY-MM")
    except:
        raise HTTPException(status_code=400, detail="Invalid season format. Use YYYY-MM")

    # Get all linked Discord accounts for this server
    all_links = await mongo.coc_accounts.find(
        {"server": server_id}
    ).to_list(length=None)

    player_tags = list(set(link["player_tag"] for link in all_links))

    if not player_tags:
        return LootingLeaderboardResponse(
            server_id=server_id,
            season=season,
            total_count=0,
            sort_by=sort_by,
            players=[]
        )

    # Fetch player stats with looting data
    player_stats = await mongo.player_stats.find(
        {"tag": {"$in": player_tags}},
        {
            "tag": 1,
            "name": 1,
            "townhall": 1,
            "clan": 1,
            f"gold.{season}": 1,
            f"elixir.{season}": 1,
            f"dark_elixir.{season}": 1
        }
    ).to_list(length=None)

    # Get all clans for this server for clan name mapping
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Build entries
    entries = []

    for player in player_stats:
        player_tag = player.get("tag")

        gold_data = player.get("gold", {})
        elixir_data = player.get("elixir", {})
        dark_elixir_data = player.get("dark_elixir", {})

        gold_looted = gold_data.get(season, 0) if isinstance(gold_data, dict) else 0
        elixir_looted = elixir_data.get(season, 0) if isinstance(elixir_data, dict) else 0
        dark_elixir_looted = dark_elixir_data.get(season, 0) if isinstance(dark_elixir_data, dict) else 0

        total_looted = gold_looted + elixir_looted + dark_elixir_looted

        # Skip players with 0 loot
        if total_looted == 0:
            continue

        # Get clan info
        player_clan = player.get("clan", {})
        player_clan_tag = player_clan.get("tag") if isinstance(player_clan, dict) else None
        player_clan_name = clan_name_map.get(player_clan_tag) if player_clan_tag else None

        entry = LootingEntry(
            player_tag=player_tag,
            player_name=player.get("name", "Unknown"),
            townhall_level=player.get("townhall"),
            clan_tag=player_clan_tag,
            clan_name=player_clan_name,
            gold_looted=gold_looted,
            elixir_looted=elixir_looted,
            dark_elixir_looted=dark_elixir_looted,
            total_looted=total_looted
        )

        entries.append(entry)

    # Sort based on sort_by parameter
    if sort_by == "gold":
        entries.sort(key=lambda x: -x.gold_looted)
    elif sort_by == "elixir":
        entries.sort(key=lambda x: -x.elixir_looted)
    elif sort_by == "dark_elixir":
        entries.sort(key=lambda x: -x.dark_elixir_looted)
    else:  # total
        entries.sort(key=lambda x: -x.total_looted)

    # Limit results
    entries = entries[:limit]

    return LootingLeaderboardResponse(
        server_id=server_id,
        season=season,
        total_count=len(entries),
        sort_by=sort_by,
        players=entries
    )
