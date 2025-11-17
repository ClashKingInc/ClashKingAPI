import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from datetime import datetime, timedelta
import coc

from utils.database import MongoClient, OldMongoClient
from utils.security import check_authentication
from utils.config import Config
from utils.custom_coc import CustomClashClient
from utils.sentry_utils import capture_endpoint_errors
from .activity_models import (
    GuildActivitySummary,
    ClanActivity,
    InactivePlayersResponse,
    InactivePlayer
)

config = Config()
security = HTTPBearer()

router = APIRouter(prefix="/v2/activity", tags=["Activity & Inactivity"], include_in_schema=True)


@router.get("/guild-summary",
            name="Get guild activity summary",
            response_model=GuildActivitySummary)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_guild_activity_summary(
    guild_id: int,
    inactive_threshold_days: int = 7,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp,
    coc_client: CustomClashClient
) -> GuildActivitySummary:
    """
    Get server-wide activity overview across all clans.

    Provides aggregate statistics including:
    - Total members and activity rates
    - Donation statistics
    - Clan-by-clan breakdown

    Args:
        guild_id: Discord server ID
        inactive_threshold_days: Days without activity to consider inactive (default 7)

    Returns:
        Comprehensive activity summary for the server
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": guild_id}).to_list(length=None)
    if not clans:
        return GuildActivitySummary(
            guild_id=guild_id,
            total_clans=0,
            total_members=0,
            total_active_members=0,
            total_inactive_members=0,
            overall_activity_rate=0.0,
            total_donations_sent=0,
            total_donations_received=0,
            clans=[]
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Calculate inactive threshold timestamp
    inactive_threshold = datetime.utcnow() - timedelta(days=inactive_threshold_days)

    # Aggregate statistics
    clan_activities = []
    total_members = 0
    total_active = 0
    total_inactive = 0
    total_donations_sent = 0
    total_donations_received = 0

    for clan_tag in clan_tags:
        try:
            # Fetch current clan data from CoC API
            clan = await coc_client.get_clan(clan_tag)

            # Get player activity data from database
            player_tags = [member.tag for member in clan.members]
            player_stats = await OldMongoClient.player_stats.find(
                {"tag": {"$in": player_tags}}
            ).to_list(length=None)

            # Create map of last seen timestamps
            last_seen_map = {}
            for player in player_stats:
                if "last_online" in player:
                    last_seen_map[player["tag"]] = player["last_online"]

            # Calculate clan statistics
            active_count = 0
            inactive_count = 0
            donations_sent = 0
            donations_received = 0
            total_trophies = 0
            attacks_wins = 0

            for member in clan.members:
                # Check if player is active
                last_seen = last_seen_map.get(member.tag)
                if last_seen and last_seen >= inactive_threshold:
                    active_count += 1
                else:
                    inactive_count += 1

                # Aggregate donations and stats
                donations_sent += member.donations
                donations_received += member.received
                total_trophies += member.trophies
                attacks_wins += member.attack_wins

            member_count = len(clan.members)
            activity_rate = (active_count / member_count * 100) if member_count > 0 else 0.0
            avg_donations_sent = donations_sent / member_count if member_count > 0 else 0.0
            avg_donations_received = donations_received / member_count if member_count > 0 else 0.0
            avg_trophies = total_trophies / member_count if member_count > 0 else 0.0

            clan_activities.append(ClanActivity(
                clan_tag=clan_tag,
                clan_name=clan_name_map.get(clan_tag, clan.name),
                total_members=member_count,
                active_members=active_count,
                inactive_members=inactive_count,
                activity_rate=activity_rate,
                average_donations_sent=avg_donations_sent,
                average_donations_received=avg_donations_received,
                total_donations_sent=donations_sent,
                total_donations_received=donations_received,
                total_attacks_wins=attacks_wins,
                average_trophies=avg_trophies
            ))

            # Update totals
            total_members += member_count
            total_active += active_count
            total_inactive += inactive_count
            total_donations_sent += donations_sent
            total_donations_received += donations_received

        except coc.NotFound:
            # Clan not found, skip
            continue
        except Exception as e:
            # Log error but continue with other clans
            print(f"Error fetching clan {clan_tag}: {e}")
            continue

    # Calculate overall activity rate
    overall_activity_rate = (total_active / total_members * 100) if total_members > 0 else 0.0

    return GuildActivitySummary(
        guild_id=guild_id,
        total_clans=len(clan_activities),
        total_members=total_members,
        total_active_members=total_active,
        total_inactive_members=total_inactive,
        overall_activity_rate=overall_activity_rate,
        total_donations_sent=total_donations_sent,
        total_donations_received=total_donations_received,
        clans=clan_activities
    )


@router.get("/inactive-players",
            name="Get inactive players",
            response_model=InactivePlayersResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_inactive_players(
    guild_id: int,
    inactive_threshold_days: int = 7,
    min_townhall: Optional[int] = None,
    clan_tag: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp,
    coc_client: CustomClashClient
) -> InactivePlayersResponse:
    """
    Get list of inactive members across server clans.

    Returns players who haven't been active within the threshold period.

    Args:
        guild_id: Discord server ID
        inactive_threshold_days: Days without activity to consider inactive (default 7)
        min_townhall: Optional minimum townhall level filter
        clan_tag: Optional specific clan to check (defaults to all server clans)
        limit: Maximum number of players to return (default 100)
        offset: Number of players to skip for pagination (default 0)

    Returns:
        List of inactive players with their details
    """
    # Verify server exists and user has access
    server = await mongo.server_db.find_one({"server": guild_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get clans to check
    if clan_tag:
        # Check specific clan
        clan_query = {"server": guild_id, "tag": clan_tag}
    else:
        # Check all server clans
        clan_query = {"server": guild_id}

    clans = await mongo.clan_db.find(clan_query).to_list(length=None)
    if not clans:
        return InactivePlayersResponse(
            guild_id=guild_id,
            inactive_threshold_days=inactive_threshold_days,
            players=[],
            total_count=0,
            limit=limit,
            offset=offset
        )

    clan_tags = [clan["tag"] for clan in clans]
    clan_name_map = {clan["tag"]: clan["name"] for clan in clans}

    # Calculate inactive threshold timestamp
    inactive_threshold = datetime.utcnow() - timedelta(days=inactive_threshold_days)

    # Collect inactive players
    all_inactive_players = []

    for clan_tag_check in clan_tags:
        try:
            # Fetch current clan data from CoC API
            clan = await coc_client.get_clan(clan_tag_check)

            # Get player activity data from database
            player_tags = [member.tag for member in clan.members]
            player_stats = await OldMongoClient.player_stats.find(
                {"tag": {"$in": player_tags}}
            ).to_list(length=None)

            # Create map of last seen timestamps
            last_seen_map = {
                player["tag"]: player.get("last_online")
                for player in player_stats
                if "last_online" in player
            }

            # Find inactive players
            for member in clan.members:
                # Apply townhall filter if specified
                if min_townhall and member.town_hall < min_townhall:
                    continue

                # Check if player is inactive
                last_seen = last_seen_map.get(member.tag)

                # Consider inactive if:
                # 1. No last_seen record (never tracked)
                # 2. Last seen is older than threshold
                is_inactive = (not last_seen) or (last_seen < inactive_threshold)

                if is_inactive:
                    # Calculate days inactive
                    if last_seen:
                        days_inactive = (datetime.utcnow() - last_seen).days
                    else:
                        days_inactive = None

                    all_inactive_players.append(InactivePlayer(
                        player_tag=member.tag,
                        player_name=member.name,
                        clan_tag=clan_tag_check,
                        clan_name=clan_name_map.get(clan_tag_check, clan.name),
                        townhall_level=member.town_hall,
                        role=member.role.name if member.role else "Member",
                        last_seen=last_seen,
                        days_inactive=days_inactive,
                        trophies=member.trophies,
                        donations_sent=member.donations,
                        donations_received=member.received
                    ))

        except coc.NotFound:
            # Clan not found, skip
            continue
        except Exception as e:
            # Log error but continue with other clans
            print(f"Error fetching clan {clan_tag_check}: {e}")
            continue

    # Sort by days inactive (most inactive first)
    all_inactive_players.sort(
        key=lambda p: p.days_inactive if p.days_inactive is not None else 9999,
        reverse=True
    )

    # Apply pagination
    total_count = len(all_inactive_players)
    paginated_players = all_inactive_players[offset:offset + limit]

    return InactivePlayersResponse(
        guild_id=guild_id,
        inactive_threshold_days=inactive_threshold_days,
        players=paginated_players,
        total_count=total_count,
        limit=limit,
        offset=offset
    )
