from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List
from utils.security import check_authentication
from utils.database import MongoClient
from utils.custom_coc import CustomClashClient
from utils.sentry_utils import capture_endpoint_errors
from .models import (
    ClanSettingsUpdate,
    ClanSettingsResponse,
    AddClanRequest,
    AddClanResponse,
    RemoveClanResponse,
    ClanListItem,
    ClanSettings,
    ClanSettingsDetail,
    MemberCountWarning,
    ClanLogSettings,
    LogButtonSettings,
)
import linkd
import coc
import hikari

security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Clan Settings"], include_in_schema=True)


@router.get("/{server_id}/clans",
            name="Get all clans for server",
            response_model=List[ClanListItem])
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_clans(
    server_id: int,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient,
    rest: hikari.RESTApp
) -> List[ClanListItem]:
    """
    Get all clans configured for a server.

    Returns a list of all clans with their basic information and settings.
    Includes live data from the Clash of Clans API (badge, level, member count).
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Get all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)

    result = []
    for clan_doc in clans:
        # Fetch live clan data from CoC API
        clan_tag = clan_doc.get("tag")
        badge_url = None
        level = None
        member_count = None

        try:
            clan_data = await coc_client.get_clan(clan_tag)
            badge_url = clan_data.badge.url if clan_data.badge else None
            level = clan_data.level
            member_count = len(clan_data.members)
        except (coc.NotFound, Exception):
            # Continue with database data if API fetch fails
            pass

        # Build logs structure
        logs_data = clan_doc.get("logs", {})
        join_log = logs_data.get("join_log", {})
        leave_log = logs_data.get("leave_log", {})

        logs = ClanLogSettings(
            join_log=LogButtonSettings(
                profile_button=join_log.get("profile_button", False),
                strike_button=None,
                ban_button=None
            ),
            leave_log=LogButtonSettings(
                profile_button=None,
                strike_button=leave_log.get("strike_button", False),
                ban_button=leave_log.get("ban_button", False)
            )
        )

        # Build member count warning
        mcw_data = clan_doc.get("member_count_warning", {})
        member_count_warning = MemberCountWarning(
            channel=mcw_data.get("channel"),
            above=mcw_data.get("above"),
            below=mcw_data.get("below"),
            role=mcw_data.get("role")
        )

        # Build settings
        settings = ClanSettings(
            generalRole=clan_doc.get("generalRole"),
            leaderRole=clan_doc.get("leaderRole"),
            clanChannel=clan_doc.get("clanChannel"),
            category=clan_doc.get("category"),
            abbreviation=clan_doc.get("abbreviation"),
            greeting=clan_doc.get("greeting"),
            auto_greet_option=clan_doc.get("auto_greet_option"),
            leadership_eval=clan_doc.get("leadership_eval"),
            warCountdown=clan_doc.get("warCountdown"),
            warTimerCountdown=clan_doc.get("warTimerCountdown"),
            ban_alert_channel=clan_doc.get("ban_alert_channel"),
            member_count_warning=member_count_warning,
            logs=logs
        )

        result.append(ClanListItem(
            tag=clan_tag,
            name=clan_doc.get("name", "Unknown"),
            badge_url=badge_url,
            level=level,
            member_count=member_count,
            settings=settings
        ))

    return result


@router.get("/{server_id}/clan/{clan_tag}/settings",
            name="Get clan settings",
            response_model=ClanSettingsDetail)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_clan_settings(
    server_id: int,
    clan_tag: str,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> ClanSettingsDetail:
    """
    Get detailed settings for a specific clan.

    Returns all configuration for a clan including:
    - Basic settings (roles, channels, greeting)
    - War settings (countdown channels)
    - Member count warnings
    - Log button configurations
    """
    # Normalize clan tag
    if not clan_tag.startswith('#'):
        clan_tag = f'#{clan_tag}'

    # Find clan
    clan_doc = await mongo.clan_db.find_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })

    if not clan_doc:
        raise HTTPException(status_code=404, detail="Clan not found on this server")

    # Build logs structure
    logs_data = clan_doc.get("logs", {})
    join_log = logs_data.get("join_log", {})
    leave_log = logs_data.get("leave_log", {})

    logs = ClanLogSettings(
        join_log=LogButtonSettings(
            profile_button=join_log.get("profile_button", False),
            strike_button=None,
            ban_button=None
        ),
        leave_log=LogButtonSettings(
            profile_button=None,
            strike_button=leave_log.get("strike_button", False),
            ban_button=leave_log.get("ban_button", False)
        )
    )

    # Build member count warning
    mcw_data = clan_doc.get("member_count_warning", {})
    member_count_warning = MemberCountWarning(
        channel=mcw_data.get("channel"),
        above=mcw_data.get("above"),
        below=mcw_data.get("below"),
        role=mcw_data.get("role")
    )

    return ClanSettingsDetail(
        tag=clan_tag,
        name=clan_doc.get("name", "Unknown"),
        server=server_id,
        generalRole=clan_doc.get("generalRole"),
        leaderRole=clan_doc.get("leaderRole"),
        clanChannel=clan_doc.get("clanChannel"),
        category=clan_doc.get("category"),
        abbreviation=clan_doc.get("abbreviation"),
        greeting=clan_doc.get("greeting"),
        auto_greet_option=clan_doc.get("auto_greet_option"),
        leadership_eval=clan_doc.get("leadership_eval"),
        warCountdown=clan_doc.get("warCountdown"),
        warTimerCountdown=clan_doc.get("warTimerCountdown"),
        ban_alert_channel=clan_doc.get("ban_alert_channel"),
        member_count_warning=member_count_warning,
        logs=logs
    )


@router.patch("/{server_id}/clan/{clan_tag}/settings",
              name="Update clan settings",
              response_model=ClanSettingsResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def update_clan_settings(
    server_id: int,
    clan_tag: str,
    settings: ClanSettingsUpdate,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> ClanSettingsResponse:
    """
    Update clan settings. Only provided fields will be updated.

    This endpoint handles all clan-level settings including:
    - Basic settings (roles, channel, category, abbreviation, greeting)
    - War settings (countdown channels, ban alerts)
    - Member count warnings (thresholds, channel, role)
    - Log button configurations (profile, strike, ban buttons)
    """
    # Verify clan exists for this server
    existing = await mongo.clan_db.find_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })
    if not existing:
        raise HTTPException(status_code=404, detail="Clan not found on this server")

    # Build update document with only provided fields
    update_doc = {}

    # Direct field mappings (using DB field names)
    direct_fields = [
        "generalRole", "leaderRole", "clanChannel", "category",
        "abbreviation", "greeting", "auto_greet_option", "leadership_eval",
        "warCountdown", "warTimerCountdown", "ban_alert_channel"
    ]

    for field in direct_fields:
        value = getattr(settings, field, None)
        if value is not None:
            update_doc[field] = value

    # Handle nested member_count_warning
    if settings.member_count_warning is not None:
        if settings.member_count_warning.channel is not None:
            update_doc["member_count_warning.channel"] = settings.member_count_warning.channel
        if settings.member_count_warning.above is not None:
            update_doc["member_count_warning.above"] = settings.member_count_warning.above
        if settings.member_count_warning.below is not None:
            update_doc["member_count_warning.below"] = settings.member_count_warning.below
        if settings.member_count_warning.role is not None:
            update_doc["member_count_warning.role"] = settings.member_count_warning.role

    # Handle log button settings
    if settings.join_log_profile_button is not None:
        update_doc["logs.join_log.profile_button"] = settings.join_log_profile_button
    if settings.leave_log_strike_button is not None:
        update_doc["logs.leave_log.strike_button"] = settings.leave_log_strike_button
    if settings.leave_log_ban_button is not None:
        update_doc["logs.leave_log.ban_button"] = settings.leave_log_ban_button

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update the clan
    result = await mongo.clan_db.update_one(
        {"$and": [{"tag": clan_tag}, {"server": server_id}]},
        {"$set": update_doc}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clan not found")

    return ClanSettingsResponse(
        message="Clan settings updated successfully",
        server_id=server_id,
        clan_tag=clan_tag,
        updated_fields=len(update_doc)
    )


@router.post("/{server_id}/clans",
             name="Add clan to server",
             response_model=AddClanResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def add_clan(
    server_id: int,
    clan_request: AddClanRequest,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    coc_client: CustomClashClient
) -> AddClanResponse:
    """
    Add a clan to a server.

    This endpoint:
    - Validates the clan tag and fetches clan data from CoC API
    - Checks if clan is already added to this server
    - Inserts clan document with default settings
    """
    # Normalize clan tag
    clan_tag = clan_request.tag
    if not clan_tag.startswith('#'):
        clan_tag = f'#{clan_tag}'

    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check if clan already added to this server
    existing = await mongo.clan_db.find_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Clan {clan_tag} is already added to this server"
        )

    # Fetch clan data from CoC API to validate it exists
    try:
        clan_data = await coc_client.get_clan(clan_tag)
        clan_name = clan_data.name
    except coc.NotFound:
        raise HTTPException(status_code=404, detail=f"Clan {clan_tag} not found in Clash of Clans")
    except Exception as e:
        # Use provided name if API fetch fails
        clan_name = clan_request.name or "Unknown Clan"

    # Create clan document with default settings
    clan_doc = {
        "server": server_id,
        "tag": clan_tag,
        "name": clan_name,
        "generalRole": None,
        "leaderRole": None,
        "clanChannel": None,
        "category": None,
        "abbreviation": "",
        "greeting": "",
        "auto_greet_option": "Never",
        "leadership_eval": None,
        "warCountdown": None,
        "warTimerCountdown": None,
        "ban_alert_channel": None,
        "member_count_warning": {
            "channel": None,
            "above": None,
            "below": None,
            "role": None
        },
        "logs": {
            "join_log": {"profile_button": False},
            "leave_log": {"strike_button": False, "ban_button": False}
        }
    }

    # Insert clan
    result = await mongo.clan_db.insert_one(clan_doc)

    return AddClanResponse(
        message="Clan added successfully",
        server_id=server_id,
        clan_tag=clan_tag,
        clan_name=clan_name
    )


@router.delete("/{server_id}/clans/{clan_tag}",
               name="Remove clan from server",
               response_model=RemoveClanResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def remove_clan(
    server_id: int,
    clan_tag: str,
    user_id: str = None,
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> RemoveClanResponse:
    """
    Remove a clan from a server.

    This endpoint:
    - Deletes the clan document from the database
    - Also deletes associated reminders, logs, and other clan-specific data
    """
    # Normalize clan tag
    if not clan_tag.startswith('#'):
        clan_tag = f'#{clan_tag}'

    # Check if clan exists
    existing = await mongo.clan_db.find_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })
    if not existing:
        raise HTTPException(status_code=404, detail="Clan not found on this server")

    # Delete clan document
    result = await mongo.clan_db.delete_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })

    # Also delete associated reminders
    await mongo.reminders.delete_many({
        "$and": [{"clan": clan_tag}, {"server": server_id}]
    })

    return RemoveClanResponse(
        message="Clan removed successfully",
        server_id=server_id,
        clan_tag=clan_tag,
        deleted_count=result.deleted_count
    )
