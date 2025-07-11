import os
import ujson
from fastapi import  Request, Response
from fastapi import APIRouter




router = APIRouter(tags=["Game Data"])

@router.get("/assets",
         name="Link to download a zip with all assets", include_in_schema=False)
async def assets(request: Request, response: Response):
    return {"download-link" : "https://cdn.clashking.xyz/Out-Sprites.zip"}



@router.get("/json/{type}",
         name="View json game data (/json/list, for list of types)")
async def json(type: str, request: Request, response: Response):
    if type == "list":
        return {"types" : ["troops", "heroes", "hero_equipment", "spells", "buildings", "pets", "supers", "townhalls", "translations"]}
    file_name = f"assets/json/{type}.json"
    file_path = os.getcwd() + "/" + file_name
    with open(file_path) as json_file:
        data = ujson.load(json_file)
        return data