import asyncio
import base64
import io
import os
import random
import re
import uuid
from datetime import datetime, timedelta
from json import loads as json_loads

import aiohttp
import coc
import orjson
import pendulum as pend
import pytz
import redis
from bson import json_util
from dotenv import load_dotenv
from fastapi import HTTPException
from hashids import Hashids
from redis import asyncio as aioredis
from slowapi import Limiter
from slowapi.util import get_ipaddr

load_dotenv()

limiter = Limiter(key_func=get_ipaddr, key_style='endpoint')


def dynamic_limit(key: str):
    if key in {'::1', '65.108.77.253', '85.10.200.219'}:
        return '1000/second'
    return '30/second'


def gen_clean_custom_id():
    hashids = Hashids(min_length=7)
    custom_id = hashids.encode(
        pend.now(tz=pend.UTC).int_timestamp
        + random.randint(1000000000, 9999999999)
    )
    return custom_id


async def download_image(url: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            image_data = await response.read()
        await session.close()
    image_bytes: bytes = image_data
    return io.BytesIO(image_bytes)


def gen_season_date():
    end = coc.utils.get_season_end().replace(tzinfo=pend.UTC).date()
    month = end.month
    if end.month <= 9:
        month = f'0{month}'
    return f'{end.year}-{month}'


def gen_games_season():
    now = pend.now(tz=pend.UTC)
    month = now.month
    if month <= 9:
        month = f'0{month}'
    return f'{now.year}-{month}'


def gen_raid_date():
    now = datetime.utcnow().replace(tzinfo=pend.UTC)
    current_dayofweek = now.weekday()
    if (
        (current_dayofweek == 4 and now.hour >= 7)
        or (current_dayofweek == 5)
        or (current_dayofweek == 6)
        or (current_dayofweek == 0 and now.hour < 7)
    ):
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


async def token_verify(
    server_id: int, api_token: str, only_admin: bool = False
):
    if api_token is None:
        raise HTTPException(status_code=403, detail='API Token is required')
    server_lookup = [1103679645439754335]
    if not only_admin:
        server_lookup.append(server_id)
    results = await db_client.server_db.find(
        {'server': {'$in': [server_id, 1103679645439754335]}}
    ).to_list(length=None)
    tokens = [r.get('ck_api_token') for r in results]
    if api_token not in tokens:
        raise HTTPException(
            status_code=403,
            detail='Invalid API token or cannot access this resource',
        )


leagues = [
    'Legend League',
    'Titan League I',
    'Titan League II',
    'Titan League III',
    'Champion League I',
    'Champion League II',
    'Champion League III',
    'Master League I',
    'Master League II',
    'Master League III',
    'Crystal League I',
    'Crystal League II',
    'Crystal League III',
    'Gold League I',
    'Gold League II',
    'Gold League III',
    'Silver League I',
    'Silver League II',
    'Silver League III',
    'Bronze League I',
    'Bronze League II',
    'Bronze League III',
    'Unranked',
]


async def upload_to_cdn(title: str, picture=None, image=None):
    headers = {
        'content-type': 'application/octet-stream',
        'AccessKey': os.getenv('BUNNY_ACCESS_KEY'),
    }
    if image is None:
        payload = picture.read()
    else:
        payload = await image.read()
    title = title.replace(' ', '_').lower()
    async with aiohttp.ClientSession() as session:
        async with session.put(
            url=f'https://storage.bunnycdn.com/clashking-files/{title}.png',
            headers=headers,
            data=payload,
        ) as response:
            await session.close()
    return f'https://cdn.clashking.xyz/{title}.png'


async def delete_from_cdn(image_url: str):
    """
    Delete a file from the BunnyCDN storage.
    :param image_url: Full URL of the image to delete.
    """
    # Extract the file path from the URL (e.g., "giveaway_xxx.png")
    if not image_url.startswith('https://cdn.clashking.xyz/'):
        return {'status': 'error', 'message': 'Invalid URL format'}

    file_path = image_url.replace('https://cdn.clashking.xyz/', '')

    headers = {'AccessKey': os.getenv('BUNNY_ACCESS_KEY')}

    # Delete the file from BunnyCDN storage
    delete_url = f'https://storage.bunnycdn.com/clashking-files/{file_path}'
    async with aiohttp.ClientSession() as session:
        async with session.delete(delete_url, headers=headers) as response:
            if response.status == 200:
                return {
                    'status': 'success',
                    'message': f'File {file_path} deleted.',
                    'purge_response': purge_response,
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to delete file {file_path}. HTTP status: {response.status}',
                }


def remove_id_fields(data):
    return json_loads(json_util.dumps(data))


async def validate_token(token, expected_type=None):
    """
    Validate a token and return its data if valid.
    """
    token_data = await db_client.tokens.find_one({'token': token})

    if not token_data:
        raise ValueError('Invalid token.')

    # Vérifier si le token a expiré
    if token_data['expires_at'] < datetime.utcnow():
        await db_client.tokens.delete_one({'token': token})  # Nettoyer
        raise ValueError('Token expired.')

    # Vérifier si le type correspond (si applicable)
    if expected_type and token_data['type'] != expected_type:
        raise ValueError(
            f"Expected token of type '{expected_type}', but got '{token_data['type']}'."
        )

    return token_data


def utc_to_local(utc_time: datetime, timezone: str = 'Europe/Paris') -> str:
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
    return local_dt.strftime('%Y-%m-%d %H:%M')  # Format for display


async def generate_access_token(
    server_id: int,
    token_type: str,
    expires_hours: int = 1,
    mongo_client=None,
    **additional_data,
):
    """
    Generic function to generate access tokens for different services (rosters, giveaways, etc.)

    Args:
        server_id (int): Discord server ID
        token_type (str): Type of token ('roster', 'giveaway', etc.)
        expires_hours (int): Token expiry in hours (default 1 hour)
        mongo_client: MongoDB client instance
        **additional_data: Additional fields to store with the token

    Returns:
        dict: Contains 'token', 'expires_at', and 'dashboard_url'
    """
    # Generate unique token
    token = (
        base64.urlsafe_b64encode(uuid.uuid4().bytes)
        .rstrip(b'=')
        .decode('utf-8')
    )

    # Token data
    token_data = {
        'server_id': server_id,
        'token': token,
        'type': token_type,
        'expires_at': pend.now() + timedelta(hours=expires_hours),
        **additional_data,  # Add any additional data passed
    }

    # Save to database
    await mongo_client.tokens_db.insert_one(token_data)

    # Generate dashboard URL based on token type and environment
    from utils.config import Config
    config = Config()
    
    if config.is_local:
        base_url = 'http://localhost:8000'
    else:
        base_url = 'https://api.clashk.ing'
    
    dashboard_url = f'{base_url}/ui/{token_type}/dashboard?token={token}'

    return {
        'token': token,
        'expires_at': token_data['expires_at'],
        'dashboard_url': dashboard_url,
    }


async def bulk_requests(urls: list[str]):
    async def fetch_function(session: aiohttp.ClientSession, url: str):
        url = url.replace('#', '%23')
        async with session.get(
            f'https://proxy.clashk.ing/v1/{url}'
        ) as response:
            if response.status != 200:
                return None
            item_bytes = await response.read()
            return orjson.loads(item_bytes)

    tasks = []
    async with aiohttp.ClientSession() as session:
        for url in urls:
            tasks.append(asyncio.create_task(fetch_function(session, url)))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    return [
        r for r in results if r is not None and not isinstance(r, Exception)
    ]


def generate_custom_id(input_number: int = None):
    # Use input_number if provided, otherwise generate a random number
    base_input = input_number or random.randint(1000000000, 9999999999)

    # Combine with current UTC timestamp to get a unique ID
    base_number = (
        base_input
        + int(pend.now(tz=pend.UTC).timestamp())
        + random.randint(1000000000, 9999999999)
    )

    return base_number
