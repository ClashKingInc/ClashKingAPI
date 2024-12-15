import uuid
from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from routers.public.tickets import get_channels, get_roles
from utils.utils import db_client, validate_token

router = APIRouter(prefix="/giveaway", include_in_schema=False)
templates = Jinja2Templates(directory="templates")


@router.get("/dashboard", response_class=HTMLResponse)
async def giveaway_dashboard(request: Request, token: str, message: str = None):
    """
    Dashboard to view, create, and manage giveaways.
    """
    # Valider le token et s'assurer qu'il est lié à un administrateur
    try:
        token_data = await validate_token(token, expected_type="giveaway")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    server_id = token_data["server_id"]
    channels = await get_channels(guild_id=server_id)
    print(channels)

    # Obtenir tous les giveaways pour ce serveur
    giveaways = await db_client.giveaways.find({"server_id": server_id}).to_list(length=None)

    # Séparer les giveaways en catégories
    now = datetime.utcnow()
    ongoing = [g for g in giveaways if g["status"] == "ongoing"]
    upcoming = [g for g in giveaways if g["status"] == "scheduled"]
    ended = [g for g in giveaways if g["status"] == "ended"]

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


from fastapi import Form, UploadFile, File
from fastapi.responses import JSONResponse

from utils.utils import upload_to_cdn


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
):
    """
    Handle form submissions to create or update a giveaway.
    """
    # Convert start_time and end_time to datetime objects
    if now:
        start_time = datetime.utcnow()  # Use the current time in UTC
    elif start_time:
        start_time = datetime.fromisoformat(start_time)  # Convert to datetime object
    else:
        return JSONResponse({"status": "error", "message": "Start time is required unless 'Start Now' is checked"},
                            status_code=400)

    end_time = datetime.fromisoformat(end_time)
    server_id = int(server_id)

    # Generate a unique giveaway ID if it's a new giveaway
    if not giveaway_id:
        giveaway_id = str(uuid.uuid4())

    # Upload image if provided
    image_url = None
    if image:
        image_url = await upload_to_cdn(image=image, title=f"giveaway_{giveaway_id}")

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
        "image_url": image_url
    }

    if await db_client.giveaways.find_one({"_id": giveaway_id, "server_id": server_id}):
        # Update existing giveaway
        await db_client.giveaways.update_one(
            {"_id": giveaway_id, "server_id": server_id},
            {"$set": giveaway_data}
        )
        status_message = "Giveaway updated successfully."

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
    # Vérifiez et récupérez les informations du serveur à partir du token
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
        "roles": roles
    })

@router.delete("/delete/{giveaway_id}")
async def delete_giveaway(giveaway_id: str, token: str, server_id: str):
    """
    Supprime un giveaway de la base de données.
    """
    print(giveaway_id, token, server_id)
    # Conversion server_id en int
    server_id = int(server_id)
    # Vérifiez que le token est valide
    token_data = await db_client.tokens.find_one({"token": token, "server_id": server_id})
    if not token_data:
        return JSONResponse({"message": "Invalid token."}, status_code=403)

    # Supprimez le giveaway
    result = await db_client.giveaways.delete_one({"_id": giveaway_id, "server_id": int(server_id)})
    if result.deleted_count == 1:
        status_message = "Giveaway deleted successfully."
    else:
        status_message = "Giveaway not found."
    redirect_url = f"/giveaway/dashboard?token={token}&message={status_message}"
    return RedirectResponse(url=redirect_url, status_code=303)
