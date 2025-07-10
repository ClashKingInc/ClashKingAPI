import requests
from fastapi import HTTPException
from utils.utils import db_client

async def fetch_coc_account_data(coc_tag: str) -> dict:
    """Retrieve Clash of Clans account details using the API."""
    coc_tag = coc_tag.replace("#", "%23")
    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}"
    response = requests.get(url)

    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Clash of Clans account does not exist")

    return response.json()  # Return the account data

async def verify_coc_ownership(coc_tag: str, player_token: str) -> bool:
    """Verify if the provided player token matches the given Clash of Clans account."""
    coc_tag = coc_tag.replace("#", "%23")
    url = f"https://proxy.clashk.ing/v1/players/{coc_tag}/verifytoken"
    response = requests.post(url, json={"token": player_token})

    if response.status_code != 200:
        return False  # API error, consider it invalid

    try:
        data = response.json()
        return data.get("status") == "ok"
    except ValueError:
        return False  # If JSON parsing fails, assume invalid


async def is_coc_account_linked(coc_tag: str) -> bool:
    """Check if the Clash of Clans account is already linked to another user."""
    existing_account = await db_client.coc_accounts.find_one({"player_tag": coc_tag})
    return existing_account is not None

