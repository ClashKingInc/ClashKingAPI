import json
import random
import uuid

import linkd
import pendulum as pend
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from utils.database import MongoClient
from utils.security import check_authentication
from utils.sentry_utils import capture_endpoint_errors
from utils.utils import upload_to_cdn, delete_from_cdn
from .models import GiveawayBooster, GiveawayConfig, GiveawayWinner, ServerGiveawaysResponse, GiveawayMutationResponse, GiveawayRerollRequest, GiveawayRerollResponse


security = HTTPBearer()
router = APIRouter(prefix="/v2/server", tags=["Server Giveaways"], include_in_schema=True)


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def parse_json_list(raw_value: str | None) -> list:
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="Expected a JSON list payload")
    return parsed


def serialize_giveaway(giveaway: dict, usernames: dict[str, str] | None = None) -> GiveawayConfig:
    entries = giveaway.get("entries") or []
    boosters = [
        GiveawayBooster(
            value=float(booster.get("value", 1)),
            roles=[str(role) for role in booster.get("roles", [])],
        )
        for booster in (giveaway.get("boosters") or [])
    ]

    raw_winners = giveaway.get("winners_list") or []
    winners_list = [
        GiveawayWinner(
            user_id=str(w.get("user_id")),
            username=(usernames or {}).get(str(w.get("user_id"))),
            status=w.get("status", "winner"),
            timestamp=w["timestamp"].isoformat() if hasattr(w.get("timestamp"), "isoformat") else w.get("timestamp"),
            reason=w.get("reason"),
        )
        for w in raw_winners
        if isinstance(w, dict) and w.get("user_id")
    ]

    return GiveawayConfig(
        id=str(giveaway.get("_id")),
        prize=giveaway.get("prize", ""),
        channel_id=str(giveaway.get("channel_id")) if giveaway.get("channel_id") is not None else None,
        status=giveaway.get("status", "scheduled"),
        start_time=giveaway.get("start_time").isoformat() if giveaway.get("start_time") else "",
        end_time=giveaway.get("end_time").isoformat() if giveaway.get("end_time") else "",
        winners=int(giveaway.get("winners", 1)),
        mentions=[str(mention) for mention in giveaway.get("mentions", [])],
        text_above_embed=giveaway.get("text_above_embed", ""),
        text_in_embed=giveaway.get("text_in_embed", ""),
        text_on_end=giveaway.get("text_on_end", ""),
        image_url=giveaway.get("image_url"),
        profile_picture_required=bool(giveaway.get("profile_picture_required", False)),
        coc_account_required=bool(giveaway.get("coc_account_required", False)),
        roles_mode=giveaway.get("roles_mode", "none"),
        roles=[str(role) for role in giveaway.get("roles", [])],
        boosters=boosters,
        entry_count=len(entries),
        updated=bool(giveaway.get("updated")),
        message_id=str(giveaway["message_id"]) if giveaway.get("message_id") is not None else None,
        winners_list=winners_list,
    )


async def build_giveaway_document(
    server_id: int,
    giveaway_id: str,
    prize: str,
    start_time: str | None,
    now: str | None,
    end_time: str,
    winners: int,
    channel_id: str,
    mentions_json: str | None,
    text_above_embed: str,
    text_in_embed: str,
    text_on_end: str,
    profile_picture_required: str | None,
    coc_account_required: str | None,
    roles_mode: str,
    roles_json: str | None,
    boosters_json: str | None,
    remove_image: str | None,
    image: UploadFile | None,
    mongo: MongoClient,
) -> dict:
    if parse_bool(now):
        parsed_start_time = pend.now(tz=pend.UTC)
    elif start_time:
        parsed_start_time = pend.parse(start_time)
    else:
        raise HTTPException(status_code=400, detail="Start time is required unless start now is selected")

    parsed_end_time = pend.parse(end_time)
    if parsed_end_time <= parsed_start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    roles = [str(role) for role in parse_json_list(roles_json)]
    mentions = [str(role) for role in parse_json_list(mentions_json)]
    raw_boosters = parse_json_list(boosters_json)

    parsed_boosters = []
    for booster in raw_boosters:
        if not isinstance(booster, dict):
            continue
        role_list = [str(role) for role in booster.get("roles", [])]
        if not role_list:
            continue
        parsed_boosters.append({
            "value": float(booster.get("value", 1)),
            "roles": role_list,
        })

    existing = await mongo.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
    image_url = existing.get("image_url") if existing else None

    if parse_bool(remove_image) and image_url:
        await delete_from_cdn(image_url)
        image_url = None

    if image and image.filename:
        if image_url:
            await delete_from_cdn(image_url)
        timestamp = pend.now(tz=pend.UTC).format("YYYYMMDDHHmmss")
        image_url = await upload_to_cdn(image=image, title=f"giveaway_{giveaway_id}_{timestamp}")

    normalized_roles_mode = roles_mode if roles_mode in {"allow", "deny", "none"} else "none"

    document = {
        "_id": giveaway_id,
        "server_id": server_id,
        "prize": prize,
        "channel_id": int(channel_id),
        "start_time": parsed_start_time,
        "end_time": parsed_end_time,
        "winners": winners,
        "mentions": mentions,
        "text_above_embed": text_above_embed or "",
        "text_in_embed": text_in_embed or "",
        "text_on_end": text_on_end or "",
        "image_url": image_url,
        "profile_picture_required": parse_bool(profile_picture_required),
        "coc_account_required": parse_bool(coc_account_required),
        "roles_mode": normalized_roles_mode,
        "roles": roles,
        "boosters": parsed_boosters,
    }

    return document


@router.get("/{server_id}/giveaways", name="Get server giveaways")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_giveaways(
    server_id: int,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> ServerGiveawaysResponse:
    giveaways = await mongo.giveaways.find({"server_id": server_id}).to_list(length=None)

    # Collect all winner user IDs for a single batch username lookup
    all_winner_ids = [
        str(w.get("user_id"))
        for g in giveaways
        for w in (g.get("winners_list") or [])
        if isinstance(w, dict) and w.get("user_id")
    ]
    usernames = await _resolve_usernames(all_winner_ids, mongo)

    ongoing = sorted(
        [serialize_giveaway(g, usernames) for g in giveaways if g.get("status") == "ongoing"],
        key=lambda g: g.start_time,
        reverse=True,
    )
    upcoming = sorted(
        [serialize_giveaway(g, usernames) for g in giveaways if g.get("status") == "scheduled"],
        key=lambda g: g.start_time,
        reverse=True,
    )
    ended = sorted(
        [serialize_giveaway(g, usernames) for g in giveaways if g.get("status") == "ended"],
        key=lambda g: g.start_time,
        reverse=True,
    )

    return ServerGiveawaysResponse(
        ongoing=ongoing,
        upcoming=upcoming,
        ended=ended,
        total=len(giveaways),
    )


@router.get("/{server_id}/giveaways/{giveaway_id}", name="Get server giveaway")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def get_server_giveaway(
    server_id: int,
    giveaway_id: str,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> GiveawayConfig:
    giveaway = await mongo.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
    if not giveaway:
        raise HTTPException(status_code=404, detail="Giveaway not found")
    winner_ids = [str(w.get("user_id")) for w in (giveaway.get("winners_list") or []) if isinstance(w, dict) and w.get("user_id")]
    usernames = await _resolve_usernames(winner_ids, mongo)
    return serialize_giveaway(giveaway, usernames)


@router.post("/{server_id}/giveaways", name="Create server giveaway")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def create_server_giveaway(
    server_id: int,
    prize: str = Form(...),
    start_time: str | None = Form(None),
    now: str | None = Form(None),
    end_time: str = Form(...),
    winners: int = Form(...),
    channel_id: str = Form(...),
    mentions_json: str | None = Form(None),
    text_above_embed: str = Form(""),
    text_in_embed: str = Form(""),
    text_on_end: str = Form(""),
    profile_picture_required: str | None = Form(None),
    coc_account_required: str | None = Form(None),
    roles_mode: str = Form("none"),
    roles_json: str | None = Form(None),
    boosters_json: str | None = Form(None),
    remove_image: str | None = Form(None),
    image: UploadFile | None = File(None),
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> GiveawayMutationResponse:
    server = await mongo.server_db.find_one({"server": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    giveaway_id = str(uuid.uuid4())
    document = await build_giveaway_document(
        server_id=server_id,
        giveaway_id=giveaway_id,
        prize=prize,
        start_time=start_time,
        now=now,
        end_time=end_time,
        winners=winners,
        channel_id=channel_id,
        mentions_json=mentions_json,
        text_above_embed=text_above_embed,
        text_in_embed=text_in_embed,
        text_on_end=text_on_end,
        profile_picture_required=profile_picture_required,
        coc_account_required=coc_account_required,
        roles_mode=roles_mode,
        roles_json=roles_json,
        boosters_json=boosters_json,
        remove_image=remove_image,
        image=image,
        mongo=mongo,
    )
    document["status"] = "scheduled"

    await mongo.giveaways.insert_one(document)

    return GiveawayMutationResponse(
        message="Giveaway created successfully",
        giveaway_id=giveaway_id,
        server_id=server_id,
    )


@router.put("/{server_id}/giveaways/{giveaway_id}", name="Update server giveaway")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def update_server_giveaway(
    server_id: int,
    giveaway_id: str,
    prize: str = Form(...),
    start_time: str | None = Form(None),
    now: str | None = Form(None),
    end_time: str = Form(...),
    winners: int = Form(...),
    channel_id: str = Form(...),
    mentions_json: str | None = Form(None),
    text_above_embed: str = Form(""),
    text_in_embed: str = Form(""),
    text_on_end: str = Form(""),
    profile_picture_required: str | None = Form(None),
    coc_account_required: str | None = Form(None),
    roles_mode: str = Form("none"),
    roles_json: str | None = Form(None),
    boosters_json: str | None = Form(None),
    remove_image: str | None = Form(None),
    image: UploadFile | None = File(None),
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> GiveawayMutationResponse:
    existing = await mongo.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Giveaway not found")

    document = await build_giveaway_document(
        server_id=server_id,
        giveaway_id=giveaway_id,
        prize=prize,
        start_time=start_time,
        now=now,
        end_time=end_time,
        winners=winners,
        channel_id=channel_id,
        mentions_json=mentions_json,
        text_above_embed=text_above_embed,
        text_in_embed=text_in_embed,
        text_on_end=text_on_end,
        profile_picture_required=profile_picture_required,
        coc_account_required=coc_account_required,
        roles_mode=roles_mode,
        roles_json=roles_json,
        boosters_json=boosters_json,
        remove_image=remove_image,
        image=image,
        mongo=mongo,
    )
    document["updated"] = "yes"
    document["status"] = existing.get("status", "scheduled")

    result = await mongo.giveaways.update_one(
        {"_id": giveaway_id, "server_id": server_id},
        {"$set": document},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Giveaway not found")

    return GiveawayMutationResponse(
        message="Giveaway updated successfully",
        giveaway_id=giveaway_id,
        server_id=server_id,
    )


@router.delete("/{server_id}/giveaways/{giveaway_id}", name="Delete server giveaway")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def delete_server_giveaway(
    server_id: int,
    giveaway_id: str,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> GiveawayMutationResponse:
    existing = await mongo.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Giveaway not found")

    image_url = existing.get("image_url")
    if image_url:
        await delete_from_cdn(image_url)

    result = await mongo.giveaways.delete_one({"_id": giveaway_id, "server_id": server_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Giveaway not found")

    return GiveawayMutationResponse(
        message="Giveaway deleted successfully",
        giveaway_id=giveaway_id,
        server_id=server_id,
    )


async def _resolve_usernames(user_ids: list[str], mongo: MongoClient) -> dict[str, str]:
    """Batch-resolve Discord user IDs to usernames from the users collection."""
    if not user_ids:
        return {}
    users = await mongo.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "username": 1},
    ).to_list(length=None)
    return {str(u["user_id"]): u["username"] for u in users if u.get("username")}


def _get_entry_user_id(entry) -> str | None:
    """Handle entries that are either plain user ID strings or dicts with a user_id key."""
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return str(entry["user_id"]) if entry.get("user_id") else None
    return None


@router.post("/{server_id}/giveaways/{giveaway_id}/reroll", name="Reroll giveaway winners")
@linkd.ext.fastapi.inject
@check_authentication
@capture_endpoint_errors
async def reroll_giveaway_winners(
    server_id: int,
    giveaway_id: str,
    body: GiveawayRerollRequest,
    _user_id: str = None,
    _credentials: HTTPAuthorizationCredentials = Depends(security),
    *,
    mongo: MongoClient,
) -> GiveawayRerollResponse:
    giveaway = await mongo.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
    if not giveaway:
        raise HTTPException(status_code=404, detail="Giveaway not found")
    if giveaway.get("status") != "ended":
        raise HTTPException(status_code=400, detail="Can only reroll winners of an ended giveaway")

    user_ids_to_replace = [str(uid) for uid in body.user_ids_to_replace]
    if not user_ids_to_replace:
        raise HTTPException(status_code=400, detail="No user IDs provided for replacement")

    # Build the current winners set (only active winners, not already-rerolled ones)
    winners_list = giveaway.get("winners_list") or []
    current_winner_ids = {str(w["user_id"]) for w in winners_list if isinstance(w, dict) and w.get("status") == "winner"}

    invalid = [uid for uid in user_ids_to_replace if uid not in current_winner_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"The following users are not current winners: {', '.join(invalid)}")

    # Build the eligible pool: entries not in the current winner set
    raw_entries = giveaway.get("entries") or []
    all_entry_ids = [_get_entry_user_id(e) for e in raw_entries]
    all_entry_ids = [uid for uid in all_entry_ids if uid]

    eligible = [uid for uid in all_entry_ids if uid not in current_winner_ids]
    if len(eligible) < len(user_ids_to_replace):
        raise HTTPException(
            status_code=400,
            detail=f"Not enough eligible participants ({len(eligible)}) to replace {len(user_ids_to_replace)} winner(s)",
        )

    # Note: booster weights require Discord member role data not available server-side,
    # so we use uniform random sampling here (same as most reroll implementations).
    new_winner_ids = random.sample(eligible, len(user_ids_to_replace))

    now = pend.now(tz=pend.UTC)

    # Mark replaced winners as "rerolled"
    await mongo.giveaways.update_many(
        {"_id": giveaway_id},
        {
            "$set": {
                "winners_list.$[elem].status": "rerolled",
                "winners_list.$[elem].timestamp": now.isoformat(),
                "winners_list.$[elem].reason": "dashboard_reroll",
            }
        },
        array_filters=[{"elem.user_id": {"$in": user_ids_to_replace}}],
    )

    # Append new winners
    new_winners_docs = [
        {"user_id": uid, "status": "winner", "timestamp": now.isoformat()}
        for uid in new_winner_ids
    ]
    await mongo.giveaways.update_one(
        {"_id": giveaway_id},
        {"$push": {"winners_list": {"$each": new_winners_docs}}},
    )

    return GiveawayRerollResponse(
        message="Winners rerolled successfully",
        giveaway_id=giveaway_id,
        server_id=server_id,
        new_winners=new_winner_ids,
    )
