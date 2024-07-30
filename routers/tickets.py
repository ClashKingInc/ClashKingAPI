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

router = APIRouter(prefix="/ticketing")

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
                print(f"Failed to get roles: {response.status}")
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
                print(f"Failed to get channels: {response.status}")
                return None

async def fetch_emojis(guild_id):
    url = f"https://discord.com/api/v9/guilds/{guild_id}/emojis"
    headers = {
        "Authorization": f"Bot {TOKEN}"
    }

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
    # Sample data fetched from the database

    ticket_settings = await db_client.ticketing.find_one({"token" : token})

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

    categories = sorted([{"name" : c.get("name"), "id" : c.get("id")} for c in categories], key=lambda x : x.get("name"))
    logs = sorted([{"name" : c.get("name"), "id" : c.get("id")} for c in text_channels], key=lambda x : x.get("name"))
    roles = sorted([{"name" : c.get("name"), "id" : c.get("id")} for c in roles], key=lambda x : x.get("name"))

    components = ticket_settings.get("components")

    settings = {}
    for component in components:
        button_id = component.get("custom_id")
        mid_settings = ticket_settings[f"{button_id}_settings"]
        mid_settings["questions"] = mid_settings["questions"] or ["" for x in range (0, 5)]
        mid_settings["mod_role"] = mid_settings["mod_role"] or []
        settings[f"{button_id}_settings"] = mid_settings

    '''settings = {
        "apply_1674374185_settings": {
            "message": {
                "image": {"url": "https://media.discordapp.net/attachments/1026337830831665174/1029880039463985193/p_footer_1.png?width=885&height=40", "height": 0, "width": 0},
                "thumbnail": {
                    "url": "https://images-ext-2.discordapp.net/external/IbXGJuIosR7-76EifGqlur-Bfn4UMQJ9sdg0Ga3YiQk/%3Fsize%3D1024/https/cdn.discordapp.com/icons/640280017770774549/a_7e2c4bfd30b5a4554bb1e3aea4e31b31.gif?width=461&height=461",
                    "height": 0, "width": 0},
                "color": 16711935,
                "type": "rich",
                "description": "<a:Right_Purple_Arrow:1002039777949913140> Please be patient and we will review your application and respond to you as soon as possible.\n\n<a:Right_Purple_Arrow:1002039777949913140> If you have any additional questions or information to provide, please send them in the chat.\n\n<a:Important:1066580173237002271> Provide a screenshot of your base.\n",
                "title": "<:arcane_b_rules:1033782225625428139> Clan Application"
            },
            "questions": [
                "Clan Type? (Competitive, FWA, Zen (Heroes Down, War Always), other)",
                "How did you find us? (Discord, Reddit, etc.)",
                "Did someone invite you? If so, Who?",
                "",
                ""
            ],
            "mod_role": ["999140213953671188"],
            "private_thread": True,
            "roles_to_add": [],
            "roles_to_remove": [],
            "apply_clans": None,
            "account_apply": True,
            "player_info": True,
            "naming": "{emoji_status}ℂ𝕃𝔸ℕ│{account_th}│{user}",
            "ping_staff": True,
            "num_apply": 10,
            "th_min": 2,
            "no_ping_mod_role": None
        },
        "apply_1674379970_settings": {
            "message": {
                "image": {"url": "https://media.discordapp.net/attachments/1026337830831665174/1029880039463985193/p_footer_1.png?width=885&height=40", "height": 0, "width": 0},
                "thumbnail": {
                    "url": "https://images-ext-2.discordapp.net/external/IbXGJuIosR7-76EifGqlur-Bfn4UMQJ9sdg0Ga3YiQk/%3Fsize%3D1024/https/cdn.discordapp.com/icons/640280017770774549/a_7e2c4bfd30b5a4554bb1e3aea4e31b31.gif?width=461&height=461",
                    "height": 0, "width": 0},
                "color": 16711935,
                "type": "rich",
                "description": "<a:Right_Purple_Arrow:1002039777949913140> Please be patient and we will review your application and respond to you as soon as possible.\n\n<a:Right_Purple_Arrow:1002039777949913140> If you have any additional questions or information to provide, please send them in the chat.",
                "title": "<:arcane_b_rules:1033782225625428139> Staff Application"
            },
            "questions": [
                "What are you applying for? (Moderation, Event Staff, Recruitment Staff, Base Building Staff)",
                "What time zone are you in?",
                "What is your experience with Discord?",
                "Are you willing to read the guidelines if you're accepted?",
                "How old are you?"
            ],
            "mod_role": ["1024028497129263106", "1065031422399762563"],
            "private_thread": True,
            "roles_to_add": None,
            "roles_to_remove": None,
            "apply_clans": None,
            "account_apply": False,
            "player_info": False,
            "naming": "{emoji_status}𝕊𝕋𝔸𝔽𝔽│{user}"
        },
        # Add other settings as necessary
    }'''
    print(settings)
    print(logs)
    return templates.TemplateResponse("tickets.html", {
        "request": request,
        "name" : "recruit panel",
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
        "emojis" : emojis,
        "token" : token
    })

@router.post("/save-settings")
async def save_settings(request: Request):
    data = await request.json()
    ticket_settings = await db_client.ticketing.find_one({"token" : data.get("token")})

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
        button_name = component.get("label")
        button_id = next((x for x in ticket_settings.get('components') if x.get('label') == button_name), None)
        if button_id is None:
            button_custom_id = f"{ticket_settings.get('name')}_{int(pend.now(tz=pend.UTC).timestamp())}"
            new_components.append({
                "type" : 2,
                "style" : text_style_conversion.get(component.get("style")),
                "emoji" : component.get("emoji") or {},
                "label" : component.get("label"),
                "disabled" : False,
                "custom_id" : button_custom_id
            })
            new_data[f"{button_custom_id}_settings"] = {
                "message" : None,
                "questions" : questions,
                "mod_role" : component.get("mod_role"),
                "no_ping_mod_role" : component.get("no_ping_mod_role"),
                "private_thread" : component.get("private_thread"),
                "th_min" : int(component.get("th_min")),
                "num_apply" : int(component.get("num_apply")),
                "naming" : component.get("naming") or '{ticket_count}-{user}',
                "account_apply" : component.get("account_apply"),
            }
        else:
            #UPDATE EXISTING
            ids_we_need.append(button_id.get("custom_id"))
            button_id["style"] = text_style_conversion.get(component.get("style"))
            button_id["emoji"] = component.get("emoji") or {}
            button_id["label"] = component.get("label")
            new_components.append(button_id)

            new_data[f"{button_id.get('custom_id')}_settings"] = ticket_settings[f"{button_id.get('custom_id')}_settings"]
            new_data[f"{button_id.get('custom_id')}_settings"]["questions"] = questions
            new_data[f"{button_id.get('custom_id')}_settings"]["mod_role"] = component.get("mod_role")
            new_data[f"{button_id.get('custom_id')}_settings"]["no_ping_mod_role"] = component.get("no_ping_mod_role")
            new_data[f"{button_id.get('custom_id')}_settings"]["private_thread"] = component.get("private_thread")
            new_data[f"{button_id.get('custom_id')}_settings"]["th_min"] = int(component.get("th_min"))
            new_data[f"{button_id.get('custom_id')}_settings"]["num_apply"] = int(component.get("num_apply"))
            new_data[f"{button_id.get('custom_id')}_settings"]["naming"] = component.get("naming") or '{ticket_count}-{user}'
            new_data[f"{button_id.get('custom_id')}_settings"]["account_apply"] = component.get("account_apply")

    for old_component in ticket_settings.get("components"):
        button_id = old_component.get("custom_id")
        if button_id not in ids_we_need:
            await db_client.ticketing.update_one(
                {'token': data.get("token")},
                {'$unset': {f"{button_id}_settings": {}}},
            )
    new_data["components"] = new_components
    await db_client.ticketing.update_one({"token" : data.get("token")}, {"$set": new_data})
    return {"message": "Settings saved successfully"}
