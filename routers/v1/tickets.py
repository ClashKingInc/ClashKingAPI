import datetime
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
from utils.utils import fix_tag, db_client, upload_to_cdn, config

router = APIRouter(prefix="/ticketing", include_in_schema=False)
templates = Jinja2Templates(directory="templates")

TOKEN = config.bot_token
BASE_URL = 'https://discord.com/api/v10'





async def get_roles(guild_id):
    url = f'{BASE_URL}/guilds/{guild_id}/roles'
    headers = {
        'Authorization': f'Bot {TOKEN}',
        'Content-Type': 'application/json'
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                roles = await response.json()
                return roles
            else:
                print(f"DEBUG: Failed to get roles: {response.status}")
                return None


async def get_channels(guild_id):
    url = f'{BASE_URL}/guilds/{guild_id}/channels'
    headers = {
        'Authorization': f'Bot {TOKEN}',
        'Content-Type': 'application/json'
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                channels = await response.json()
                return channels
            else:
                print(f"DEBUG: Failed to get channels: {response.status}")
                return None


async def fetch_emojis(guild_id):
    url = f"https://discord.com/api/v9/guilds/{guild_id}/emojis"
    headers = {"Authorization": f"Bot {TOKEN}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                return await response.json()
            else:
                response.raise_for_status()


def filter_categories(channels):
    return [channel for channel in channels if channel['type'] == 4]


def filter_text_and_threads(channels):
    return [channel for channel in channels if channel['type'] in {0, 11}]


@router.get("/")
async def read_settings(request: Request, token: str):
    ticket_settings = await db_client.ticketing.find_one({"token": token})
    embed_name = ticket_settings.get('embed_name')
    open_category = ticket_settings.get("open-category")
    server_id = ticket_settings.get("server_id")

    channels = await get_channels(guild_id=server_id)
    categories = filter_categories(channels=channels)
    text_channels = filter_text_and_threads(channels=channels)

    emojis = await fetch_emojis(guild_id=server_id)
    roles = await get_roles(guild_id=server_id)

    server_embeds = await db_client.embeds.find({'server': server_id}, {'name': 1}).to_list(length=None)
    embeds = [e.get('name') for e in server_embeds]

    categories = sorted([{"name": c.get("name"), "id": c.get("id")} for c in categories], key=lambda x: x.get("name"))
    logs = sorted([{"name": c.get("name"), "id": c.get("id")} for c in text_channels], key=lambda x: x.get("name"))
    roles = sorted([{"name": c.get("name"), "id": c.get("id")} for c in roles], key=lambda x: x.get("name"))

    components = ticket_settings.get("components") or []
    print("DEBUG: Components from DB:", components)
    settings = {}
    for component in components:
        button_id = component.get("custom_id")
        mid_settings = ticket_settings.get(f"{button_id}_settings", {})
        questions = mid_settings.get("questions") or []
        for _ in range(5 - len(questions)):
            questions.append("")
        mid_settings["questions"] = questions
        mid_settings["mod_role"] = mid_settings.get("mod_role") or []
        settings[f"{button_id}_settings"] = mid_settings

    return templates.TemplateResponse("tickets.html", {
        "request": request,
        "name": "recruit panel",
        "embed_name": embed_name,
        "open_category": str(open_category),
        "log_channel_click": str(ticket_settings.get("ticket_button_click_log")),
        "log_channel_close": str(ticket_settings.get("ticket_close_log")),
        "log_channel_status": str(ticket_settings.get("status_change_log")),
        "embeds": embeds,
        "categories": categories,
        "logs": logs,
        "roles": roles,
        "components": components,
        "settings": settings,
        "emojis": emojis,
        "token": token
    })


@router.post("/save-settings")
async def save_settings(request: Request):
    data = await request.json()
    ticket_settings = await db_client.ticketing.find_one({"token": data.get("token")})
    new_data = {
        "status_change_log": data.get("log_channel_status"),
        "ticket_button_click_log": data.get("log_channel_click"),
        "ticket_close_log": data.get("log_channel_close"),
        "embed_name": data.get("embed_name"),
        "open-category": data.get("open_category"),
    }
    text_style_conversion = {
        'blue': 1,
        'gray': 2,
        'green': 3,
        'red': 4,
    }
    new_components = []
    ids_we_need = []
    for component in data.get("components"):
        questions = component.get('questions', [])
        questions = [q for q in questions if q]
        comp_label = component.get("label")
        comp_custom_id = component.get("custom_id", "")
        # Update existing component if it has a valid custom_id
        if comp_custom_id and not comp_custom_id.startswith("temp_"):
            button = next((x for x in ticket_settings.get('components', []) if x.get('custom_id') == comp_custom_id),
                          None)
            if button:
                ids_we_need.append(comp_custom_id)
                button["style"] = text_style_conversion.get(component.get("style"))
                button["emoji"] = component.get("emoji") or {}
                button["label"] = comp_label
                new_components.append(button)
                new_data[f"{comp_custom_id}_settings"] = ticket_settings.get(f"{comp_custom_id}_settings", {})
                new_data[f"{comp_custom_id}_settings"].update({
                    "questions": questions,
                    "mod_role": component.get("mod_role"),
                    "no_ping_mod_role": component.get("no_ping_mod_role"),
                    "private_thread": component.get("private_thread"),
                    "th_min": int(component.get("th_min")),
                    "num_apply": int(component.get("num_apply")),
                    "naming": component.get("naming") or '{ticket_count}-{user}',
                    "account_apply": component.get("account_apply"),
                })
            else:
                comp_custom_id = ""
        # For new components or temporary IDs
        if not comp_custom_id or comp_custom_id.startswith("temp_"):
            button_custom_id = f"{ticket_settings.get('name')}_{str(uuid.uuid4())}"
            new_components.append({
                "type": 2,
                "style": text_style_conversion.get(component.get("style")),
                "emoji": component.get("emoji") or {},
                "label": comp_label,
                "disabled": False,
                "custom_id": button_custom_id
            })
            new_data[f"{button_custom_id}_settings"] = {
                "message": None,
                "questions": questions,
                "mod_role": component.get("mod_role"),
                "no_ping_mod_role": component.get("no_ping_mod_role"),
                "private_thread": component.get("private_thread"),
                "th_min": int(component.get("th_min")),
                "num_apply": int(component.get("num_apply")),
                "naming": component.get("naming") or '{ticket_count}-{user}',
                "account_apply": component.get("account_apply"),
            }
    # Remove settings for components that were deleted
    for old_component in ticket_settings.get("components", []):
        button_id = old_component.get("custom_id")
        if button_id not in ids_we_need:
            await db_client.ticketing.update_one(
                {'token': data.get("token")},
                {'$unset': {f"{button_id}_settings": {}}},
            )
    new_data["components"] = new_components
    print("DEBUG: New data being saved:", new_data)
    await db_client.ticketing.update_one({"token": data.get("token")}, {"$set": new_data})
    return {"message": "Settings saved successfully"}


@router.get("/open/json/{channel_id}")
async def open_ticket_json(channel_id: int, request: Request):
    open_ticket = await db_client.open_tickets.find_one({"channel": channel_id}, {"_id": 0})
    if open_ticket:
        for key in ["user", "channel", "thread", "server"]:
            if key in open_ticket:
                open_ticket[key] = str(open_ticket[key])
    return open_ticket