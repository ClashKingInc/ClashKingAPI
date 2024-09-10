
import coc

from fastapi import  Request, Response, HTTPException
from fastapi import APIRouter, Query
from typing import Annotated, List
from fastapi_cache.decorator import cache
from datetime import datetime
from utils.utils import fix_tag, db_client, token_verify, limiter, remove_id_fields



router = APIRouter(prefix="/v2",tags=["Clan Settings Endpoints"], include_in_schema=False)


