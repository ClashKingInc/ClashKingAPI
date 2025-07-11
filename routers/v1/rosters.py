import aiohttp
import json
import re
import uuid
import base64
import pendulum as pend
from fastapi import APIRouter, Form, File, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from starlette.requests import Request
from utils.utils import db_client, upload_to_cdn

router = APIRouter(prefix="/roster", include_in_schema=False)

templates = Jinja2Templates(directory="templates")


@router.get("/", response_class=HTMLResponse)
async def get_form(request: Request, token: str):
    roster = await db_client.rosters.find_one({"token" : token})
    server = roster.get("server_id")
    clans = await db_client.clans_db.find({"server" : server}, {"name" : 1, "tag" : 1}).to_list(length=None)
    clans = [f"{c.get('name')} ({c.get('tag')})" for c in clans]
    linked_clan = f"{roster.get('clan_name')} ({roster.get('clan_tag')})"
    server = await db_client.server_db.find_one({'server': server}, {'player_groups' : 1})
    buttons = list(set(server.get('player_groups', [])))
    min, max = roster.get('th_restriction').split('-')
    if max == "max":
        max = 17
    initial_values = {
        "townhall_min": int(min),
        "townhall_max": int(max),
        "max_roster_size": roster.get('roster_size', 50),
        "description": roster.get('description', ''),
        "time": roster.get('time'),
        "linked_clan": linked_clan,
        "sort": roster.get('sort', ['Townhall Level', 'Name', 'Heroes', 'Player Tag'])[:4],
        "columns": roster.get('columns', ['Townhall Level', 'Name', 'Player Tag', 'Heroes'])[:4],
        "buttons": roster.get('buttons', []),
        "name" : roster.get("alias")
    }
    if initial_values["time"]:
        initial_values["time"] = pend.from_timestamp(timestamp=initial_values["time"], tz=pend.UTC).isoformat()

    return templates.TemplateResponse("index.html", {
        "request": request,
        "token": token,
        "clans": clans,
        "initial_values": initial_values,
        "possible_buttons": buttons

    })


@router.get("/edit")
async def get_index(request: Request):
    clan1 = {
        "clan_name": "Assassins",
        "clan_tag": "#92G9J8CG",
        "clan_badge": "https://api-assets.clashofclans.com/badges/512/pZVNGnp17w0_ErJ7tZX_82AmtnBzA2zKCeihWO1q8k0.png",
        "members": [
            {
                "name": "MEGA DOC",
                "tag": "#8CYRJ08Y",
                "hero_lvs": 265,
                "townhall": 15,
                "discord": "MEGA_DOC#1234",
                "hitrate": 0,
                "current_clan": "MEGA EMPIRE",
                "current_clan_tag": "#2JGYRJVL",
                "war_pref": True,
                "trophies": 5175,
                "sub": False,
                "group": "No Group"
            },
            # Add more members as needed
        ]
    }

    clan2 = {
        "clan_name": "Defenders",
        "clan_tag": "#92G9J8CG",
        "clan_badge": "https://api-assets.clashofclans.com/badges/512/pZVNGnp17w0_ErJ7tZX_82AmtnBzA2zKCeihWO1q8k0.png",
        "members": [
            {
                "name": "Guardian",
                "tag": "#8CYRJ08Y",
                "hero_lvs": 265,
                "townhall": 15,
                "discord": "Guardian#5678",
                "hitrate": 0,
                "current_clan": "MEGA EMPIRE",
                "current_clan_tag": "#2JGYRJVL",
                "war_pref": True,
                "trophies": 5175,
                "sub": False,
                "group": "No Group"
            },
            # Add more members as needed
        ]
    }
    return templates.TemplateResponse("roster.html", {"request": request, "clan1": clan1, "clan2": clan2})

@router.get("/search")
async def search_players(query: str):
    # Implement your search logic here
    results = []  # Replace with actual search results
    return {"results": results}

@router.post("/submit")
async def submit_form(
        settings: str = Form(...),  # JSON string
        image: UploadFile = File(None)  # Optional image
):
    # Parse the JSON string to a dictionary
    settings_dict = json.loads(settings)

    # Handle image upload (if provided)
    if image:
        random_uuid = uuid.uuid4()
        # Encode the UUID as bytes
        uuid_bytes = random_uuid.bytes
        # Encode the bytes in base64
        base64_uuid = base64.urlsafe_b64encode(uuid_bytes).rstrip(b'=')
        # Convert to string
        url_safe_uuid = base64_uuid.decode('utf-8')
        image_url = await upload_to_cdn(image=image, title=url_safe_uuid)
    else:
        image_url = None

    townhall_max = settings_dict.get('townhall_max')
    if townhall_max == 17:
        townhall_max = "max"
    th_restriction = f'{settings_dict.get("townhall_min")}-{townhall_max}'
    clan_tag = re.search(r'\(([^)]+)\)', settings_dict.get('linked_clan')).group(1)
    async with aiohttp.ClientSession() as session:
        async with session.get(f"https://proxy.clashk.ing/v1/clans/{clan_tag.replace('#', '%23')}") as response:
            if response.status == 200:
                clan_data = await response.json()

    previous_roster = await db_client.rosters.find_one({"token" : settings_dict.get('token')})
    await db_client.rosters.update_one({"token" : settings_dict.get('token')},
        {"$set" : {
        'alias' : settings_dict.get('name')[:100],
        'image' : image_url or previous_roster.get('image'),
        'th_restriction' : th_restriction,
        'columns' : settings_dict.get('columns')[:4],
        'sort' : settings_dict.get('sort')[:4],
        'time' : settings_dict.get('time') or None,
        'description': settings_dict.get('description') or None,
        'roster_size' : int(settings_dict.get('max_roster_size')),
        'buttons' : settings_dict.get('buttons', []),
        'clan_tag' : clan_tag,
        'clan_badge' : clan_data.get('badgeUrls').get("large"),
        'clan_name' : clan_data.get("name")
    }})
    return JSONResponse({"status": "Form submitted successfully"})
