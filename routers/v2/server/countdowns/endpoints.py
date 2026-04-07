from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import hikari
import linkd
import logging
from datetime import datetime
from utils.security import check_authentication
from utils.database import MongoClient
from utils.sentry_utils import capture_endpoint_errors
from utils.config import Config
from .models import (
    CountdownStatus,
    ServerCountdownsResponse,
    ClanCountdownsResponse,
    EnableCountdownRequest,
    EnableCountdownResponse,
    DisableCountdownRequest,
    DisableCountdownResponse,
    COUNTDOWN_DB_FIELDS,
    COUNTDOWN_NAMES,
    SERVER_COUNTDOWN_TYPES,
    CLAN_COUNTDOWN_TYPES,
    to_str,
)

config = Config()
security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Countdowns"], include_in_schema=True)
logger = logging.getLogger(__name__)


def calculate_initial_name(countdown_type: str, clan_name: str = None) -> str:
    """Calculate initial channel name for a countdown.

    The actual time will be updated by the bot's background task.
    """
    names = {
        "cwl": "CWL --",
        "clan_games": "CG --",
        "raid_weekend": "Raids --",
        "eos": "EOS --",
        "member_count": "-- Clan Members",
        "season_day": "Day --",
        "war_score": f"{clan_name}: --" if clan_name else "War: --",
        "war_timer": f"{clan_name}: --" if clan_name else "War: --",
    }
    return names.get(countdown_type, "Countdown")


async def create_voice_channel(
    rest: hikari.RESTApp,
    server_id: int,
    channel_name: str
) -> hikari.GuildVoiceChannel:
    """Create a voice channel with view-only permissions."""
    async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
        # Create the voice channel
        channel = await client.create_guild_voice_channel(
            server_id,
            channel_name,
        )

        # Set permissions: everyone can view but not connect
        await client.edit_permission_overwrite(
            channel.id,
            server_id,  # @everyone role has same ID as server
            target_type=hikari.PermissionOverwriteType.ROLE,
            allow=hikari.Permissions.VIEW_CHANNEL,
            deny=hikari.Permissions.CONNECT,
        )

        return channel


async def delete_voice_channel(
    rest: hikari.RESTApp,
    channel_id: int
) -> bool:
    """Delete a voice channel."""
    try:
        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            await client.delete_channel(channel_id)
        return True
    except hikari.NotFoundError:
        # Channel already deleted
        return True
    except Exception:
        return False


@router.get("/{server_id}/countdowns",
            name="Get server countdowns status",
            response_model=ServerCountdownsResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_countdowns(
    server_id: int,
    _user_id: str = None,
    _request: Request = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> ServerCountdownsResponse:
    """Get status of all server-level countdowns."""
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    countdowns = []
    for countdown_type in SERVER_COUNTDOWN_TYPES:
        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        channel_id = server.get(db_field)
        countdowns.append(CountdownStatus(
            type=countdown_type,
            name=COUNTDOWN_NAMES[countdown_type],
            enabled=channel_id is not None,
            channel_id=to_str(channel_id)
        ))

    return ServerCountdownsResponse(
        server_id=str(server_id),
        countdowns=countdowns
    )


@router.get("/{server_id}/clan/{clan_tag}/countdowns",
            name="Get clan countdowns status",
            response_model=ClanCountdownsResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_clan_countdowns(
    server_id: int,
    clan_tag: str,
    _user_id: str = None,
    _request: Request = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
) -> ClanCountdownsResponse:
    """Get status of all clan-level countdowns (war score, war timer)."""
    # Normalize clan tag
    if not clan_tag.startswith('#'):
        clan_tag = f'#{clan_tag}'

    clan = await mongo.clan_db.find_one({
        "$and": [{"tag": clan_tag}, {"server": server_id}]
    })
    if not clan:
        raise HTTPException(status_code=404, detail="Clan not found on this server")

    countdowns = []
    for countdown_type in CLAN_COUNTDOWN_TYPES:
        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        channel_id = clan.get(db_field)
        countdowns.append(CountdownStatus(
            type=countdown_type,
            name=COUNTDOWN_NAMES[countdown_type],
            enabled=channel_id is not None,
            channel_id=to_str(channel_id)
        ))

    return ClanCountdownsResponse(
        server_id=str(server_id),
        clan_tag=clan_tag,
        countdowns=countdowns
    )


@router.post("/{server_id}/countdowns",
             name="Enable a countdown",
             response_model=EnableCountdownResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def enable_countdown(
    server_id: int,
    request_body: EnableCountdownRequest,
    _user_id: str = None,
    _request: Request = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> EnableCountdownResponse:
    """Enable a countdown by creating a voice channel."""
    countdown_type = request_body.countdown_type
    clan_tag = request_body.clan_tag

    # Validate clan tag for clan-level countdowns
    if countdown_type in CLAN_COUNTDOWN_TYPES:
        if not clan_tag:
            raise HTTPException(
                status_code=400,
                detail=f"clan_tag is required for {countdown_type} countdown"
            )

        # Normalize clan tag
        if not clan_tag.startswith('#'):
            clan_tag = f'#{clan_tag}'

        # Check clan exists
        clan_doc = await mongo.clan_db.find_one({
            "$and": [{"tag": clan_tag}, {"server": server_id}]
        })
        if not clan_doc:
            raise HTTPException(status_code=404, detail="Clan not found on this server")

        clan_name = clan_doc.get("name", "Clan")

        # Check if already enabled
        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        if clan_doc.get(db_field):
            raise HTTPException(
                status_code=409,
                detail=f"{COUNTDOWN_NAMES[countdown_type]} countdown is already enabled"
            )
    else:
        # Server-level countdown
        server = await mongo.server_db.find_one({"server": server_id})
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        if server.get(db_field):
            raise HTTPException(
                status_code=409,
                detail=f"{COUNTDOWN_NAMES[countdown_type]} countdown is already enabled"
            )

        clan_name = None

    # Create voice channel
    channel_name = calculate_initial_name(countdown_type, clan_name)

    try:
        channel = await create_voice_channel(rest, server_id, channel_name)
    except hikari.ForbiddenError:
        raise HTTPException(
            status_code=403,
            detail="Bot lacks permissions to create voice channels. Requires MANAGE_CHANNELS permission."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create voice channel: {str(e)}"
        )

    # Save channel ID to database
    if countdown_type in CLAN_COUNTDOWN_TYPES:
        await mongo.clan_db.update_one(
            {"$and": [{"tag": clan_tag}, {"server": server_id}]},
            {"$set": {db_field: channel.id}}
        )
    else:
        await mongo.server_db.update_one(
            {"server": server_id},
            {"$set": {db_field: channel.id}}
        )

    return EnableCountdownResponse(
        message=f"{COUNTDOWN_NAMES[countdown_type]} countdown enabled successfully",
        countdown_type=countdown_type,
        channel_id=str(channel.id),
        channel_name=channel_name
    )


@router.delete("/{server_id}/countdowns",
               name="Disable a countdown",
               response_model=DisableCountdownResponse)
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def disable_countdown(
    server_id: int,
    request_body: DisableCountdownRequest,
    _user_id: str = None,
    _request: Request = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> DisableCountdownResponse:
    """Disable a countdown by deleting the voice channel."""
    countdown_type = request_body.countdown_type
    clan_tag = request_body.clan_tag

    # Get current channel ID
    if countdown_type in CLAN_COUNTDOWN_TYPES:
        if not clan_tag:
            raise HTTPException(
                status_code=400,
                detail=f"clan_tag is required for {countdown_type} countdown"
            )

        # Normalize clan tag
        if not clan_tag.startswith('#'):
            clan_tag = f'#{clan_tag}'

        clan_doc = await mongo.clan_db.find_one({
            "$and": [{"tag": clan_tag}, {"server": server_id}]
        })
        if not clan_doc:
            raise HTTPException(status_code=404, detail="Clan not found on this server")

        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        channel_id = clan_doc.get(db_field)
    else:
        server = await mongo.server_db.find_one({"server": server_id})
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")

        db_field = COUNTDOWN_DB_FIELDS[countdown_type]
        channel_id = server.get(db_field)

    if not channel_id:
        raise HTTPException(
            status_code=404,
            detail=f"{COUNTDOWN_NAMES[countdown_type]} countdown is not enabled"
        )

    # Delete the voice channel
    try:
        await delete_voice_channel(rest, channel_id)
    except Exception as e:
        # Log but continue - channel might already be deleted manually
        logger.warning(f"Could not delete channel {channel_id}: {e}")

    # Remove from database
    if countdown_type in CLAN_COUNTDOWN_TYPES:
        await mongo.clan_db.update_one(
            {"$and": [{"tag": clan_tag}, {"server": server_id}]},
            {"$set": {db_field: None}}
        )
    else:
        await mongo.server_db.update_one(
            {"server": server_id},
            {"$set": {db_field: None}}
        )

    return DisableCountdownResponse(
        message=f"{COUNTDOWN_NAMES[countdown_type]} countdown disabled successfully",
        countdown_type=countdown_type
    )
