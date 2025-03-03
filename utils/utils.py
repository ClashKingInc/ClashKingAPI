import motor.motor_asyncio
from redis import asyncio as aioredis
import redis
import re
from dotenv import load_dotenv
import coc
import os

import pendulum as pend
from datetime import datetime, timedelta
import io
import asyncio
import aiohttp
from fastapi import HTTPException
from base64 import b64decode as base64_b64decode
from json import loads as json_loads
from slowapi import Limiter
from slowapi.util import get_ipaddr
from .config import Config
from collections import deque
from datetime import datetime
import pytz


config = Config()

limiter = Limiter(key_func=get_ipaddr, key_style="endpoint")


def dynamic_limit(key: str):
    if key in {"::1", "65.108.77.253", "85.10.200.219"}:
        return "1000/second"
    return "30/second"


load_dotenv()
client = motor.motor_asyncio.AsyncIOMotorClient(config.stats_mongodb, compressors="snappy")
other_client = motor.motor_asyncio.AsyncIOMotorClient(config.static_mongodb)

redis = aioredis.Redis(host=config.redis_ip, port=6379, db=1, password=config.redis_pw, retry_on_timeout=True,
                       max_connections=25, retry_on_error=[redis.ConnectionError])


class DBClient():
    def __init__(self):
        self.usafam = other_client.get_database("usafam")
        self.clans_db = self.usafam.get_collection("clans")
        self.server_db = self.usafam.server
        self.bot_db = other_client.get_database("bot")

        collection_class = self.clans_db.__class__

        self.server_db: collection_class = self.usafam.server
        self.clans_db: collection_class = self.usafam.get_collection("clans")
        self.banlist: collection_class = self.usafam.banlist
        self.rosters: collection_class = self.usafam.rosters
        self.ticketing: collection_class = self.usafam.tickets
        self.player_search: collection_class = self.usafam.player_search
        self.embeds: collection_class = self.usafam.custom_embeds
        self.bot_settings: collection_class = self.bot_db.settings
        self.custom_bots: collection_class = self.usafam.custom_bots
        self.open_tickets: collection_class = self.usafam.open_tickets

        self.looper = client.looper
        self.new_looper = client.new_looper
        self.leaderboards = client.get_database("leaderboards")

        self.legends_stats = self.new_looper.legends_stats
        self.legend_rankings: collection_class = self.new_looper.legend_rankings
        self.war_logs_db: collection_class = self.looper.war_logs
        self.player_stats_db: collection_class = self.new_looper.player_stats
        self.attack_db: collection_class = self.looper.warhits
        self.war_timer: collection_class = self.looper.war_timer
        self.join_leave_history: collection_class = self.looper.join_leave_history
        self.player_leaderboard_db: collection_class = self.new_looper.leaderboard_db
        self.player_history: collection_class = self.new_looper.get_collection("player_history")
        self.link_shortner: collection_class = client.clashking.short_links
        self.api_users: collection_class = client.clashking.api_users
        self.tokens: collection_class = client.clashking.tokens
        self.giveaways: collection_class = client.clashking.giveaways

        self.clan_cache_db: collection_class = self.new_looper.clan_cache
        self.clan_wars: collection_class = self.looper.clan_war
        self.legend_history: collection_class = self.looper.legend_history
        self.base_stats: collection_class = self.looper.base_stats
        self.capital: collection_class = self.looper.raid_weekends
        self.clan_stats: collection_class = self.new_looper.clan_stats
        self.rankings: collection_class = self.new_looper.rankings
        self.cwl_groups: collection_class = self.looper.cwl_group

        self.clan_history: collection_class = self.new_looper.clan_history
        self.ranking_history: collection_class = client.ranking_history
        self.player_trophies: collection_class = self.ranking_history.player_trophies
        self.player_versus_trophies: collection_class = self.ranking_history.player_versus_trophies
        self.clan_trophies: collection_class = self.ranking_history.clan_trophies
        self.clan_versus_trophies: collection_class = self.ranking_history.clan_versus_trophies
        self.capital_trophies: collection_class = self.ranking_history.capital
        self.basic_clan: collection_class = self.looper.clan_tags
        self.global_clans: collection_class = self.looper.global_clans

        self.player_capital_lb: collection_class = self.leaderboards.capital_player
        self.clan_capital_lb: collection_class = self.leaderboards.capital_clan

        self.app = client.get_database("app")
        self.app_users: collection_class = self.app.users
        self.app_discord_tokens: collection_class = self.app.discord_tokens
        self.app_clashking_tokens: collection_class = self.app.clashking_tokens
        self.user_clash_accounts: collection_class = client.clashking.coc_accounts

db_client = DBClient()


async def download_image(url: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            image_data = await response.read()
        await session.close()
    image_bytes: bytes = image_data
    return io.BytesIO(image_bytes)


def fix_tag(tag: str):
    tag = tag.replace('%23', '')
    tag = "#" + re.sub(r"[^A-Z0-9]+", "", tag.upper()).replace("O", "0")
    return tag


def gen_season_date():
    end = coc.utils.get_season_end().replace(tzinfo=pend.UTC).date()
    month = end.month
    if end.month <= 9:
        month = f"0{month}"
    return f"{end.year}-{month}"


def gen_games_season():
    now = datetime.utcnow()
    month = now.month
    if month <= 9:
        month = f"0{month}"
    return f"{now.year}-{month}"


def gen_raid_date():
    now = datetime.utcnow().replace(tzinfo=pend.UTC)
    current_dayofweek = now.weekday()
    if (current_dayofweek == 4 and now.hour >= 7) or (current_dayofweek == 5) or (current_dayofweek == 6) or (
            current_dayofweek == 0 and now.hour < 7):
        if current_dayofweek == 0:
            current_dayofweek = 7
        fallback = current_dayofweek - 4
        raidDate = (now - timedelta(fallback)).date()
        return str(raidDate)
    else:
        forward = 4 - current_dayofweek
        raidDate = (now + timedelta(forward)).date()
        return str(raidDate)


def gen_legend_date():
    now = datetime.utcnow()
    hour = now.hour
    if hour < 5:
        date = (now - timedelta(1)).date()
    else:
        date = now.date()
    return str(date)


async def token_verify(server_id: int, api_token: str, only_admin: bool = False):
    if api_token is None:
        raise HTTPException(status_code=403, detail="API Token is required")
    server_lookup = [1103679645439754335]
    if not only_admin:
        server_lookup.append(server_id)
    results = await db_client.server_db.find({"server": {"$in": [server_id, 1103679645439754335]}}).to_list(length=None)
    tokens = [r.get("ck_api_token") for r in results]
    if api_token not in tokens:
        raise HTTPException(status_code=403, detail="Invalid API token or cannot access this resource")


async def get_keys(emails: list, passwords: list, key_names: str, key_count: int, ip: str):
    total_keys = []
    for count, email in enumerate(emails):
        await asyncio.sleep(1.5)
        _keys = []
        async with aiohttp.ClientSession() as session:
            password = passwords[count]
            body = {"email": email, "password": password}
            resp = await session.post("https://developer.clashofclans.com/api/login", json=body)
            resp_paylaod = await resp.json()

            resp = await session.post("https://developer.clashofclans.com/api/apikey/list")
            keys = (await resp.json()).get("keys", [])
            _keys.extend(key["key"] for key in keys if key["name"] == key_names and ip in key["cidrRanges"])

            for key in (k for k in keys if ip not in k["cidrRanges"]):
                await session.post("https://developer.clashofclans.com/api/apikey/revoke", json={"id": key["id"]})

            print(len(_keys))
            while len(_keys) < key_count:
                data = {
                    "name": key_names,
                    "description": "Created on {}".format(datetime.now().strftime("%c")),
                    "cidrRanges": [ip],
                    "scopes": ["clash"],
                }
                hold = True
                tries = 1
                while hold:
                    try:
                        resp = await session.post("https://developer.clashofclans.com/api/apikey/create", json=data)
                        key = await resp.json()
                    except Exception:
                        key = {}
                    if key.get("key") is None:
                        await asyncio.sleep(tries * 0.5)
                        tries += 1
                        if tries > 2:
                            print(tries - 1, "tries")
                    else:
                        hold = False

                _keys.append(key["key"]["key"])

            await session.close()
            for k in _keys:
                total_keys.append(k)

    print(len(total_keys), "total keys")
    return (total_keys)


async def create_keys(emails: list, passwords: list, ip: str):
    keys = await get_keys(emails=emails, passwords=passwords, key_names="test", key_count=10, ip=ip)
    return keys


leagues = ["Legend League", "Titan League I", "Titan League II", "Titan League III", "Champion League I",
           "Champion League II", "Champion League III",
           "Master League I", "Master League II", "Master League III",
           "Crystal League I", "Crystal League II", "Crystal League III",
           "Gold League I", "Gold League II", "Gold League III",
           "Silver League I", "Silver League II", "Silver League III",
           "Bronze League I", "Bronze League II", "Bronze League III", "Unranked"]


async def upload_to_cdn(title: str, picture=None, image=None):
    headers = {
        "content-type": "application/octet-stream",
        "AccessKey": os.getenv("BUNNY_ACCESS_KEY")
    }
    if image is None:
        payload = picture.read()
    else:
        payload = await image.read()
    title = title.replace(" ", "_").lower()
    async with aiohttp.ClientSession() as session:
        async with session.put(url=f"https://storage.bunnycdn.com/clashking-files/{title}.png", headers=headers,
                               data=payload) as response:
            await session.close()
    return f"https://cdn.clashking.xyz/{title}.png"


async def delete_from_cdn(image_url: str):
    """
    Delete a file from the BunnyCDN storage.
    :param image_url: Full URL of the image to delete.
    """
    # Extract the file path from the URL (e.g., "giveaway_xxx.png")
    if not image_url.startswith("https://cdn.clashking.xyz/"):
        return {"status": "error", "message": "Invalid URL format"}

    file_path = image_url.replace("https://cdn.clashking.xyz/", "")

    headers = {
        "AccessKey": os.getenv("BUNNY_ACCESS_KEY")
    }

    # Delete the file from BunnyCDN storage
    delete_url = f"https://storage.bunnycdn.com/clashking-files/{file_path}"
    async with aiohttp.ClientSession() as session:
        async with session.delete(delete_url, headers=headers) as response:
            if response.status == 200:
                return {"status": "success", "message": f"File {file_path} deleted.", "purge_response": purge_response}
            else:
                return {"status": "error",
                        "message": f"Failed to delete file {file_path}. HTTP status: {response.status}"}


def remove_id_fields(data):
    if isinstance(data, list):
        for item in data:
            remove_id_fields(item)
    elif isinstance(data, dict):
        data.pop('_id', None)
        for key, value in data.items():
            remove_id_fields(value)
    return data


from fastapi import Request, HTTPException
from functools import wraps
import os


def check_authentication(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        request: Request = kwargs.get("request")
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            raise HTTPException(status_code=403, detail="Authentication token missing")

        token = auth_header.split(" ")[1] if " " in auth_header else auth_header
        expected_token = os.getenv("AUTH_TOKEN")

        if token != expected_token:
            raise HTTPException(status_code=403, detail="Invalid authentication token")

        return await func(*args, **kwargs)

    return wrapper


async def validate_token(token, expected_type=None):
    """
    Validate a token and return its data if valid.
    """
    token_data = await db_client.tokens.find_one({"token": token})

    if not token_data:
        raise ValueError("Invalid token.")

    # Vérifier si le token a expiré
    if token_data["expires_at"] < datetime.utcnow():
        await db_client.tokens.delete_one({"token": token})  # Nettoyer
        raise ValueError("Token expired.")

    # Vérifier si le type correspond (si applicable)
    if expected_type and token_data["type"] != expected_type:
        raise ValueError(f"Expected token of type '{expected_type}', but got '{token_data['type']}'.")

    return token_data

def utc_to_local(utc_time: datetime, timezone: str = "Europe/Paris") -> str:
    """
    Convert UTC datetime to local datetime string in a specified timezone.

    Args:
        utc_time (datetime): UTC datetime object.
        timezone (str): Timezone string (e.g., "Europe/Paris").

    Returns:
        str: Formatted local time as string "YYYY-MM-DD HH:MM".
    """
    local_tz = pytz.timezone(timezone)
    utc_dt = utc_time.replace(tzinfo=pytz.utc)
    local_dt = utc_dt.astimezone(local_tz)
    return local_dt.strftime("%Y-%m-%d %H:%M")  # Format for display
