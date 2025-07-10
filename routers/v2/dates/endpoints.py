import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Query, Request
from typing import Annotated
from utils.time import (
    gen_season_date, gen_raid_date, gen_legend_date,
    gen_games_season, season_start_end, get_season_raid_weeks
)
from utils.utils import fix_tag, remove_id_fields, check_authentication
from utils.database import MongoClient as mongo


router = APIRouter(prefix="/v2",tags=["Dates"], include_in_schema=True)



@router.get("/dates/seasons",
             name="Get season dates")
async def current_season(request: Request, number_of_seasons: int = 0, as_text: bool = False):
    return {"items": gen_season_date(num_seasons=number_of_seasons, as_text=as_text)}



@router.get("/dates/raid-weekends",
             name="Get raid weekend dates")
async def current_season(request: Request, number_of_weeks: int = 0):
    return {"items": gen_raid_date(num_weeks=number_of_weeks)}


@router.get("/dates/current",
             name="Get current dates")
async def legend_date(request: Request):
    return {
        "season": gen_season_date(),
        "raid": gen_raid_date(),
        "legend": gen_legend_date(),
        "clan-games": gen_games_season(),
    }

@router.get("/dates/season-start-end",
             name="Get season start and end dates")
async def dates_season_start_end(request: Request, season: str = "", gold_pass_season: bool = False):
    if not season:
        season = gen_season_date()
    season_start, season_end = season_start_end(season=season, gold_pass_season=gold_pass_season)
    return {
        "season_start": season_start,
        "season_end": season_end,
    }

@router.get("/dates/season-raid-dates",
             name="Get raid weekends for a season")
async def dates_raid_season_dates(request: Request, season: str = ""):
    if not season:
        season = gen_season_date()
    return {
        "items": get_season_raid_weeks(season=season),
    }







