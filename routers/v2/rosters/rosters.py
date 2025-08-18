from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Query, Depends
import pendulum as pend
import random
import string
import coc

from routers.v2.rosters.roster_models import (
    CreateRosterModel, TemplateUpdateModel, RosterUpdateModel,
    RosterFiltersModel, TemplateFiltersModel, AddMembersByTagModel,
    UpdateMemberModel, ImportRosterModel,
    EventMissingMembersModel
)
from routers.v2.rosters.roster_utils import fetch_clan_and_badge, extract_discord_user_id, check_user_account_limit, \
    calculate_bulk_stats
from utils.database import MongoClient as mongo
from utils.dependencies import get_coc_client
from utils.utils import fix_tag

router = APIRouter(prefix="/v2/roster", tags=["Rosters"], include_in_schema=True)


@router.post("/create", response_model=dict, status_code=status.HTTP_201_CREATED, name="Create Roster")
async def create_roster(roster_data: CreateRosterModel):
    """Create a roster OR a roster template."""

    clan = await fetch_clan_and_badge(roster_data.clan_tag)

    if not roster_data.recurrent:
        # Generate event_instance if event_type is provided and time is set
        event_instance = None
        if roster_data.event_type and roster_data.time:
            event_instance = generate_event_instance(roster_data.event_type, roster_data.time)

        roster_doc = {
            # Basic roster fields & settings
            "clan_name": clan["name"],
            "clan_tag": roster_data.clan_tag,
            "clan_badge": clan["badge"],
            "members": [],
            "alias": roster_data.alias,
            "server_id": roster_data.server_id,
            "th_restriction": roster_data.th_restriction,
            "time": roster_data.time,
            "description": roster_data.description,
            "roster_type": roster_data.roster_type,
            "max_accounts_per_user": roster_data.max_accounts_per_user,
            # Event system
            "event_type": roster_data.event_type,
            "event_instance": event_instance,
            "custom_event": roster_data.custom_event,
            "event_time": roster_data.time,  # Use roster time as event time

            # Phase timing (explicit timestamps)
            "signup_publish_time": roster_data.signup_publish_time,
            "registration_close_time": roster_data.registration_close_time,
            "result_publish_time": roster_data.result_publish_time,

            # Auto-phase control
            "auto_signup_publish": roster_data.auto_signup_publish,
            "auto_registration_close": roster_data.auto_registration_close,
            "auto_result_publish": roster_data.auto_result_publish,
            # Phase status tracking
            "phase_status": "draft",
            "created_at": pend.now("UTC"),
            "updated_at": pend.now("UTC"),
        }
        result = await mongo.rosters.insert_one(roster_doc)
        return {"message": "Roster created successfully", "roster_id": str(result.inserted_id)}

    template_doc = {
        # Template-specific fields
        "active": True,
        "frequency": roster_data.frequency,

        # Template timing configuration
        "event_time": roster_data.event_time,
        "signup_publish_time": roster_data.signup_publish_time,
        "registration_close_time": roster_data.registration_close_time,
        "result_publish_time": roster_data.result_publish_time,

        # All roster fields that should be auto-generated (same as roster_doc)
        "server_id": roster_data.server_id,
        "clan_tag": roster_data.clan_tag,
        "clan_name": clan["name"],
        "clan_badge": clan["badge"],
        "alias": roster_data.alias,
        "th_restriction": roster_data.th_restriction,
        "description": roster_data.description,
        "roster_type": roster_data.roster_type,
        "max_accounts_per_user": roster_data.max_accounts_per_user,

        # Event system
        "event_type": roster_data.event_type,
        "custom_event": roster_data.custom_event,

        # Auto-phase control
        "auto_signup_publish": roster_data.auto_signup_publish,
        "auto_registration_close": roster_data.auto_registration_close,
        "auto_result_publish": roster_data.auto_result_publish,

        # Metadata
        "created_at": pend.now("UTC"),
        "updated_at": pend.now("UTC"),
    }
    result = await mongo.roster_templates.insert_one(template_doc)
    return {"message": "Roster template created successfully", "template_id": str(result.inserted_id)}


@router.patch("/rosters/{roster_id}", response_model=dict, status_code=status.HTTP_200_OK, name="Update Roster")
async def update_roster(roster_id: str, payload: RosterUpdateModel):
    """Partial update of a roster."""

    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    body = payload.model_dump(exclude_none=True)
    # Only allow core fields that don't break Discord bot compatibility
    allowed_fields = ("alias", "server_id", "th_restriction", "time", "description", "clan_tag",
                      "roster_type", "max_accounts_per_user", "event_type", "custom_event",
                      "signup_publish_time", "registration_close_time", "result_publish_time",
                      "auto_signup_publish", "auto_registration_close", "auto_result_publish")
    allowed = {k: body[k] for k in allowed_fields if k in body}

    # If time or event_type changed, regenerate event_instance
    if "time" in allowed or "event_type" in allowed:
        # Get current roster to check existing values
        current_roster = await mongo.rosters.find_one({"_id": _id})
        if current_roster:
            new_time = allowed.get("time", current_roster.get("time"))
            new_event_type = allowed.get("event_type", current_roster.get("event_type"))

            if new_event_type and new_time:
                allowed["event_instance"] = generate_event_instance(new_event_type, new_time)
            elif not new_event_type:
                allowed["event_instance"] = None

    if "clan_tag" in allowed:
        clan = await fetch_clan_and_badge(allowed["clan_tag"])
        allowed["clan_name"] = clan["name"]
        allowed["clan_badge"] = clan["badge"]

    if not allowed:
        return {"message": "Nothing to update"}

    allowed["updated_at"] = pend.now("UTC")

    res = await mongo.rosters.update_one({"_id": _id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster not found")

    doc = await mongo.rosters.find_one({"_id": _id})
    doc["_id"] = str(doc["_id"])
    return {"message": "Roster updated", "roster": doc}


@router.patch("/roster-templates/{template_id}", response_model=dict, status_code=status.HTTP_200_OK,
              name="Update Roster Template")
async def update_roster_template(template_id: str, payload: TemplateUpdateModel):
    """Partial update of a roster template."""

    try:
        _id = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")

    body = payload.model_dump(exclude_none=True)
    allowed = {k: body[k] for k in ("alias", "server_id", "th_restriction", "active", "frequency", "event_time",
                                    "publish_lead_days", "registration_close_hours", "results_delay_hours",
                                    "auto_publish", "auto_close_registration", "auto_publish_results", "clan_tag") if
               k in body}

    if "clan_tag" in allowed:
        clan = await fetch_clan_and_badge(allowed["clan_tag"])
        allowed["clan_name"] = clan["name"]
        allowed["clan_badge"] = clan["badge"]

    if not allowed:
        return {"message": "Nothing to update"}

    allowed["updated_at"] = pend.now("UTC")

    res = await mongo.roster_templates.update_one({"_id": _id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster template not found")

    doc = await mongo.roster_templates.find_one({"_id": _id})
    doc["_id"] = str(doc["_id"])
    return {"message": "Roster template updated", "template": doc}


@router.get("/rosters/{roster_id}", response_model=dict, status_code=status.HTTP_200_OK, name="Get Roster")
async def get_roster(roster_id: str):
    """Get a single roster by ID."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    doc = await mongo.rosters.find_one({"_id": _id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roster not found")

    doc["_id"] = str(doc["_id"])
    return {"roster": doc}


@router.get("/roster-templates/{template_id}", response_model=dict, status_code=status.HTTP_200_OK,
            name="Get Roster Template")
async def get_roster_template(template_id: str):
    """Get a single roster template by ID."""
    try:
        _id = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")

    doc = await mongo.roster_templates.find_one({"_id": _id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roster template not found")

    doc["_id"] = str(doc["_id"])
    return {"template": doc}


@router.get("/rosters", response_model=dict, status_code=status.HTTP_200_OK, name="List Rosters")
async def list_rosters(filters: RosterFiltersModel = None):
    """List rosters with optional filtering."""
    if filters is None:
        filters = RosterFiltersModel()

    query = {}
    if filters.server_id:
        query["server_id"] = filters.server_id
    if filters.clan_tag:
        query["clan_tag"] = filters.clan_tag

    cursor = mongo.rosters.find(query).skip(filters.offset).limit(filters.limit)
    rosters = await cursor.to_list(length=filters.limit)

    for roster in rosters:
        roster["_id"] = str(roster["_id"])

    total = await mongo.rosters.count_documents(query)

    return {
        "rosters": rosters,
        "total": total,
        "limit": filters.limit,
        "offset": filters.offset
    }


@router.get("/roster-templates", response_model=dict, status_code=status.HTTP_200_OK, name="List Roster Templates")
async def list_roster_templates(filters: TemplateFiltersModel = None):
    """List roster templates with optional filtering."""
    if filters is None:
        filters = TemplateFiltersModel()

    query = {}
    if filters.server_id:
        query["server_id"] = filters.server_id
    if filters.clan_tag:
        query["clan_tag"] = filters.clan_tag
    if filters.active is not None:
        query["active"] = filters.active
    if filters.frequency:
        query["frequency"] = filters.frequency

    cursor = mongo.roster_templates.find(query).skip(filters.offset).limit(filters.limit)
    templates = await cursor.to_list(length=filters.limit)

    for template in templates:
        template["_id"] = str(template["_id"])

    total = await mongo.roster_templates.count_documents(query)

    return {
        "templates": templates,
        "total": total,
        "limit": filters.limit,
        "offset": filters.offset
    }


@router.delete("/rosters/{roster_id}", response_model=dict, status_code=status.HTTP_200_OK, name="Delete Roster")
async def delete_roster(roster_id: str):
    """Delete a roster."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    res = await mongo.rosters.delete_one({"_id": _id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Roster not found")

    return {"message": "Roster deleted successfully"}


@router.delete("/roster-templates/{template_id}", response_model=dict, status_code=status.HTTP_200_OK,
               name="Delete Roster Template")
async def delete_roster_template(template_id: str):
    """Delete a roster template."""
    try:
        _id = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")

    res = await mongo.roster_templates.delete_one({"_id": _id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Roster template not found")

    return {"message": "Roster template deleted successfully"}


@router.post("/rosters/{roster_id}/members", response_model=dict, status_code=status.HTTP_201_CREATED,
             name="Add Members by Tags (Auto-Fetch Data)")
async def add_members_to_roster(roster_id: str, payload: AddMembersByTagModel,
                                coc_client: coc.Client = Depends(get_coc_client)):
    """Add members to roster by providing their tags and discord id - API fetches all player data."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Check if roster exists
    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    # Get existing member tags to check for duplicates
    existing_tags = [member["tag"] for member in roster.get("members", [])]

    # Fetch player data for each tag
    members_to_add = []
    success_count = 0
    error_count = 0
    errors = []

    for member_input in payload.members:
        try:
            # Normalize player tag
            player_tag = member_input.tag.upper().replace("#", "")
            player_tag = f"#{player_tag}"

            # Check for duplicate tags
            if player_tag in existing_tags:
                error_count += 1
                errors.append(f"Player {player_tag} already exists in this roster")
                continue

            # Check account limit per user
            is_valid, current_count, max_accounts = await check_user_account_limit(
                roster_id, member_input.discord
            )

            if not is_valid:
                error_count += 1
                discord_user_id = extract_discord_user_id(member_input.discord)
                errors.append(
                    f"User {discord_user_id} already has {current_count}/{max_accounts} accounts in this roster")
                continue

            # Fetch player from CoC API
            player = await coc_client.get_player(player_tag)

            # Calculate hero levels sum
            hero_lvs = sum(hero.level for hero in player.heroes)

            # Get current clan info
            current_clan = player.clan.name if player.clan else "No Clan"
            current_clan_tag = player.clan.tag if player.clan else "#"

            member_data = {
                "name": player.name,
                "tag": player_tag,
                "hero_lvs": hero_lvs,
                "townhall": player.town_hall,
                "discord": member_input.discord,
                "current_clan": current_clan,
                "current_clan_tag": current_clan_tag,
                "war_pref": player.war_opted_in,
                "trophies": player.trophies,
                "sub": member_input.sub,
                "group": member_input.group,
                # Add tracking fields
                "last_updated": int(pend.now("UTC").timestamp()),
                "member_status": "active",
                "error_details": None,
            }
            members_to_add.append(member_data)
            success_count += 1

        except coc.NotFound:
            error_count += 1
            errors.append(f"Player {member_input.tag} not found")
            continue

        except Exception as e:
            error_count += 1
            errors.append(f"Error fetching {member_input.tag}: {str(e)}")
            continue

    if not members_to_add:
        return {
            "message": "No valid members to add",
            "success_count": 0,
            "error_count": error_count,
            "errors": errors
        }

    # Add members to roster
    await mongo.rosters.update_one(
        {"_id": _id},
        {
            "$push": {"members": {"$each": members_to_add}},
            "$set": {"updated_at": pend.now("UTC")}
        }
    )

    return {
        "message": f"Added {len(members_to_add)} members to roster",
        "success_count": success_count,
        "error_count": error_count,
        "errors": errors if errors else None
    }


@router.delete("/rosters/{roster_id}/members/{player_tag}", response_model=dict, status_code=status.HTTP_200_OK,
               name="Remove Member from Roster")
async def remove_member_from_roster(roster_id: str, player_tag: str):
    """Remove a member from a roster."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Normalize player tag - Discord bot uses 'tag' field
    normalized_tag = f"#{player_tag.upper().replace('#', '')}"

    res = await mongo.rosters.update_one(
        {"_id": _id},
        {
            "$pull": {"members": {"tag": normalized_tag}},  # Use 'tag' not 'player_tag'
            "$set": {"updated_at": pend.now("UTC")}
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster not found")

    return {"message": "Member removed from roster"}


@router.patch("/rosters/{roster_id}/members/{player_tag}", response_model=dict, status_code=status.HTTP_200_OK,
              name="Update Member in Roster")
async def update_member_in_roster(roster_id: str, player_tag: str, payload: UpdateMemberModel):
    """Update a member's properties in a roster."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Normalize player tag - Discord bot uses 'tag' field
    normalized_tag = f"#{player_tag.upper().replace('#', '')}"

    # Build update query for array element
    update_fields = {}
    if payload.sub is not None:
        update_fields["members.$.sub"] = payload.sub
    if payload.group is not None:
        update_fields["members.$.group"] = payload.group

    if not update_fields:
        return {"message": "Nothing to update"}

    update_fields["updated_at"] = pend.now("UTC")

    res = await mongo.rosters.update_one(
        {"_id": _id, "members.tag": normalized_tag},  # Use 'tag' not 'player_tag'
        {"$set": update_fields}
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster or member not found")

    return {"message": "Member updated successfully"}


@router.post("/roster-templates/{template_id}/generate", response_model=dict, status_code=status.HTTP_201_CREATED,
             name="Generate Roster from Template")
async def generate_roster_from_template(template_id: str):
    """Generate a new roster from a template."""
    try:
        _id = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")

    # Get template
    template = await mongo.roster_templates.find_one({"_id": _id})
    if not template:
        raise HTTPException(status_code=404, detail="Roster template not found")

    if not template.get("active", True):
        raise HTTPException(status_code=400, detail="Template is not active")

    # Calculate timing phases based on template configuration
    event_time = template.get("event_time")
    frequency = template.get("frequency")
    publish_lead_days = template.get("publish_lead_days", 7)
    registration_close_hours = template.get("registration_close_hours", 48)
    results_delay_hours = template.get("results_delay_hours", 2)

    roster_time = None
    publish_time = None
    registration_deadline = None
    results_publish_time = None

    if event_time and frequency:
        import pendulum as pend
        event_dt = pend.from_timestamp(event_time, tz="UTC")
        now = pend.now("UTC")

        if frequency == "weekly":
            # Next occurrence on same day of week
            days_ahead = (event_dt.weekday() - now.weekday()) % 7
            if days_ahead == 0 and now.time() > event_dt.time():
                days_ahead = 7
            next_event = now.replace(hour=event_dt.hour, minute=event_dt.minute, second=0, microsecond=0).add(
                days=days_ahead)
        elif frequency == "monthly":
            # Next occurrence on same day of month
            try:
                next_event = now.replace(day=event_dt.day, hour=event_dt.hour, minute=event_dt.minute, second=0,
                                         microsecond=0)
                if next_event <= now:
                    next_event = next_event.add(months=1)
            except ValueError:  # Day doesn't exist in current month
                next_event = now.end_of('month').replace(hour=event_dt.hour, minute=event_dt.minute, second=0,
                                                         microsecond=0)
                if next_event <= now:
                    next_event = next_event.add(months=1).end_of('month').replace(hour=event_dt.hour,
                                                                                  minute=event_dt.minute, second=0,
                                                                                  microsecond=0)
        else:  # cwl_season
            # For CWL season, use first Monday of the month
            first_day = now.replace(day=1, hour=event_dt.hour, minute=event_dt.minute, second=0, microsecond=0)
            days_to_monday = (0 - first_day.weekday()) % 7  # 0 = Monday
            next_event = first_day.add(days=days_to_monday)
            if next_event <= now:
                next_event = next_event.add(months=1)
                first_day = next_event.replace(day=1)
                days_to_monday = (0 - first_day.weekday()) % 7
                next_event = first_day.add(days=days_to_monday)

        # Calculate all timing phases
        roster_time = int(next_event.timestamp())
        publish_time = int(next_event.subtract(days=publish_lead_days).timestamp())
        registration_deadline = int(next_event.subtract(hours=registration_close_hours).timestamp())
        results_publish_time = int(next_event.add(hours=results_delay_hours).timestamp())

    # Fetch clan info
    clan = await fetch_clan_and_badge(template["clan_tag"])

    # Create roster document with phase timing
    roster_doc = {
        "clan_name": clan["name"],
        "clan_tag": template["clan_tag"],
        "clan_badge": clan["badge"],
        "members": [],
        "alias": template["alias"],
        "server_id": template["server_id"],
        "th_restriction": template["th_restriction"],
        "time": roster_time,
        "description": f"Generated from template: {template['alias']}",
        "template_id": str(template["_id"]),

        # Phase timing
        "event_time": roster_time,
        "publish_time": publish_time,
        "registration_deadline": registration_deadline,
        "results_publish_time": results_publish_time,

        # Phase status tracking
        "phase_status": "scheduled",
        "auto_phases": {
            "publish": template.get("auto_publish", True),
            "close_registration": template.get("auto_close_registration", True),
            "publish_results": template.get("auto_publish_results", False)
        },

        "created_at": pend.now("UTC"),
        "updated_at": pend.now("UTC"),
    }

    result = await mongo.rosters.insert_one(roster_doc)
    return {"message": "Roster generated from template", "roster_id": str(result.inserted_id)}


@router.get("/rosters/{roster_id}/export", response_model=dict, status_code=status.HTTP_200_OK, name="Export Roster")
async def export_roster(roster_id: str):
    """Generate an export code for the roster (like Discord bot /roster export)."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    # Check if roster already has a roster_id (export code)
    export_code = roster.get("roster_id")
    if export_code is None:
        # Generate new 5-character code
        source = string.ascii_letters
        export_code = ''.join(random.choice(source) for i in range(5)).upper()

        # Ensure code is unique
        is_used = await mongo.rosters.find_one({"roster_id": export_code})
        while is_used is not None:
            export_code = ''.join(random.choice(source) for i in range(5)).upper()
            is_used = await mongo.rosters.find_one({"roster_id": export_code})

        # Save the code to the roster
        await mongo.rosters.update_one(
            {"_id": _id},
            {"$set": {"roster_id": export_code, "updated_at": pend.now("UTC")}}
        )

    return {
        "message": f"Roster export code generated",
        "export_code": export_code,
        "description": f"Use this code to import the roster: {export_code}"
    }


@router.post("/rosters/import", response_model=dict, status_code=status.HTTP_201_CREATED, name="Import Roster")
async def import_roster(payload: ImportRosterModel):
    """Import a roster using a 5-character export code (like Discord bot /roster copy)."""
    import_code = payload.import_code.upper()

    # Find the source roster by export code
    source_roster = await mongo.rosters.find_one({"roster_id": import_code})
    if not source_roster:
        raise HTTPException(status_code=404, detail=f"No roster found with export code: {import_code}")

    # Generate unique alias for imported roster
    base_alias = f"Import {import_code}"
    alias = base_alias
    count = 0

    # Check if alias already exists and add number if needed
    while await mongo.rosters.find_one({"server_id": payload.server_id, "alias": alias}):
        count += 1
        alias = f"{base_alias}{count}"

    # Create imported roster document (copy everything except _id, server_id, and alias)
    imported_doc = {
        "clan_name": source_roster["clan_name"],
        "clan_tag": source_roster["clan_tag"],
        "clan_badge": source_roster["clan_badge"],
        "members": source_roster.get("members", []).copy(),  # Copy members
        "alias": alias,
        "server_id": payload.server_id,  # Set to target server
        "th_restriction": source_roster["th_restriction"],
        "time": source_roster.get("time"),
        "description": source_roster.get("description"),
        "roster_type": source_roster.get("roster_type", "clan"),

        # Reset phase status for imported roster
        "phase_status": "draft",
        "auto_phases": source_roster.get("auto_phases", {
            "publish": False,
            "close_registration": False,
            "publish_results": False
        }),

        "created_at": pend.now("UTC"),
        "updated_at": pend.now("UTC"),
        # Don't copy: roster_id, registration times, phase timing
    }

    result = await mongo.rosters.insert_one(imported_doc)
    return {
        "message": f"Roster imported as '{alias}' from code '{import_code}'",
        "alias": alias
    }


@router.patch("/rosters/{roster_id}/phase", response_model=dict, status_code=status.HTTP_200_OK,
              name="Update Roster Phase")
async def update_roster_phase(roster_id: str, phase: str = Query(...,
                                                                 regex="^(scheduled|published|registration_closed|results_published)$")):
    """Manually update a roster's phase status."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    valid_phases = ["scheduled", "published", "registration_closed", "results_published"]
    if phase not in valid_phases:
        raise HTTPException(status_code=400, detail=f"Invalid phase. Must be one of: {valid_phases}")

    res = await mongo.rosters.update_one(
        {"_id": _id},
        {
            "$set": {
                "phase_status": phase,
                "updated_at": pend.now("UTC")
            }
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster not found")

    return {"message": f"Roster phase updated to '{phase}'"}


@router.get("/rosters/scheduled", response_model=dict, status_code=status.HTTP_200_OK, name="Get Scheduled Rosters")
async def get_scheduled_rosters(phase: str = Query(None, regex="^(scheduled|published|registration_closed)$")):
    """Get rosters that need phase transitions (for ClashKingTracking scheduler)."""
    now = pend.now("UTC").timestamp()

    # Build query based on phase and timing
    if phase == "scheduled":
        # Rosters ready to be published
        query = {
            "phase_status": "scheduled",
            "publish_time": {"$lte": now},
            "auto_phases.publish": True
        }
    elif phase == "published":
        # Rosters ready to close registration
        query = {
            "phase_status": "published",
            "registration_deadline": {"$lte": now},
            "auto_phases.close_registration": True
        }
    elif phase == "registration_closed":
        # Rosters ready to publish results
        query = {
            "phase_status": "registration_closed",
            "results_publish_time": {"$lte": now},
            "auto_phases.publish_results": True
        }
    else:
        # Return all rosters with phase timing
        query = {"phase_status": {"$exists": True}}

    rosters = await mongo.rosters.find(query).to_list(length=100)

    for roster in rosters:
        roster["_id"] = str(roster["_id"])

    return {
        "rosters": rosters,
        "count": len(rosters),
        "filter_phase": phase
    }


async def refresh_member_data(member: dict, coc_client: coc.Client) -> tuple[dict, str]:
    """
    Refresh a single member's data from CoC API.
    Returns: (updated_member_dict, action)
    Actions: 'updated', 'remove', 'no_change'
    """
    try:
        player_tag = member["tag"]
        player = await coc_client.get_player(player_tag)

        # Calculate hero levels sum
        hero_lvs = sum(hero.level for hero in player.heroes)

        # Get current clan info
        current_clan = player.clan.name if player.clan else "No Clan"
        current_clan_tag = player.clan.tag if player.clan else "#"

        # No need to fetch hitrate/activity - calculated on-demand when displaying roster

        # Update member data (no hitrate/activity stored - calculated on-demand)
        member.update({
            "name": player.name,
            "hero_lvs": hero_lvs,
            "townhall": player.town_hall,
            "current_clan": current_clan,
            "current_clan_tag": current_clan_tag,
            "war_pref": player.war_opted_in,
            "trophies": player.trophies,
            "last_updated": int(pend.now("UTC").timestamp()),
            "member_status": "active",
            "error_details": None
        })

        return member, "updated"

    except coc.NotFound:
        # Player doesn't exist anymore - mark for removal
        return member, "remove"

    except Exception as e:
        # API error - keep existing data, just update tracking fields
        member.update({
            "last_updated": int(pend.now("UTC").timestamp()),
            "member_status": "api_error",
            "error_details": str(e)
        })
        return member, "no_change"


@router.post("/rosters/{roster_id}/refresh-members", response_model=dict, status_code=status.HTTP_200_OK,
             name="Refresh All Roster Members")
async def refresh_all_roster_members(roster_id: str, coc_client: coc.Client = Depends(get_coc_client)):
    """Refresh all members data from CoC API for better accuracy."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Get roster
    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    members = roster.get("members", [])
    if not members:
        return {"message": "No members to refresh", "refreshed_count": 0}

    # Refresh all members
    refreshed_members = []
    updated_count = 0
    removed_count = 0
    error_count = 0

    for member in members:
        refreshed_member, action = await refresh_member_data(member.copy(), coc_client)

        if action == "remove":
            # Don't add to final list - effectively removing the member
            removed_count += 1
        else:
            refreshed_members.append(refreshed_member)
            if action == "updated":
                updated_count += 1
            elif action == "no_change":
                error_count += 1

    # Update roster with refreshed data
    await mongo.rosters.update_one(
        {"_id": _id},
        {
            "$set": {
                "members": refreshed_members,
                "updated_at": pend.now("UTC")
            }
        }
    )

    return {
        "message": "Roster members refreshed",
        "total_members": len(members),
        "updated_count": updated_count,
        "removed_count": removed_count,
        "error_count": error_count,
        "final_member_count": len(refreshed_members),
        "last_refresh": int(pend.now("UTC").timestamp())
    }


@router.post("/rosters/{roster_id}/members/refresh/{player_tag}", response_model=dict, status_code=status.HTTP_200_OK,
             name="Refresh Single Roster Member")
async def refresh_single_roster_member(roster_id: str, player_tag: str,
                                       coc_client: coc.Client = Depends(get_coc_client)):
    """Refresh a specific member's data from CoC API."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Normalize player tag
    normalized_tag = f"#{player_tag.upper().replace('#', '')}"

    # Get roster
    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    members = roster.get("members", [])
    member_found = False

    # Find and refresh the specific member
    for i, member in enumerate(members):
        if member["tag"] == normalized_tag:
            member_found = True
            refreshed_member, action = await refresh_member_data(member, coc_client)

            if action == "remove":
                # Remove member from list
                members.pop(i)
                message = f"Member {normalized_tag} removed (player not found)"
                action_taken = "removed"
            else:
                # Update member in list
                members[i] = refreshed_member
                message = f"Member {normalized_tag} refreshed successfully"
                action_taken = action
            break

    if not member_found:
        raise HTTPException(status_code=404, detail=f"Member {normalized_tag} not found in roster")

    # Update roster with refreshed member data
    await mongo.rosters.update_one(
        {"_id": _id},
        {
            "$set": {
                "members": members,
                "updated_at": pend.now("UTC")
            }
        }
    )

    response = {
        "message": message,
        "action": action_taken,
        "last_updated": int(pend.now("UTC").timestamp())
    }

    # Add member status if not removed
    if action_taken != "removed":
        response["member_status"] = refreshed_member["member_status"]

    return response


@router.get("/rosters/{roster_id}/with-stats", response_model=dict, status_code=status.HTTP_200_OK,
            name="Get Roster with Calculated Stats")
async def get_roster_with_stats(roster_id: str):
    """Get roster with calculated hitrates, activity, and last_online for all members."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Get base roster data
    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    roster["_id"] = str(roster["_id"])
    members = roster.get("members", [])

    if members:
        # Get all player tags
        player_tags = [member["tag"] for member in members]

        # Calculate stats for all players
        stats = await calculate_bulk_stats(player_tags)

        # Add calculated stats to each member
        for member in members:
            tag = member["tag"]
            if tag in stats:
                member["hitrate"] = stats[tag]["hitrate"]
                member["last_online"] = stats[tag]["last_online"]
                member["activity"] = stats[tag]["activity"]
            else:
                # Fallback values if calculation fails
                member["hitrate"] = 0.0
                member["last_online"] = 0
                member["activity"] = 0

    return {"roster": roster}


@router.get("/rosters/{roster_id}/member-stats/{player_tag}", response_model=dict, status_code=status.HTTP_200_OK,
            name="Get Single Member Stats")
async def get_member_stats(roster_id: str, player_tag: str):
    """Get calculated stats for a single member."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    # Verify roster exists and member is in it
    normalized_tag = f"#{player_tag.upper().replace('#', '')}"
    roster = await mongo.rosters.find_one(
        {"_id": _id, "members.tag": normalized_tag},
        {"members.$": 1, "alias": 1, "clan_name": 1}
    )

    if not roster:
        raise HTTPException(status_code=404, detail="Roster or member not found")

    member = roster["members"][0]

    # Calculate stats for this member
    stats = await calculate_bulk_stats([normalized_tag])
    member_stats = stats.get(normalized_tag, {
        "hitrate": 0.0,
        "last_online": 0,
        "activity": 0
    })

    return {
        "member": member,
        "stats": member_stats,
        "roster_info": {
            "alias": roster.get("alias"),
            "clan_name": roster.get("clan_name")
        }
    }


@router.get("/rosters/{roster_id}/user-stats", response_model=dict, status_code=status.HTTP_200_OK,
            name="Get User Account Statistics")
async def get_roster_user_stats(roster_id: str):
    """Get statistics about how many accounts each Discord user has in the roster."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    max_accounts = roster.get("max_accounts_per_user")
    members = roster.get("members", [])

    # Count accounts per Discord user
    user_stats = {}

    for member in members:
        discord_user_id = extract_discord_user_id(member.get("discord", "No User"))

        if discord_user_id not in user_stats:
            user_stats[discord_user_id] = {
                "discord_user": member.get("discord", "No User"),
                "account_count": 0,
                "accounts": []
            }

        user_stats[discord_user_id]["account_count"] += 1
        user_stats[discord_user_id]["accounts"].append({
            "tag": member["tag"],
            "name": member["name"],
            "townhall": member["townhall"]
        })

    # Convert to list and sort by account count
    user_list = list(user_stats.values())
    user_list.sort(key=lambda x: x["account_count"], reverse=True)

    return {
        "roster_info": {
            "alias": roster.get("alias"),
            "clan_name": roster.get("clan_name"),
            "max_accounts_per_user": max_accounts,
            "total_members": len(members)
        },
        "user_statistics": user_list,
        "summary": {
            "total_users": len(user_list),
            "users_at_limit": len(
                [u for u in user_list if max_accounts and u["account_count"] >= max_accounts]) if max_accounts else 0,
            "no_discord_accounts": user_stats.get("No User", {}).get("account_count", 0)
        }
    }


@router.get("/rosters/{roster_id}/missing-members", response_model=dict, status_code=status.HTTP_200_OK,
            name="Get Missing Members for Single Roster")
async def get_roster_missing_members(roster_id: str, coc_client: coc.Client = Depends(get_coc_client)):
    """Find clan members who are not registered in this specific roster."""
    try:
        _id = ObjectId(roster_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid roster_id")

    roster = await mongo.rosters.find_one({"_id": _id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    # Get registered player tags in this roster
    registered_tags = {member["tag"] for member in roster.get("members", [])}

    # Get all members from the roster's clan
    try:
        clan = await coc_client.get_clan(roster["clan_tag"])
        missing_members = []

        for member in clan.members:
            if member.tag not in registered_tags:
                missing_members.append({
                    "tag": member.tag,
                    "name": member.name,
                    "townhall": member.town_hall,
                    "role": member.role,
                    "discord": "No User"  # Would need Discord linking to populate
                })

        return {
            "roster_info": {
                "alias": roster["alias"],
                "clan_tag": roster["clan_tag"],
                "clan_name": roster["clan_name"],
                "event_type": roster.get("event_type"),
                "event_instance": roster.get("event_instance"),
                "custom_event": roster.get("custom_event"),
                "registered_count": len(registered_tags)
            },
            "missing_members": missing_members,
            "summary": {
                "total_missing": len(missing_members),
                "total_clan_members": len(clan.members),
                "coverage_percentage": round((len(registered_tags) / max(len(clan.members), 1)) * 100, 2)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching clan data: {str(e)}")


def generate_event_instance(event_type: str, timestamp: int) -> str:
    """Generate event instance string based on event type and timestamp"""
    date = pend.from_timestamp(timestamp, tz=pend.UTC)

    if event_type == "cwl":
        return f"cwl-{date.year}-{date.month:02d}"
    elif event_type == "clan-games":
        return f"clan-games-{date.year}-{date.month:02d}"
    elif event_type == "raids":
        # Use ISO week number for weekly raids
        year, week, _ = date.isocalendar()
        return f"raids-{year}-W{week:02d}"
    elif event_type == "rush":
        # Seasonal - assume quarterly
        quarter = (date.month - 1) // 3 + 1
        return f"rush-{date.year}-Q{quarter}"
    elif event_type == "tournament":
        # Monthly for tournaments
        return f"tournament-{date.year}-{date.month:02d}"
    else:
        return f"{event_type}-{date.year}-{date.month:02d}"


def get_current_event_instance(event_type: str) -> str:
    """Get current event instance for the given event type"""
    now = pend.now(tz=pend.UTC)
    return generate_event_instance(event_type, int(now.timestamp()))


def generate_roster_from_template(template: dict, event_time: int) -> dict:
    """Generate a complete roster document from a template"""
    # Generate event_instance if event_type is provided
    event_instance = None
    if template.get("event_type") and event_time:
        event_instance = generate_event_instance(template["event_type"], event_time)

    # Get phase timestamps from template (explicit timestamps, no calculation needed)
    signup_publish_time = template.get("signup_publish_time")
    registration_close_time = template.get("registration_close_time")
    result_publish_time = template.get("result_publish_time")

    # Generate roster document with ALL fields from template
    roster_doc = {
        # Basic roster fields (copied from template)
        "clan_name": template["clan_name"],
        "clan_tag": template["clan_tag"],
        "clan_badge": template["clan_badge"],
        "members": [],  # Empty at creation
        "alias": template["alias"],
        "server_id": template["server_id"],
        "th_restriction": template["th_restriction"],
        "time": signup_publish_time or event_time,  # Use signup_publish_time or fallback to event_time
        "description": template.get("description"),
        "roster_type": template.get("roster_type", "clan"),
        "max_accounts_per_user": template.get("max_accounts_per_user"),

        # Event system
        "event_type": template.get("event_type"),
        "event_instance": event_instance,
        "custom_event": template.get("custom_event"),
        "event_time": event_time,

        # Phase timestamps (inherited from template)
        "signup_publish_time": signup_publish_time,
        "registration_close_time": registration_close_time,
        "result_publish_time": result_publish_time,

        # Auto-phase control (inherited from template)
        "auto_signup_publish": template.get("auto_signup_publish", True),
        "auto_registration_close": template.get("auto_registration_close", True),
        "auto_result_publish": template.get("auto_result_publish", False),

        # Phase status tracking
        "phase_status": "scheduled",  # Auto-generated rosters start as scheduled

        # Phase summary (for tracking/debugging)
        "phase_summary": {
            "signup_publish_time": signup_publish_time,
            "registration_close_time": registration_close_time,
            "result_publish_time": result_publish_time
        },

        # Generation metadata
        "generated_from_template": str(template["_id"]),
        "generated_at": pend.now("UTC"),
        "created_at": pend.now("UTC"),
        "updated_at": pend.now("UTC"),
    }

    return roster_doc


@router.post("/templates/{template_id}/generate-roster",
             response_model=dict,
             status_code=status.HTTP_201_CREATED,
             name="Generate Roster from Template")
async def generate_roster_from_template_endpoint(template_id: str, event_time: int):
    """Generate a roster from a template with specified event time (for testing/manual generation)"""
    try:
        _id = ObjectId(template_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id")

    # Get template
    template = await mongo.roster_templates.find_one({"_id": _id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not template.get("active", True):
        raise HTTPException(status_code=400, detail="Template is inactive")

    # Generate roster from template
    roster_doc = generate_roster_from_template(template, event_time)

    # Insert the generated roster
    result = await mongo.rosters.insert_one(roster_doc)

    return {
        "message": "Roster generated successfully from template",
        "roster_id": str(result.inserted_id),
        "template_id": template_id,
        "event_time": event_time,
        "event_instance": roster_doc.get("event_instance"),
        "phase_summary": roster_doc.get("phase_summary")
    }


@router.post("/events/missing-members",
             summary="Get missing members across all rosters of a specific event type",
             description="Find all clan members not registered in any roster for the specified event type across the server")
async def get_event_missing_members(
        filters: EventMissingMembersModel,
        coc_client: coc.Client = Depends(get_coc_client)
):
    """Get missing members across all rosters of specific event type for a server"""
    try:
        # Determine which event instance to check
        if filters.current_instance_only:
            target_instance = get_current_event_instance(filters.event_type)
            instance_filter = {"event_instance": target_instance}
        else:
            # Get all rosters of this event type regardless of instance
            instance_filter = {}

        # Find all rosters for this event type and server
        query = {
            "server_id": filters.server_id,
            "event_type": filters.event_type,
            **instance_filter
        }

        rosters_cursor = mongo.rosters.find(query)
        rosters = await rosters_cursor.to_list(length=None)

        if not rosters:
            return {
                "event_type": filters.event_type,
                "event_instance": target_instance if filters.current_instance_only else "all",
                "server_id": filters.server_id,
                "rosters_found": 0,
                "missing_members": [],
                "summary": {
                    "total_missing": 0,
                    "total_rosters": 0,
                    "clans_covered": []
                }
            }

        # Collect all registered player tags across all rosters
        all_registered_tags = set()
        roster_info = []

        for roster in rosters:
            members = roster.get("members", [])
            registered_tags = {fix_tag(member["tag"]) for member in members}
            all_registered_tags.update(registered_tags)

            roster_info.append({
                "roster_id": str(roster["_id"]),
                "alias": roster["alias"],
                "clan_tag": roster["clan_tag"],
                "clan_name": roster.get("clan_name", "Unknown"),
                "registered_count": len(registered_tags)
            })

        # Get all unique clan tags from rosters
        clan_tags = {roster["clan_tag"] for roster in rosters}

        # Fetch all clan members from CoC API
        all_clan_members = {}
        missing_members = []

        for clan_tag in clan_tags:
            try:
                clan = await coc_client.get_clan(clan_tag)
                clan_member_tags = {fix_tag(member.tag) for member in clan.members}
                all_clan_members[clan_tag] = clan_member_tags

                # Find missing members for this clan
                missing_in_clan = clan_member_tags - all_registered_tags

                for member in clan.members:
                    if fix_tag(member.tag) in missing_in_clan:
                        # Try to get Discord info from database
                        profile = await mongo.profile_db.find_one({"tag": fix_tag(member.tag)})
                        discord_user = f"<@{profile['user']}>" if profile and profile.get('user') else "No Discord"

                        missing_members.append({
                            "tag": member.tag,
                            "name": member.name,
                            "townhall": member.town_hall,
                            "clan_tag": clan.tag,
                            "clan_name": clan.name,
                            "discord": discord_user,
                            "role": member.role
                        })

            except Exception as e:
                # Log error but continue with other clans
                print(f"Error fetching clan {clan_tag}: {e}")
                continue

        return {
            "event_type": filters.event_type,
            "event_instance": target_instance if filters.current_instance_only else "all",
            "server_id": filters.server_id,
            "rosters_found": len(rosters),
            "rosters": roster_info,
            "missing_members": missing_members,
            "summary": {
                "total_missing": len(missing_members),
                "total_rosters": len(rosters),
                "clans_covered": list(clan_tags),
                "total_registered": len(all_registered_tags)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching event missing members: {str(e)}")