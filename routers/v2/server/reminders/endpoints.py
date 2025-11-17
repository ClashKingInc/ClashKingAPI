import hikari
import linkd
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional

from utils.database import MongoClient
from utils.security import check_authentication
from utils.sentry_utils import capture_endpoint_errors
from .models import (
    ReminderConfig,
    ServerRemindersResponse,
    CreateReminderRequest,
    UpdateReminderRequest
)

security = HTTPBearer()

router = APIRouter(prefix="/v2/server", tags=["Server Reminders"], include_in_schema=True)


@router.get("/{server_id}/reminders", name="Get server reminders")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_reminders(
    server_id: int,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> ServerRemindersResponse:
    """
    Get all reminders configured for a server.
    Returns reminders for Wars, Clan Capital, Clan Games, and Inactivity.
    """
    # Find all reminders for this server
    reminders = await mongo.reminders.find({"server": server_id}).to_list(length=None)

    # Group reminders by type
    war_reminders = []
    capital_reminders = []
    clan_games_reminders = []
    inactivity_reminders = []
    roster_reminders = []

    for reminder in reminders:
        # Handle different field names based on type (match ClashKingBot schema)
        reminder_type = reminder.get("type")

        # Get townhall filter - ClashKingBot uses 'townhalls' for Capital/Games, 'townhall_filter' for War/Inactivity
        if reminder_type in ["Clan Capital", "Clan Games"]:
            townhall_list = reminder.get("townhalls", [])
        else:
            townhall_list = reminder.get("townhall_filter", [])

        reminder_config = ReminderConfig(
            id=str(reminder.get("_id")),
            type=reminder_type,
            clan_tag=reminder.get("clan"),
            channel_id=str(reminder.get("channel")) if reminder.get("channel") else None,
            time=reminder.get("time"),
            custom_text=reminder.get("custom_text", ""),
            townhall_filter=townhall_list,
            roles=reminder.get("roles", []),
            war_types=reminder.get("types", []),
            point_threshold=reminder.get("point_threshold"),
            attack_threshold=reminder.get("attack_threshold"),
            roster_id=str(reminder.get("roster")) if reminder.get("roster") else None,
            ping_type=reminder.get("ping_type")
        )

        if reminder.get("type") == "War":
            war_reminders.append(reminder_config)
        elif reminder.get("type") == "Clan Capital":
            capital_reminders.append(reminder_config)
        elif reminder.get("type") == "Clan Games":
            clan_games_reminders.append(reminder_config)
        elif reminder.get("type") == "Inactivity":
            inactivity_reminders.append(reminder_config)
        elif reminder.get("type") == "roster":
            roster_reminders.append(reminder_config)

    return ServerRemindersResponse(
        war_reminders=war_reminders,
        capital_reminders=capital_reminders,
        clan_games_reminders=clan_games_reminders,
        inactivity_reminders=inactivity_reminders,
        roster_reminders=roster_reminders
    )


@router.post("/{server_id}/reminders", name="Create a reminder")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def create_reminder(
    server_id: int,
    reminder: CreateReminderRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> dict:
    """
    Create a new reminder for a server.
    """
    # Verify server exists
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Build reminder document
    reminder_doc = {
        "server": server_id,
        "type": reminder.type,
        "clan": reminder.clan_tag,
        "channel": int(reminder.channel_id) if reminder.channel_id else None,
        "time": reminder.time,
        "custom_text": reminder.custom_text or "",
    }

    # Add type-specific fields (match ClashKingBot schema)
    if reminder.type == "War":
        reminder_doc["types"] = reminder.war_types or ["Random", "Friendly", "CWL"]
        reminder_doc["townhall_filter"] = reminder.townhall_filter or []
        reminder_doc["roles"] = reminder.roles or []
    elif reminder.type == "Clan Capital":
        reminder_doc["attack_threshold"] = reminder.attack_threshold or 1
        reminder_doc["townhalls"] = reminder.townhall_filter or []  # ClashKingBot uses 'townhalls'
        reminder_doc["roles"] = reminder.roles or []
    elif reminder.type == "Clan Games":
        reminder_doc["point_threshold"] = reminder.point_threshold or 4000
        reminder_doc["townhalls"] = reminder.townhall_filter or []  # ClashKingBot uses 'townhalls'
        reminder_doc["roles"] = reminder.roles or []
    elif reminder.type == "Inactivity":
        reminder_doc["townhall_filter"] = reminder.townhall_filter or []
        reminder_doc["roles"] = reminder.roles or []
    elif reminder.type == "roster":
        from bson import ObjectId
        reminder_doc["roster"] = ObjectId(reminder.roster_id) if reminder.roster_id else None
        reminder_doc["ping_type"] = reminder.ping_type or "All Roster Members"

    # Insert into database
    result = await mongo.reminders.insert_one(reminder_doc)

    return {
        "message": "Reminder created successfully",
        "reminder_id": str(result.inserted_id),
        "server_id": server_id
    }


@router.put("/{server_id}/reminders/{reminder_id}", name="Update a reminder")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def update_reminder(
    server_id: int,
    reminder_id: str,
    reminder: UpdateReminderRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> dict:
    """
    Update an existing reminder.
    """
    from bson import ObjectId

    # Verify reminder exists and belongs to server
    existing = await mongo.reminders.find_one({
        "_id": ObjectId(reminder_id),
        "server": server_id
    })

    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # Build update document (match ClashKingBot schema)
    update_doc = {}
    if reminder.channel_id is not None:
        update_doc["channel"] = int(reminder.channel_id)
    if reminder.time is not None:
        update_doc["time"] = reminder.time
    if reminder.custom_text is not None:
        update_doc["custom_text"] = reminder.custom_text

    # Handle townhall filter based on type
    if reminder.townhall_filter is not None:
        reminder_type = existing.get("type")
        if reminder_type in ["Clan Capital", "Clan Games"]:
            update_doc["townhalls"] = reminder.townhall_filter  # ClashKingBot uses 'townhalls'
        else:
            update_doc["townhall_filter"] = reminder.townhall_filter

    if reminder.roles is not None:
        update_doc["roles"] = reminder.roles
    if reminder.war_types is not None:
        update_doc["types"] = reminder.war_types
    if reminder.point_threshold is not None:
        update_doc["point_threshold"] = reminder.point_threshold
    if reminder.attack_threshold is not None:
        update_doc["attack_threshold"] = reminder.attack_threshold
    if reminder.ping_type is not None:
        update_doc["ping_type"] = reminder.ping_type

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update reminder
    result = await mongo.reminders.update_one(
        {"_id": ObjectId(reminder_id)},
        {"$set": update_doc}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {
        "message": "Reminder updated successfully",
        "reminder_id": reminder_id,
        "updated_fields": len(update_doc)
    }


@router.delete("/{server_id}/reminders/{reminder_id}", name="Delete a reminder")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def delete_reminder(
    server_id: int,
    reminder_id: str,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
    rest: hikari.RESTApp
) -> dict:
    """
    Delete a reminder.
    """
    from bson import ObjectId

    # Verify reminder exists and belongs to server
    result = await mongo.reminders.delete_one({
        "_id": ObjectId(reminder_id),
        "server": server_id
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {
        "message": "Reminder deleted successfully",
        "reminder_id": reminder_id
    }