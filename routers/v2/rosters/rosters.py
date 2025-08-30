import pymongo
from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Query, Depends
import pendulum as pend
import random
import string
import coc
import linkd
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from coc.utils import correct_tag

from routers.v2.rosters.roster_models import (
    CreateRosterModel, RosterUpdateModel,
     AddMembersByTagModel,
    UpdateMemberModel, ImportRosterModel,
    EventMissingMembersModel
)
from routers.v2.rosters.roster_utils import extract_discord_user_id, check_user_account_limit, \
    calculate_bulk_stats
from utils.custom_coc import CustomClashClient
from utils.database import MongoClient
from utils.security import check_authentication
from utils.utils import gen_clean_custom_id

router = APIRouter(prefix="/v2", tags=["Rosters"], include_in_schema=True)
security = HTTPBearer()


@router.post("/roster", name="Create a roster")
@linkd.ext.fastapi.inject
@check_authentication
async def create_roster(
        server_id: int,
        roster_data: CreateRosterModel,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        coc_client: CustomClashClient,
):
    clan = await coc_client.get_clan(tag=roster_data.clan_tag)

    roster_doc = roster_data.model_dump()
    ext_data = {
        "server_id": server_id,
        "custom_id": gen_clean_custom_id(),
        "clan_name": clan.name,
        "clan_tag": clan.tag,
        "clan_badge": clan.badge.large,
        "members": [],
        "created_at": pend.now(tz=pend.UTC),
        "updated_at": pend.now(tz=pend.UTC),
    }
    roster_doc.update(ext_data)
    await mongo.rosters.insert_one(roster_doc)
    return {"message": "Roster created successfully", "roster_id": ext_data.get("custom_id")}


@router.patch("/roster/{roster_id}", name="Update a Roster")
@linkd.ext.fastapi.inject
@check_authentication
async def update_roster(
        server_id: int,
        roster_id: str,
        payload: RosterUpdateModel,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        coc_client: CustomClashClient,
):
    body = payload.model_dump(exclude_none=True)

    roster = await mongo.rosters.count_documents({"custom_id": roster_id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    if "clan_tag" in body:
        clan = await coc_client.get_clan(tag=payload.clan_tag)
        body["clan_name"] = clan.name
        body["clan_tag"] = clan.tag

    if not body:
        return {"message": "Nothing to update"}

    body["updated_at"] = pend.now(tz=pend.UTC)

    result = await mongo.rosters.find_one_and_update(
        {"custom_id": roster_id}, {"$set": body},
        projection={"_id": 0},
        return_document=pymongo.ReturnDocument.AFTER
    )
    return {"message": "Roster updated", "roster": result}



@router.get("/roster/{roster_id}", name="Get a Roster")
@linkd.ext.fastapi.inject
@check_authentication
async def get_roster(
        server_id: int,
        roster_id: str,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
):
    doc = await mongo.rosters.find_one({"custom_id": roster_id}, {"_id" : 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Roster not found")
    return {"roster": doc}



@router.get("/roster/list", name="List Rosters")
@linkd.ext.fastapi.inject
@check_authentication
async def list_rosters(
        server_id: int,
        clan_tag: str = None,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
):
    query = {"server_id": server_id}
    if clan_tag:
        query["clan_tag"] = clan_tag

    cursor = await mongo.rosters.find(query, {"_id" : 0}).sort({"updated_at": -1})
    rosters = await cursor.to_list(length=None)

    return {
        "items": rosters,
        "server_id": server_id,
        "clan_tag": clan_tag,
    }



@router.delete("/roster/{roster_id}/delete", name="Delete a Roster")
@linkd.ext.fastapi.inject
@check_authentication
async def delete_roster(
        server_id: int,
        roster_id: str,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
):
    res = await mongo.rosters.delete_one({"custom_id": roster_id})
    if not res:
        raise HTTPException(status_code=404, detail="Roster not found")
    return {"message": "Roster deleted successfully"}



@router.post("/roster/{roster_id}/members", name="Add Members by Tags (Auto-Fetch Data)")
@linkd.ext.fastapi.inject
@check_authentication
async def add_members_to_roster(
        server_id: int,
        roster_id: str,
        payload: AddMembersByTagModel,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient,
        coc_client: CustomClashClient
):
    roster = await mongo.rosters.find_one({"roster_id": roster_id})
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    # Get existing member tags to check for duplicates
    existing_tags = {member["tag"] for member in roster.get("members", [])}

    # Fetch player data for each tag
    members_to_add = []
    success_count = 0
    removed_count = 0

    pipeline = [
        {"$match" : {"player_tag" : {"$in" : list(existing_tags)}}},
        {"$group" : {"_id": "user_id", "count": {"$sum" : 1}}},
    ]
    cursor = await mongo.rosters.aggregate(pipeline)
    result = await cursor.to_list(length=None)
    user_to_num_accounts = {d.get("user_id"): d.get("count") for d in result}

    payload_mapping = {m.tag: m for m in payload.members if m not in existing_tags}
    player_tags = list(payload_mapping.keys())
    cursor = await mongo.rosters.find({"player_tag" : {"$in" : player_tags}})
    result = await cursor.to_list(length=None)
    tag_to_user_id = {d.get("player_tag") : d.get("user_id") for d in result}


    async for player in coc_client.get_players(player_tags=player_tags):
        if isinstance(player, coc.errors.NotFound):
            #get the player tag out of the error message
            tag  = player.message.split(" ")[-1]
            await mongo.rosters.update_one(
                {"custom_id": roster_id},
                {
                    "$pull": {"members": {"tag": tag}},
                    "$set": {"updated_at": pend.now(tz=pend.UTC)}
                }
            )
            removed_count += 1
        elif isinstance(player, coc.Maintenance):
            raise player

        user_id = tag_to_user_id.get(player.tag)
        alr_found_accounts = user_to_num_accounts.get(user_id, 0)
        if alr_found_accounts > roster.get("max_accounts_per_user"):
            continue
        if user_id not in user_to_num_accounts:
            user_to_num_accounts[user_id] = 0
        user_to_num_accounts[user_id] += 1

        hero_lvs = sum(hero.level for hero in player.heroes if hero.is_home_base)

        current_clan = player.clan.name if player.clan else "No Clan"
        current_clan_tag = player.clan.tag if player.clan else "#"

        member_data = {
            "name": player.name,
            "tag": player.tag,
            "hero_lvs": hero_lvs,
            "townhall": player.town_hall,
            "discord": user_id,
            "current_clan": current_clan,
            "current_clan_tag": current_clan_tag,
            "war_pref": player.war_opted_in,
            "trophies": player.trophies,
            "group": payload_mapping.get(player.tag),
            "last_updated": pend.now(tz=pend.UTC).int_timestamp,
        }
        members_to_add.append(member_data)

    if not members_to_add:
        return {
            "message": "No valid members to add",
            "success_count": 0,
            "removed_count": removed_count,
        }

    # Add members to roster
    await mongo.rosters.update_one(
        {"custom_id": roster_id},
        {"$push": {"members": {"$each": members_to_add}}, "$set": {"updated_at": pend.now(tz=pend.UTC)}}
    )

    return {
        "message": f"Added {len(members_to_add)} members to roster",
        "items": members_to_add,
        "success_count": success_count,
        "removed_count": removed_count,
    }


@router.delete("/roster/{roster_id}/members/{player_tag}", name="Remove Member from Roster")
@linkd.ext.fastapi.inject
@check_authentication
async def remove_member_from_roster(
        roster_id: str,
        player_tag: str,
        server_id: int,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient
):
    player_tag = correct_tag(player_tag)

    res = await mongo.rosters.update_one(
        {"custom_id": roster_id},
        {
            "$pull": {"members": {"tag": player_tag}},
            "$set": {"updated_at": pend.now("UTC")}
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roster not found")

    return {"message": "Member removed from roster"}


@router.patch("/roster/{roster_id}/refresh", name="Update Member Data for Roster")
@linkd.ext.fastapi.inject
@check_authentication
async def refresh_roster_data(
        roster_id: str,
        server_id: int,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        *,
        mongo: MongoClient
):

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


'''
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
    }'''



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



'''
@router.get("/rosters/{roster_id}/missing-members", name="Get Missing Members for Single Roster")
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
'''

