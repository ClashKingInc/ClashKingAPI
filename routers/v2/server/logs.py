import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Annotated

from utils.database import MongoClient
from utils.security import check_authentication
from utils.config import Config
from routers.v2.server.logs_models import (
    ServerLogsConfig, LogConfig, ChannelInfo, ThreadInfo,
    ClanLogsConfig, ClanLogTypeConfig, UpdateClanLogRequest
)

config = Config()
security = HTTPBearer()

router = APIRouter(prefix="/v2/server", tags=["Server Logs"], include_in_schema=True)


@router.get("/{server_id}/logs", name="Get server logs configuration")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_logs(
        server_id: int,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> ServerLogsConfig:
    """
    Get the complete logs configuration for a server.
    Returns configuration for all log types aggregated from all clans.
    """
    # Find all clans for this server
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    if not clans:
        return ServerLogsConfig()

    # Map DB log names to API response names
    log_mapping = {
        "join_log": "join_leave_log",
        "leave_log": "join_leave_log",
        "donation_log": "donation_log",
        "clan_achievement_log": "clan_achievement_log",
        "clan_requirements_log": "clan_requirements_log",
        "clan_description_log": "clan_description_log",
        "war_log": "war_log",
        "war_panel": "war_panel",
        "cwl_lineup_change_log": "cwl_lineup_change_log",
        "capital_donations": "capital_donation_log",
        "capital_attacks": "capital_raid_log",
        "raid_panel": "raid_panel",
        "capital_weekly_summary": "capital_weekly_summary",
        "role_change": "player_upgrade_log",
        "th_upgrade": "player_upgrade_log",
        "troop_upgrade": "player_upgrade_log",
        "hero_upgrade": "player_upgrade_log",
        "spell_upgrade": "player_upgrade_log",
        "hero_equipment_upgrade": "player_upgrade_log",
        "super_troop_boost": "player_upgrade_log",
        "league_change": "player_upgrade_log",
        "name_change": "player_upgrade_log",
        "legend_log_attacks": "legend_log",
        "legend_log_defenses": "legend_log",
    }

    # Aggregate logs by type
    aggregated_logs = {}
    for clan in clans:
        clan_tag = clan.get("tag")
        logs = clan.get("logs", {})
        for db_log_name, api_log_name in log_mapping.items():
            log_data = logs.get(db_log_name)
            if not log_data or not log_data.get("webhook"):
                continue
            webhook_id = str(log_data.get("webhook"))
            thread_id = str(log_data.get("thread")) if log_data.get("thread") else None
            config_key = f"{webhook_id}_{thread_id}"
            if api_log_name not in aggregated_logs:
                aggregated_logs[api_log_name] = {}
            if config_key not in aggregated_logs[api_log_name]:
                aggregated_logs[api_log_name][config_key] = {
                    "webhook": webhook_id,
                    "thread": thread_id,
                    "clans": []
                }
            if clan_tag not in aggregated_logs[api_log_name][config_key]["clans"]:
                aggregated_logs[api_log_name][config_key]["clans"].append(clan_tag)

    # Convert to response format
    result = {}
    for api_log_name, configs in aggregated_logs.items():
        if configs:
            first_config = next(iter(configs.values()))
            channel_id = None
            try:
                async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
                    webhook = await client.fetch_webhook(int(first_config["webhook"]))
                    channel_id = str(getattr(webhook, 'channel_id', None))
            except:
                pass
            result[api_log_name] = LogConfig(
                enabled=True,
                channel=channel_id,
                thread=first_config["thread"],
                webhook=first_config["webhook"],
                clans=first_config["clans"]
            )

    return ServerLogsConfig(
        join_leave_log=result.get("join_leave_log"),
        donation_log=result.get("donation_log"),
        clan_achievement_log=result.get("clan_achievement_log"),
        clan_requirements_log=result.get("clan_requirements_log"),
        clan_description_log=result.get("clan_description_log"),
        war_log=result.get("war_log"),
        war_panel=result.get("war_panel"),
        cwl_lineup_change_log=result.get("cwl_lineup_change_log"),
        capital_donation_log=result.get("capital_donation_log"),
        capital_raid_log=result.get("capital_raid_log"),
        raid_panel=result.get("raid_panel"),
        capital_weekly_summary=result.get("capital_weekly_summary"),
        player_upgrade_log=result.get("player_upgrade_log"),
        legend_log=result.get("legend_log"),
        ban_log=result.get("ban_log"),
        strike_log=result.get("strike_log"),
    )


@router.put("/{server_id}/logs", name="Update server logs configuration")
@linkd.ext.fastapi.inject
@check_authentication
async def update_server_logs(
        server_id: int,
        logs_config: ServerLogsConfig,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Update the complete logs configuration for a server.
    Updates webhook configurations in clan_db for selected clans.
    """
    all_clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    if not all_clans:
        raise HTTPException(status_code=404, detail="No clans found for this server")

    # Map API log names to DB log names
    api_to_db_mapping = {
        "join_leave_log": ["join_log", "leave_log"],
        "donation_log": ["donation_log"],
        "clan_achievement_log": ["clan_achievement_log"],
        "clan_requirements_log": ["clan_requirements_log"],
        "clan_description_log": ["clan_description_log"],
        "war_log": ["war_log"],
        "war_panel": ["war_panel"],
        "cwl_lineup_change_log": ["cwl_lineup_change_log"],
        "capital_donation_log": ["capital_donations"],
        "capital_raid_log": ["capital_attacks"],
        "raid_panel": ["raid_panel"],
        "capital_weekly_summary": ["capital_weekly_summary"],
        "player_upgrade_log": ["th_upgrade", "troop_upgrade", "hero_upgrade", "spell_upgrade", "hero_equipment_upgrade", "super_troop_boost", "role_change", "league_change", "name_change"],
    }

    updated_count = 0
    for api_log_name, config in logs_config.model_dump(exclude_none=True).items():
        if config is None or not isinstance(config, dict):
            continue
        db_log_names = api_to_db_mapping.get(api_log_name, [])
        if not db_log_names:
            continue
        enabled = config.get("enabled", False)
        webhook_id = config.get("webhook")
        thread_id = config.get("thread")
        selected_clans = config.get("clans", [])

        if not enabled or not webhook_id:
            for db_log_name in db_log_names:
                result = await mongo.clan_db.update_many(
                    {"server": server_id},
                    {"$set": {f"logs.{db_log_name}.webhook": None, f"logs.{db_log_name}.thread": None}}
                )
                updated_count += result.modified_count
            continue

        if not webhook_id and config.get("channel"):
            try:
                channel_id = int(config["channel"])
                async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
                    webhook = await client.create_webhook(
                        channel_id,
                        name="ClashKing Logs",
                        reason="Created by ClashKing Dashboard"
                    )
                    webhook_id = str(webhook.id)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to create webhook for channel {config.get('channel')}: {str(e)}"
                )

        for db_log_name in db_log_names:
            if selected_clans:
                result = await mongo.clan_db.update_many(
                    {"server": server_id, "tag": {"$in": selected_clans}},
                    {"$set": {
                        f"logs.{db_log_name}.webhook": int(webhook_id) if webhook_id else None,
                        f"logs.{db_log_name}.thread": int(thread_id) if thread_id else None
                    }}
                )
            else:
                result = await mongo.clan_db.update_many(
                    {"server": server_id},
                    {"$set": {
                        f"logs.{db_log_name}.webhook": int(webhook_id) if webhook_id else None,
                        f"logs.{db_log_name}.thread": int(thread_id) if thread_id else None
                    }}
                )
            updated_count += result.modified_count

    return {
        "message": "Logs configuration updated successfully",
        "server_id": server_id,
        "updated_clans": updated_count
    }


@router.patch("/{server_id}/logs/{log_type}", name="Update specific log type")
@linkd.ext.fastapi.inject
@check_authentication
async def update_log_type(
        server_id: int,
        log_type: str,
        log_config: LogConfig,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Update a specific log type configuration.

    Valid log types: join_leave_log, donation_log, war_log, capital_donation_log,
    capital_raid_log, player_upgrade_log, legend_log, ban_log, strike_log
    """
    valid_log_types = [
        "join_leave_log", "donation_log", "war_log", "capital_donation_log",
        "capital_raid_log", "player_upgrade_log", "legend_log", "ban_log", "strike_log"
    ]

    if log_type not in valid_log_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid log type. Must be one of: {', '.join(valid_log_types)}"
        )

    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    update_field = f"logs.{log_type}"
    result = await mongo.server_db.update_one(
        {"server": server_id},
        {"$set": {update_field: log_config.model_dump(exclude_none=True)}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")

    return {
        "message": f"{log_type} configuration updated successfully",
        "server_id": server_id,
        "log_type": log_type
    }


@router.get("/{server_id}/clans", name="Get server clans")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_clans(
        server_id: int,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> List[dict]:
    """
    Get all clans registered for a Discord server.
    Returns basic clan information (tag and name).
    """
    clans = await mongo.clan_db.find(
        {"server": server_id},
        {"tag": 1, "name": 1, "_id": 0}
    ).to_list(length=None)
    return clans


@router.get("/{server_id}/channels", name="Get server Discord channels")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_channels(
        server_id: int,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> List[ChannelInfo]:
    """
    Get all text channels for a Discord server.
    Only returns channels where the bot has access.
    """
    try:
        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            try:
                channels = await client.fetch_guild_channels(server_id)
            except hikari.ForbiddenError:
                raise HTTPException(
                    status_code=403,
                    detail="Bot does not have access to this server"
                )
            except hikari.NotFoundError:
                raise HTTPException(
                    status_code=404,
                    detail="Server not found"
                )

        result = []
        for channel in channels:
            if isinstance(channel, (hikari.GuildTextChannel, hikari.GuildNewsChannel)):
                channel_type = "text" if isinstance(channel, hikari.GuildTextChannel) else "news"
                parent_name = None
                if channel.parent_id:
                    parent_channel = next((c for c in channels if c.id == channel.parent_id), None)
                    if parent_channel and hasattr(parent_channel, 'name'):
                        parent_name = parent_channel.name
                result.append(ChannelInfo(
                    id=str(channel.id),
                    name=channel.name,
                    type=channel_type,
                    parent_id=str(channel.parent_id) if channel.parent_id else None,
                    parent_name=parent_name
                ))

        result.sort(key=lambda x: (x.parent_name or "", x.name))
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch channels: {str(e)}"
        )


@router.get("/{server_id}/threads", name="Get server Discord threads")
@linkd.ext.fastapi.inject
@check_authentication
async def get_server_threads(
        server_id: int,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> List[ThreadInfo]:
    """
    Get all active threads for a Discord server.
    """
    try:
        async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
            try:
                channels = await client.fetch_guild_channels(server_id)
                threads = []
                channel_map = {c.id: c.name for c in channels if hasattr(c, 'name')}
                for channel in channels:
                    if isinstance(channel, (hikari.GuildTextChannel, hikari.GuildNewsChannel)):
                        try:
                            channel_threads = await client.fetch_active_threads(channel.id)
                            for thread in channel_threads:
                                threads.append(ThreadInfo(
                                    id=str(thread.id),
                                    name=thread.name,
                                    parent_channel_id=str(thread.parent_id),
                                    parent_channel_name=channel_map.get(thread.parent_id),
                                    archived=False
                                ))
                        except:
                            continue
                return threads

            except hikari.ForbiddenError:
                raise HTTPException(status_code=403, detail="Bot does not have access to this server")
            except hikari.NotFoundError:
                raise HTTPException(status_code=404, detail="Server not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch threads: {str(e)}")


@router.get("/{server_id}/clan-logs", name="Get all clans logs configuration")
@linkd.ext.fastapi.inject
@check_authentication
async def get_all_clans_logs(
        server_id: int,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> List[ClanLogsConfig]:
    """
    Get logs configuration for all clans in a server.
    Returns detailed log configuration for each clan (not aggregated).
    """
    clans = await mongo.clan_db.find({"server": server_id}).to_list(length=None)
    # Collect all unique webhook IDs
    webhook_ids = set()

    for clan in clans:
        logs_data = clan.get("logs", {})
        for log_data in logs_data.values():
            if isinstance(log_data, dict) and log_data.get("webhook"):
                webhook_ids.add(log_data["webhook"])

    # Fetch channel IDs for all webhooks
    webhook_to_channel = {}

    async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
        for webhook_id in webhook_ids:
            try:
                webhook = await client.fetch_webhook(webhook_id)
                webhook_to_channel[webhook_id] = getattr(webhook, 'channel_id', None)
            except:
                # Webhook might be deleted
                continue

    result = []

    for clan in clans:
        logs_data = clan.get("logs", {})
        clan_logs = ClanLogsConfig(
            tag=clan.get("tag"),
            name=clan.get("name"),
            # Clan logs
            join_log=_parse_clan_log_type(logs_data.get("join_log"), webhook_to_channel),
            leave_log=_parse_clan_log_type(logs_data.get("leave_log"), webhook_to_channel),
            donation_log=_parse_clan_log_type(logs_data.get("donation_log"), webhook_to_channel),
            clan_achievement_log=_parse_clan_log_type(logs_data.get("clan_achievement_log"), webhook_to_channel),
            clan_requirements_log=_parse_clan_log_type(logs_data.get("clan_requirements_log"), webhook_to_channel),
            clan_description_log=_parse_clan_log_type(logs_data.get("clan_description_log"), webhook_to_channel),
            # War logs
            war_log=_parse_clan_log_type(logs_data.get("war_log"), webhook_to_channel),
            war_panel=_parse_clan_log_type(logs_data.get("war_panel"), webhook_to_channel),
            cwl_lineup_change_log=_parse_clan_log_type(logs_data.get("cwl_lineup_change_log"), webhook_to_channel),

            # Capital logs
            capital_donations=_parse_clan_log_type(logs_data.get("capital_donations"), webhook_to_channel),
            capital_attacks=_parse_clan_log_type(logs_data.get("capital_attacks"), webhook_to_channel),
            raid_panel=_parse_clan_log_type(logs_data.get("raid_panel"), webhook_to_channel),
            capital_weekly_summary=_parse_clan_log_type(logs_data.get("capital_weekly_summary"), webhook_to_channel),

            # Player logs
            role_change=_parse_clan_log_type(logs_data.get("role_change"), webhook_to_channel),
            troop_upgrade=_parse_clan_log_type(logs_data.get("troop_upgrade"), webhook_to_channel),
            super_troop_boost_log=_parse_clan_log_type(logs_data.get("super_troop_boost"), webhook_to_channel),
            th_upgrade=_parse_clan_log_type(logs_data.get("th_upgrade"), webhook_to_channel),
            league_change=_parse_clan_log_type(logs_data.get("league_change"), webhook_to_channel),
            spell_upgrade=_parse_clan_log_type(logs_data.get("spell_upgrade"), webhook_to_channel),
            hero_upgrade=_parse_clan_log_type(logs_data.get("hero_upgrade"), webhook_to_channel),
            hero_equipment_upgrade=_parse_clan_log_type(logs_data.get("hero_equipment_upgrade"), webhook_to_channel),
            name_change=_parse_clan_log_type(logs_data.get("name_change"), webhook_to_channel),
            legend_log_attacks=_parse_clan_log_type(logs_data.get("legend_log_attacks"), webhook_to_channel),
            legend_log_defenses=_parse_clan_log_type(logs_data.get("legend_log_defenses"), webhook_to_channel)
        )
        result.append(clan_logs)
    return result


@router.put("/{server_id}/clan/{clan_tag}/logs", name="Update clan logs configuration")
@linkd.ext.fastapi.inject
@check_authentication
async def update_clan_logs(
        server_id: int,
        clan_tag: str,
        request: UpdateClanLogRequest,
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Update logs configuration for a specific clan.
    If channel_id is provided and no webhook exists, creates a new webhook.
    """
    print(f"Looking for clan - tag: {clan_tag!r} (type: {type(clan_tag)}), server: {server_id!r} (type: {type(server_id)})")
    clan = await mongo.clan_db.find_one({"tag": clan_tag, "server": server_id})
    print(f"Clan found: {clan is not None}")
    if not clan:
        raise HTTPException(status_code=404, detail=f"Clan {clan_tag} not found for this server")

    # Convert IDs to int (handles both string and int input from frontend)
    webhook_id = None
    thread_id = int(request.thread_id) if request.thread_id is not None else None
    target_channel_id = int(request.channel_id) if request.channel_id is not None else None

    print(f"Request - channel_id: {target_channel_id}, thread_id: {thread_id}, log_types: {request.log_types}")

    # If a thread_id is provided, we need to get the parent channel to create the webhook
    if thread_id:
        try:
            async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
                thread = await client.fetch_channel(thread_id)
                if hasattr(thread, 'parent_id') and thread.parent_id:
                    target_channel_id = thread.parent_id
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch thread info: {str(e)}")

    # Create a new webhook for this channel
    if target_channel_id:
        try:
            print(f"Creating webhook for channel {target_channel_id}...")
            async with rest.acquire(token=config.bot_token, token_type=hikari.TokenType.BOT) as client:
                # First verify the channel exists and is a text channel
                try:
                    channel = await client.fetch_channel(target_channel_id)
                    print(f"Channel found: {channel.name} (type: {channel.type})")
                except hikari.NotFoundError as e:
                    print(f"Channel {target_channel_id} not found: {e}")
                    raise HTTPException(
                        status_code=404,
                        detail=f"Channel {target_channel_id} not found. It may have been deleted or the bot doesn't have access to it."
                    )
                except hikari.ForbiddenError as e:
                    print(f"Bot doesn't have access to channel {target_channel_id}: {e}")
                    raise HTTPException(
                        status_code=403,
                        detail=f"Bot doesn't have access to channel {target_channel_id}."
                    )

                webhook = await client.create_webhook(
                    channel=target_channel_id,
                    name="ClashKing",
                    reason="Created by ClashKing Dashboard"
                )
                webhook_id = webhook.id
                print(f"Webhook created: {webhook_id}")
        except hikari.ForbiddenError as e:
            print(f"ForbiddenError creating webhook: {e}")
            raise HTTPException(
                status_code=403,
                detail="Bot does not have MANAGE_WEBHOOKS permission in this channel. Please ensure the bot has the 'Manage Webhooks' permission."
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"Webhook creation error: {type(e).__name__}: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to create webhook: {str(e)}"
            )

    update_ops = {}
    for log_type in request.log_types:
        if webhook_id is not None:
            update_ops[f"logs.{log_type}.webhook"] = webhook_id
        if thread_id is not None:
            update_ops[f"logs.{log_type}.thread"] = thread_id
        elif webhook_id is not None:
            update_ops[f"logs.{log_type}.thread"] = None

    if not update_ops:
        raise HTTPException(status_code=400, detail="No updates to perform")

    print(f"Update operations: {update_ops}")
    result = await mongo.clan_db.update_one(
        {"tag": clan_tag, "server": server_id},
        {"$set": update_ops}
    )
    print(f"Update result - matched: {result.matched_count}, modified: {result.modified_count}")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clan not found")

    # modified_count can be 0 if values are already the same, that's OK

    return {
        "message": "Clan logs updated successfully",
        "clan_tag": clan_tag,
        "updated_log_types": request.log_types,
        "webhook_id": webhook_id,
        "thread_id": thread_id
    }


@router.delete("/{server_id}/clan/{clan_tag}/logs", name="Delete clan logs configuration")
@linkd.ext.fastapi.inject
@check_authentication
async def delete_clan_logs(
        server_id: int,
        clan_tag: str,
        log_types: Annotated[str, Query(description="Comma-separated list of log types to delete")],
        user_id: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        rest: hikari.RESTApp
) -> dict:
    """
    Delete clan logs configuration for specific log types.

    This will remove the webhook and thread configuration for the specified log types.
    The log types should be provided as a comma-separated string.

    Example: log_types=join_log,leave_log,donation_log
    """
    # Normalize clan tag
    if not clan_tag.startswith('#'):
        clan_tag = f'#{clan_tag}'

    # Parse comma-separated log types
    log_types_list = [lt.strip() for lt in log_types.split(',')]

    print(f"Looking for clan - tag: {clan_tag!r}, server: {server_id!r}")

    # Find the clan in database
    clan = await mongo.clan_db.find_one({"tag": clan_tag, "server": server_id})

    if not clan:
        raise HTTPException(status_code=404, detail=f"Clan {clan_tag} not found on this server")

    # Build unset document to remove log configurations
    unset_doc = {}
    for log_type in log_types_list:
        unset_doc[f"logs.{log_type}"] = ""

    print(f"Deleting log types: {log_types_list}")
    print(f"Unset operations: {unset_doc}")

    # Delete clan logs configuration
    result = await mongo.clan_db.update_one(
        {"tag": clan_tag, "server": server_id},
        {"$unset": unset_doc}
    )

    print(f"Delete result - matched: {result.matched_count}, modified: {result.modified_count}")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clan not found")

    return {
        "message": "Clan logs deleted successfully",
        "clan_tag": clan_tag,
        "deleted_log_types": log_types_list
    }


def _parse_clan_log_type(data: dict | None, webhook_to_channel: dict = None) -> ClanLogTypeConfig | None:
    """Parse a single log type configuration from database."""
    if not data or not isinstance(data, dict):
        return None
    webhook = data.get("webhook")
    thread = data.get("thread")
    if webhook is None and thread is None:
        return None
    # Get channel ID from webhook if available
    channel = None
    if webhook and webhook_to_channel:
        channel_id = webhook_to_channel.get(webhook)
        if channel_id:
            channel = str(channel_id)

    return ClanLogTypeConfig(
        webhook=str(webhook) if webhook is not None else None,
        channel=channel,
        thread=str(thread) if thread is not None else None
    )
