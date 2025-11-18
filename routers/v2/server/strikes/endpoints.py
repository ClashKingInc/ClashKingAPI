import random
import string
import pendulum as pend
from datetime import timedelta
from fastapi import HTTPException, APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import linkd

from utils.database import MongoClient
from utils.security import check_authentication
from utils.utils import remove_id_fields
from .models import StrikeRequest, StrikeResponse

router = APIRouter(prefix="/v2/server", tags=["Server Strikes"], include_in_schema=True)
security = HTTPBearer()


@router.get("/{server_id}/strikes",
            name="Get strikes for a server")
@linkd.ext.fastapi.inject
@check_authentication
async def get_strikes(
    server_id: int,
    player_tag: str = None,
    view_expired: bool = False,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """
    Get all strikes for a server, optionally filtered by player tag.

    Args:
        server_id: Discord server ID
        player_tag: Optional player tag to filter strikes
        view_expired: Include expired strikes (default: False)

    Returns:
        List of strikes
    """
    # Build query
    query = {"server": server_id}

    if player_tag:
        query["tag"] = player_tag

    # Filter out expired strikes unless requested
    if not view_expired:
        gte = int(pend.now(tz=pend.UTC).timestamp())
        query["$or"] = [
            {"rollover_date": None},
            {"rollover_date": {"$gte": gte}}
        ]

    strikes = await mongo.strikelist.find(query).sort("date_created", -1).to_list(length=None)

    return remove_id_fields({"items": strikes, "count": len(strikes)})


@router.post("/{server_id}/strikes/{player_tag}",
             name="Add a strike to a player")
@linkd.ext.fastapi.inject
@check_authentication
async def add_strike(
    server_id: int,
    player_tag: str,
    strike_data: StrikeRequest,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """
    Add a strike to a player on a server.

    Args:
        server_id: Discord server ID
        player_tag: Player tag to strike
        strike_data: Strike details (reason, added_by, etc.)

    Returns:
        Created strike information
    """
    now = pend.now(tz=pend.UTC)
    dt_string = now.strftime('%Y-%m-%d %H:%M:%S')

    # Generate unique strike ID
    source = string.ascii_letters
    strike_id = str(''.join((random.choice(source) for i in range(5)))).upper()

    # Ensure uniqueness
    is_used = await mongo.strikelist.find_one({'strike_id': strike_id})
    while is_used is not None:
        strike_id = str(''.join((random.choice(source) for i in range(5)))).upper()
        is_used = await mongo.strikelist.find_one({'strike_id': strike_id})

    # Calculate rollover date if specified
    rollover_timestamp = None
    if strike_data.rollover_days is not None:
        rollover_date = now + timedelta(days=strike_data.rollover_days)
        rollover_timestamp = int(rollover_date.timestamp())

    # Create strike entry
    strike_entry = {
        'tag': player_tag,
        'date_created': dt_string,
        'reason': strike_data.reason,
        'server': server_id,
        'added_by': strike_data.added_by,
        'strike_weight': strike_data.strike_weight,
        'rollover_date': rollover_timestamp,
        'strike_id': strike_id,
    }

    if strike_data.image:
        strike_entry['image'] = strike_data.image

    await mongo.strikelist.insert_one(strike_entry)

    # Get total strikes for this player
    gte = int(pend.now(tz=pend.UTC).timestamp())
    total_strikes = await mongo.strikelist.find({
        '$and': [
            {'tag': player_tag},
            {'server': server_id},
            {
                '$or': [
                    {'rollover_date': None},
                    {'rollover_date': {'$gte': gte}}
                ]
            }
        ]
    }).to_list(length=None)

    total_weight = sum([s.get('strike_weight', 1) for s in total_strikes])

    return {
        "status": "created",
        "strike_id": strike_id,
        "player_tag": player_tag,
        "server_id": server_id,
        "total_strikes": len(total_strikes),
        "total_weight": total_weight
    }


@router.delete("/{server_id}/strikes/{strike_id}",
               name="Remove a strike by ID")
@linkd.ext.fastapi.inject
@check_authentication
async def remove_strike(
    server_id: int,
    strike_id: str,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """
    Remove a strike by its ID.

    Args:
        server_id: Discord server ID
        strike_id: Strike ID to remove

    Returns:
        Deletion confirmation
    """
    strike_id = strike_id.upper()

    # Check if strike exists
    strike = await mongo.strikelist.find_one({
        '$and': [
            {'strike_id': strike_id},
            {'server': server_id}
        ]
    })

    if not strike:
        raise HTTPException(
            status_code=404,
            detail=f"Strike with ID {strike_id} not found on server {server_id}"
        )

    # Delete the strike
    await mongo.strikelist.delete_one({
        '$and': [
            {'strike_id': strike_id},
            {'server': server_id}
        ]
    })

    return {
        "status": "deleted",
        "strike_id": strike_id,
        "player_tag": strike.get('tag'),
        "server_id": server_id
    }


@router.get("/{server_id}/strikes/player/{player_tag}/summary",
            name="Get strike summary for a player")
@linkd.ext.fastapi.inject
@check_authentication
async def get_player_strike_summary(
    server_id: int,
    player_tag: str,
    user_id: str = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient
):
    """
    Get a summary of active strikes for a specific player.

    Args:
        server_id: Discord server ID
        player_tag: Player tag

    Returns:
        Strike summary with total count and weight
    """
    gte = int(pend.now(tz=pend.UTC).timestamp())

    strikes = await mongo.strikelist.find({
        '$and': [
            {'tag': player_tag},
            {'server': server_id},
            {
                '$or': [
                    {'rollover_date': None},
                    {'rollover_date': {'$gte': gte}}
                ]
            }
        ]
    }).sort("date_created", -1).to_list(length=None)

    total_weight = sum([s.get('strike_weight', 1) for s in strikes])

    return {
        "player_tag": player_tag,
        "server_id": server_id,
        "total_strikes": len(strikes),
        "total_weight": total_weight,
        "strikes": remove_id_fields({"items": strikes})["items"]
    }
