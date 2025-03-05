import os

import aiohttp
import httpx
import pendulum as pend
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Request, APIRouter
from fastapi.security import OAuth2PasswordBearer

from models.app import CocAccountRequest, CocAccountsRequest
from utils.auth_utils import decode_jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet
import re

from utils.utils import fix_tag, db_client

############################
# Load environment variables
############################
load_dotenv()

############################
# Global configuration
############################
SECRET_KEY = os.getenv('SECRET_KEY')
REFRESH_SECRET = os.getenv('REFRESH_SECRET')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
ALGORITHM = "HS256"

# Fernet cipher for encryption/decryption
cipher = Fernet(ENCRYPTION_KEY)

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# FastAPI router
router = APIRouter(tags=["App Player"], include_in_schema=True)


@router.post("/app/coc-accounts/stats")
async def add_coc_account(request: CocAccountsRequest, authorization: str = Header(None)):
    """Associate a Clash of Clans account (tag) with a user WITHOUT ownership verification."""
    token = authorization.split("Bearer ")[1]
    decoded_token = decode_jwt(token)
    user_id = decoded_token["sub"]
    player_tags = request.player_tags
    return_data = {"items": []}

    for player_tag in player_tags:
        player_tag = fix_tag(player_tag)

        player_data = await db_client.player_stats_db.find_one({"tag": player_tag},
                                                               {"tag": 1, "name": 1, "clan_tag": 1, "townhall": 1,
                                                                "donations": 1, "legends": 1,
                                                                "clan_games": 1, "season_pass": 1, "activity": 1,
                                                                "last_online": 1, "last_online_time": 1,
                                                                "attack_wins": 1, "dark_elixir": 1, "gold": 1,
                                                                "clancapitalcontributions": 1, "capital_gold": 1,
                                                                "warstars": 1, "league": 1, "season_trophies": 1,
                                                                "last_updated": 1,
                                                                })
        player_data = player_data or {}

        return_data["items"].append(
            {
                "tag": player_tag,
                "name": player_data.get("name"),
                "clan_tag": player_data.get("clan_tag"),
                "town_hall": player_data.get("townhall"),
                "donations": player_data.get("donations"),
                "legends": player_data.get("legends"),
                "clan_games": player_data.get("clan_games"),
                "season_pass": player_data.get("season_pass"),
                "activity": player_data.get("activity"),
                "last_online": player_data.get("last_online"),
                "last_online_time": player_data.get("last_online_time"),
                "attack_wins": player_data.get("attack_wins"),
                "dark_elixir": player_data.get("dark_elixir"),
                "gold": player_data.get("gold"),
                "capital_gold": player_data.get("capital_gold"),
                "clan_capital_contributions": player_data.get("clancapitalcontributions"),
                "war_stars": player_data.get("warstars"),
                "league": player_data.get("league"),
                "is_in_legend_league": player_data.get("league") == "Legend League",
                "season_trophies": player_data.get("season_trophies"),
                "last_updated": player_data.get("last_updated"),
            }
        )
