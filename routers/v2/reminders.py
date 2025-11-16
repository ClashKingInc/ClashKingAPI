from fastapi import Request, Response, HTTPException, APIRouter, Path
from pydantic import BaseModel, Field
from typing import Annotated, List, Optional, Literal, Union
from datetime import datetime
from utils.utils import db_client, check_authentication, remove_id_fields
from bson import ObjectId


router = APIRouter(prefix="/v2", tags=["Reminders Endpoints"], include_in_schema=False)


# Pydantic models for request/response validation
class ReminderBase(BaseModel):
    type: Literal["War", "Clan Games", "Clan Capital", "inactivity", "roster"]
    channel: int
    time: str
    custom_text: Optional[str] = ""


class ClanReminderCreate(ReminderBase):
    """For War, Clan Games, Clan Capital, and inactivity reminders"""
    clan: str
    roles: Optional[List[str]] = None
    townhalls: Optional[List[int]] = None
    townhall_filter: Optional[List[int]] = None
    # War-specific
    types: Optional[List[str]] = None  # war types: Random, Friendly, CWL
    # Clan Games-specific
    point_threshold: Optional[int] = None
    # Clan Capital-specific
    attack_threshold: Optional[int] = None


class RosterReminderCreate(ReminderBase):
    """For roster reminders"""
    roster: str  # ObjectId as string
    ping_type: Optional[str] = "All Roster Members"


class ReminderUpdate(BaseModel):
    """Update model - all fields optional"""
    channel: Optional[int] = None
    time: Optional[str] = None
    custom_text: Optional[str] = None
    roles: Optional[List[str]] = None
    townhalls: Optional[List[int]] = None
    townhall_filter: Optional[List[int]] = None
    types: Optional[List[str]] = None
    point_threshold: Optional[int] = None
    attack_threshold: Optional[int] = None
    ping_type: Optional[str] = None


class ReminderResponse(BaseModel):
    """Response model"""
    id: str
    server: int
    type: str
    channel: int
    time: str
    custom_text: Optional[str] = ""
    # Optional fields depending on type
    clan: Optional[str] = None
    roles: Optional[List[str]] = None
    townhalls: Optional[List[int]] = None
    townhall_filter: Optional[List[int]] = None
    types: Optional[List[str]] = None
    point_threshold: Optional[int] = None
    attack_threshold: Optional[int] = None
    roster: Optional[str] = None
    ping_type: Optional[str] = None

    class Config:
        populate_by_name = True


@router.get("/reminders/{server_id}", name="Get all reminders for a server")
@check_authentication
async def get_reminders(
    server_id: Annotated[int, Path(description="Discord server ID")],
    request: Request,
    response: Response,
    reminder_type: Optional[str] = None,
    clan_tag: Optional[str] = None
):
    """
    Get all reminders for a specific server.
    Optionally filter by reminder type and/or clan tag.
    """
    query = {"server": server_id}

    if reminder_type:
        query["type"] = reminder_type

    if clan_tag:
        query["clan"] = clan_tag

    reminders = await db_client.reminders.find(query).to_list(length=None)

    # Convert ObjectId to string for JSON serialization
    for reminder in reminders:
        reminder["id"] = str(reminder.pop("_id"))
        if "roster" in reminder and isinstance(reminder["roster"], ObjectId):
            reminder["roster"] = str(reminder["roster"])

    return {
        "status": "success",
        "count": len(reminders),
        "reminders": reminders
    }


@router.get("/reminders/{server_id}/{reminder_id}", name="Get a specific reminder")
@check_authentication
async def get_reminder(
    server_id: Annotated[int, Path(description="Discord server ID")],
    reminder_id: Annotated[str, Path(description="Reminder ID")],
    request: Request,
    response: Response
):
    """Get a specific reminder by ID."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID format")

    reminder = await db_client.reminders.find_one({"_id": obj_id, "server": server_id})

    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # Convert ObjectId to string
    reminder["id"] = str(reminder.pop("_id"))
    if "roster" in reminder and isinstance(reminder["roster"], ObjectId):
        reminder["roster"] = str(reminder["roster"])

    return {
        "status": "success",
        "reminder": reminder
    }


@router.post("/reminders/{server_id}", name="Create a new reminder")
@check_authentication
async def create_reminder(
    server_id: Annotated[int, Path(description="Discord server ID")],
    reminder: Union[ClanReminderCreate, RosterReminderCreate],
    request: Request,
    response: Response
):
    """
    Create a new reminder for a server.

    The reminder type determines which fields are required:
    - War: clan, channel, time, types (optional), roles (optional), townhall_filter (optional)
    - Clan Games: clan, channel, time, point_threshold (optional), roles (optional), townhalls (optional)
    - Clan Capital: clan, channel, time, attack_threshold (optional), roles (optional), townhalls (optional)
    - inactivity: clan, channel, time, roles (optional), townhall_filter (optional)
    - roster: roster, channel, time, ping_type (optional)
    """
    reminder_data = reminder.model_dump(exclude_none=True)
    reminder_data["server"] = server_id

    # Check for duplicate reminder (same server, type, time, and clan/roster)
    duplicate_query = {
        "server": server_id,
        "type": reminder_data["type"],
        "time": reminder_data["time"]
    }

    if "clan" in reminder_data:
        duplicate_query["clan"] = reminder_data["clan"]
    elif "roster" in reminder_data:
        # Convert roster string to ObjectId
        try:
            reminder_data["roster"] = ObjectId(reminder_data["roster"])
            duplicate_query["roster"] = reminder_data["roster"]
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid roster ID format")

    existing = await db_client.reminders.find_one(duplicate_query)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A reminder with these parameters already exists. Use PUT to update it."
        )

    # Insert the new reminder
    result = await db_client.reminders.insert_one(reminder_data)

    # Fetch the created reminder
    created_reminder = await db_client.reminders.find_one({"_id": result.inserted_id})
    created_reminder["id"] = str(created_reminder.pop("_id"))
    if "roster" in created_reminder and isinstance(created_reminder["roster"], ObjectId):
        created_reminder["roster"] = str(created_reminder["roster"])

    return {
        "status": "success",
        "message": "Reminder created successfully",
        "reminder": created_reminder
    }


@router.put("/reminders/{server_id}/{reminder_id}", name="Update a reminder")
@check_authentication
async def update_reminder(
    server_id: Annotated[int, Path(description="Discord server ID")],
    reminder_id: Annotated[str, Path(description="Reminder ID")],
    update_data: ReminderUpdate,
    request: Request,
    response: Response
):
    """
    Update an existing reminder.
    Only provided fields will be updated.
    """
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID format")

    # Check if reminder exists
    existing = await db_client.reminders.find_one({"_id": obj_id, "server": server_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # Get only the fields that were provided
    update_fields = update_data.model_dump(exclude_none=True)

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update the reminder
    await db_client.reminders.update_one(
        {"_id": obj_id},
        {"$set": update_fields}
    )

    # Fetch the updated reminder
    updated_reminder = await db_client.reminders.find_one({"_id": obj_id})
    updated_reminder["id"] = str(updated_reminder.pop("_id"))
    if "roster" in updated_reminder and isinstance(updated_reminder["roster"], ObjectId):
        updated_reminder["roster"] = str(updated_reminder["roster"])

    return {
        "status": "success",
        "message": "Reminder updated successfully",
        "reminder": updated_reminder
    }


@router.delete("/reminders/{server_id}/{reminder_id}", name="Delete a reminder")
@check_authentication
async def delete_reminder(
    server_id: Annotated[int, Path(description="Discord server ID")],
    reminder_id: Annotated[str, Path(description="Reminder ID")],
    request: Request,
    response: Response
):
    """Delete a reminder by ID."""
    try:
        obj_id = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID format")

    # Check if reminder exists
    existing = await db_client.reminders.find_one({"_id": obj_id, "server": server_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # Delete the reminder
    result = await db_client.reminders.delete_one({"_id": obj_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to delete reminder")

    return {
        "status": "success",
        "message": "Reminder deleted successfully"
    }


@router.delete("/reminders/{server_id}", name="Delete all reminders for a server")
@check_authentication
async def delete_all_reminders(
    server_id: Annotated[int, Path(description="Discord server ID")],
    request: Request,
    response: Response,
    reminder_type: Optional[str] = None,
    clan_tag: Optional[str] = None
):
    """
    Delete all reminders for a specific server.
    Optionally filter by reminder type and/or clan tag.
    """
    query = {"server": server_id}

    if reminder_type:
        query["type"] = reminder_type

    if clan_tag:
        query["clan"] = clan_tag

    result = await db_client.reminders.delete_many(query)

    return {
        "status": "success",
        "message": f"Deleted {result.deleted_count} reminder(s)",
        "deleted_count": result.deleted_count
    }
