import json
import uuid
from typing import List
import pendulum as pend

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from routers.v1.tickets import get_channels, get_roles
from utils.utils import db_client, validate_token, delete_from_cdn

router = APIRouter(prefix="/giveaway", include_in_schema=False)
templates = Jinja2Templates(directory="templates")

from fastapi import Form, UploadFile, File
from fastapi.responses import JSONResponse

from utils.utils import upload_to_cdn

class BoosterModel(BaseModel):
    boost_value: float
    boost_roles: List[str]


@router.get("/dashboard", response_class=HTMLResponse)
async def giveaway_dashboard(request: Request, token: str, message: str = None):
    """
    Dashboard to view, create, and manage giveaways.
    """
    # Validate the token
    try:
        token_data = await validate_token(token, expected_type="giveaway")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    server_id = token_data["server_id"]
    channels = await get_channels(guild_id=server_id)
    print(channels)

    # Fetch all giveaways for the server
    giveaways = await db_client.giveaways.find({"server_id": server_id}).to_list(length=None)

    # Sort giveaways by status and time
    ongoing = sorted([g for g in giveaways if g["status"] == "ongoing"], key=lambda g: g["start_time"], reverse=True)
    upcoming = sorted([g for g in giveaways if g["status"] == "scheduled"], key=lambda g: g["start_time"], reverse=True)
    ended = sorted([g for g in giveaways if g["status"] == "ended"], key=lambda g: g["start_time"], reverse=True)

    return templates.TemplateResponse("giveaways/giveaways_dashboard.html", {
        "request": request,
        "server_id": server_id,
        "message": message,
        "ongoing": ongoing,
        "upcoming": upcoming,
        "ended": ended,
        "token": token,
        "channels": channels
    })


@router.post("/submit")
async def submit_giveaway_form(
        server_id: str = Form(...),
        token: str = Form(...),
        giveaway_id: str = Form(None),
        prize: str = Form(...),
        start_time: str = Form(None),
        now: bool = Form(False),
        end_time: str = Form(...),
        winners: int = Form(...),
        channel: str = Form(...),
        mentions: List[str] = Form([]),
        text_above_embed: str = Form(""),
        image: UploadFile = File(None),
        text_in_embed: str = Form(""),
        text_on_end: str = Form(""),
        profile_picture_required: bool = Form(False),
        coc_account_required: bool = Form(False),
        roles_mode: str = Form("allow"),
        roles_json: str = Form(...),
        boosters_json: str = Form(...),
        remove_image: bool = Form(False)
):
    """
    Handle form submissions to create or update a giveaway.
    """
    # Convert start_time and end_time to datetime objects
    print(start_time)
    if now:
        start_time = pend.now(tz=pend.UTC)  # Use the current time in UTC
    elif start_time:
        start_time = pend.parse(start_time)  # Convert to datetime object
    else:
        return JSONResponse({"status": "error", "message": "Start time is required unless 'Start Now' is checked"},
                            status_code=400)

    end_time = pend.parse(end_time)
    server_id = int(server_id)

    # Decode boosters & roles
    try:
        boosters = json.loads(boosters_json)  # [{value: "2.5", roles: ["role1", "role2"]}]
        roles = json.loads(roles_json)  # ["role1", "role2"]
    except json.JSONDecodeError:
        return JSONResponse({"status": "error", "message": "Invalid JSON data for roles or boosters"},
                            status_code=400)

    # Validate the boosters data
    parsed_boosters = []
    for booster in boosters:
        value = float(booster.get("value", 1))
        role_list = booster.get("roles", [])
        if role_list:
            parsed_boosters.append({"value": value, "roles": role_list})

    # Generate a unique giveaway ID if it's a new giveaway
    if not giveaway_id:
        giveaway_id = str(uuid.uuid4())

    # Image logic
    image_url = None
    if remove_image:
        # Retrieve the current image URL from the database
        existing_giveaway = await db_client.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
        if existing_giveaway and "image_url" in existing_giveaway:
            await delete_from_cdn(existing_giveaway["image_url"])
    elif image and image.filename:
        # Add a timestamp to the title before uploading to avoid cache issues
        timestamp = pend.now(tz=pend.UTC).format("YYYYMMDDHHmmss")
        title_with_timestamp = f"giveaway_{giveaway_id}_{timestamp}"
        image_url = await upload_to_cdn(image=image, title=title_with_timestamp)

    # Fetch existing giveaway to preserve its image if not removed
    if not remove_image and not image_url:
        existing_giveaway = await db_client.giveaways.find_one({"_id": giveaway_id, "server_id": server_id})
        if existing_giveaway:
            image_url = existing_giveaway.get("image_url")

    # Update or create a giveaway in the database
    giveaway_data = {
        "_id": giveaway_id,  # Ensure the unique giveaway_id is stored
        "prize": prize,
        "channel_id": int(channel),
        "start_time": start_time,
        "end_time": end_time,
        "winners": winners,
        "mentions": mentions if mentions else [],
        "text_above_embed": text_above_embed,
        "text_in_embed": text_in_embed,
        "text_on_end": text_on_end,
        "image_url": image_url,
        "profile_picture_required": profile_picture_required,
        "coc_account_required": coc_account_required,
        "roles_mode": roles_mode,
        "roles": roles,
        "boosters": parsed_boosters
    }

    if await db_client.giveaways.find_one({"_id": giveaway_id, "server_id": server_id}):
        # Add modification timestamp
        giveaway_data["updated"] = "yes"
        # Update existing giveaway
        await db_client.giveaways.update_one(
            {"_id": giveaway_id, "server_id": server_id},
            {"$set": giveaway_data}
        )
        status_message = "Giveaway updated successfully. If the giveaway is already live, it will be updated within a minute."

    else:
        # Create a new giveaway
        giveaway_data["server_id"] = server_id
        giveaway_data["status"] = "scheduled"
        await db_client.giveaways.insert_one(giveaway_data)
        if now:
            status_message = "Giveaway created successfully. It will be sent shortly."
        else:
            status_message = "Giveaway created successfully. It will start at the specified time."

        # Redirect to the dashboard with a status message
    redirect_url = f"/giveaway/dashboard?token={token}&message={status_message}"
    return RedirectResponse(url=redirect_url, status_code=303)


@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request, token: str):
    # Verify the token
    token_data = await db_client.tokens.find_one({"token": token, "type": "giveaway"})
    if not token_data:
        return JSONResponse({"detail": "Invalid token."}, status_code=403)

    server_id = token_data["server_id"]

    roles = await get_roles(guild_id=server_id)
    channels = await get_channels(guild_id=server_id)

    return templates.TemplateResponse("giveaways/giveaway_create.html", {
        "request": request,
        "server_id": server_id,
        "token": token,
        "channels": channels,  # Passer les salons
        "roles": roles  # Passer les rôles
    })


@router.get("/edit/{giveaway_id}", response_class=HTMLResponse)
async def edit_page(request: Request, token: str, giveaway_id: str):
    token_data = await db_client.tokens.find_one({"token": token, "type": "giveaway"})
    if not token_data:
        raise HTTPException(status_code=403, detail="Invalid token.")

    giveaway = await db_client.giveaways.find_one({"_id": giveaway_id})
    if not giveaway:
        raise HTTPException(status_code=404, detail="Giveaway not found.")

    server_id = token_data["server_id"]

    roles = await get_roles(guild_id=server_id)
    channels = await get_channels(guild_id=server_id)

    return templates.TemplateResponse("giveaways/giveaway_edit.html", {
        "request": request,
        "server_id": server_id,
        "giveaway": giveaway,
        "token": token_data["token"],
        "channels": channels,
        "roles": roles,
    })


@router.delete("/delete/{giveaway_id}")
async def delete_giveaway(giveaway_id: str, token: str, server_id: str):
    """
    Delete a giveaway from the database.
    """
    print(giveaway_id, token, server_id)
    # Convert to the correct types
    server_id = int(server_id)
    # Verify the token
    token_data = await db_client.tokens.find_one({"token": token, "server_id": server_id})
    if not token_data:
        return JSONResponse({"message": "Invalid token."}, status_code=403)

    # Delete the giveaway
    result = await db_client.giveaways.delete_one({"_id": giveaway_id, "server_id": int(server_id)})
    if result.deleted_count == 1:
        status_message = "Giveaway deleted successfully."
    else:
        status_message = "Giveaway not found."
    redirect_url = f"/giveaway/dashboard?token={token}&message={status_message}"
    return RedirectResponse(url=redirect_url, status_code=303)

@router.post("/preview")
async def preview_giveaway_form(
    prize: str = Form(...),
    text_in_embed: str = Form(""),
    text_above_embed: str = Form(""),
    end_time: str = Form(None),
    winners: int = Form(...),
    image: UploadFile = File(None),
):
    """
    Generate a preview of the giveaway message.
    """
    # Placeholder for image URL (if an image is provided)
    image_url = None
    if image and image.filename:
        # Mock an image URL for preview purposes
        image_url = f"https://via.placeholder.com/400?text=Preview+Image"

    # Format the end time
    footer_text = ""
    if end_time:
        end_datetime = pend.parse(end_time)
        formatted_end_time = end_datetime.format("ddd DD MMM YYYY [at] HH:mm [UTC]")
        footer_text = f"Ends on {formatted_end_time}"

    # Build the embed preview structure
    embed_preview = {
        "title": f"🎉 {prize} - {winners} Winner{'s' if winners > 1 else ''} 🎉",
        "description": f"{text_in_embed}",
        "image": {"url": image_url} if image_url else None,
        "footer": {"text": footer_text} if footer_text else None,
        "color": 0x5865F2  # Typical Discord embed color (blueish)
    }

    return JSONResponse(
        content={
            "text_above_embed": text_above_embed,
            "embed": embed_preview
        }
    )