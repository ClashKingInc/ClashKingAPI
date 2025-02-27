import pandas as pd
import io
from dotenv import load_dotenv
import os
import asyncio
import uuid
load_dotenv()
import aiohttp
from fastapi.responses import RedirectResponse
from fastapi import Request, Response
from fastapi import APIRouter
from fastapi_cache.decorator import cache
from typing import Dict
from slowapi import Limiter
from slowapi.util import get_ipaddr
from utils.utils import db_client, download_image, config, upload_to_cdn
import matplotlib.pyplot as plt
from PIL import Image
from typing import List
from fastapi.responses import HTMLResponse
from coc.ext import discordlinks

from PIL import Image, ImageDraw, ImageFont
import pandas as pd
import io
from fastapi import Request, Response
import numpy as np

router = APIRouter(tags=["Utility"])

link_client = None
@router.on_event("startup")
async def startup_event():
    global link_client
    link_client = await discordlinks.login(config.link_api_username, config.link_api_password)

#UTILS
@router.post("/table",
         name="Custom Table",
         include_in_schema=False)
async def table_renderer(info: Dict, request: Request, response: Response):
    columns = info.get("columns")
    positions = info.get("positions")
    data = info.get("data")
    logo = info.get("logo")
    badge_columns = info.get("badge_columns")
    title = info.get("title")

    fig = plt.figure(figsize=(8, 10), dpi=300)
    img = plt.imread("assets/clouds.jpg")
    ax = plt.subplot()

    df_final = pd.DataFrame(data, columns=columns)
    ncols = len(columns) + 1
    nrows = df_final.shape[0]

    ax.set_xlim(0, ncols + 1)
    ax.set_ylim(0, nrows + 1)

    positions = [0.15, 3.5, 4.5, 5.5, 6.5, 7.5][:len(columns)]

    # -- Add table's main text
    for i in range(nrows):
        for j, column in enumerate(columns):
            if j == 0:
                ha = 'left'
            else:
                ha = 'center'
            if column == 'Min':
                continue
            else:
                text_label = f'{df_final[column].iloc[i]}'
                weight = 'normal'
            ax.annotate(
                xy=(positions[j], i + .5),
                text=text_label,
                ha=ha,
                va='center',
                weight=weight
            )

    # -- Transformation functions
    DC_to_FC = ax.transData.transform
    FC_to_NFC = fig.transFigure.inverted().transform
    # -- Take data coordinates and transform them to normalized figure coordinates
    DC_to_NFC = lambda x: FC_to_NFC(DC_to_FC(x))
    # -- Add nation axes
    ax_point_1 = DC_to_NFC([2.25, 0.25])
    ax_point_2 = DC_to_NFC([2.75, 0.75])
    ax_width = abs(ax_point_1[0] - ax_point_2[0])
    ax_height = abs(ax_point_1[1] - ax_point_2[1])

    for x in range(0, nrows):
        ax_coords = DC_to_NFC([2.25, x + .25])
        flag_ax = fig.add_axes(
            [ax_coords[0], ax_coords[1], ax_width, ax_height]
        )

        badge = await download_image(badge_columns[x])
        flag_ax.imshow(Image.open(badge))
        flag_ax.axis('off')

    ax_point_1 = DC_to_NFC([4, 0.05])
    ax_point_2 = DC_to_NFC([5, 0.95])
    ax_width = abs(ax_point_1[0] - ax_point_2[0])
    ax_height = abs(ax_point_1[1] - ax_point_2[1])

    # -- Add column names
    column_names = columns
    for index, c in enumerate(column_names):
        if index == 0:
            ha = 'left'
        else:
            ha = 'center'
        ax.annotate(
            xy=(positions[index], nrows + .25),
            text=column_names[index],
            ha=ha,
            va='bottom',
            weight='bold'
        )

    # Add dividing lines
    ax.plot([ax.get_xlim()[0], ax.get_xlim()[1]], [nrows, nrows], lw=1.5, color='black', marker='', zorder=4)
    ax.plot([ax.get_xlim()[0], ax.get_xlim()[1]], [0, 0], lw=1.5, color='black', marker='', zorder=4)
    for x in range(1, nrows):
        ax.plot([ax.get_xlim()[0], ax.get_xlim()[1]], [x, x], lw=1.15, color='gray', ls=':', zorder=3, marker='')

    ax.fill_between(
        x=[0, 2],
        y1=nrows,
        y2=0,
        color='lightgrey',
        alpha=0.5,
        ec='None'
    )

    ax.set_axis_off()

    # -- Final details
    logo_ax = fig.add_axes(
        [0.825, 0.89, .05, .05]
    )
    club_icon = await download_image(logo)
    logo_ax.imshow(Image.open(club_icon))
    logo_ax.axis('off')
    fig.text(
        x=0.15, y=.90,
        s=title,
        ha='left',
        va='bottom',
        weight='bold',
        size=12
    )
    temp = io.BytesIO()
    # plt.imshow(img,  aspect="auto")
    background_ax = plt.axes([.10, .08, .85, .87])  # create a dummy subplot for the background
    background_ax.set_zorder(-1)  # set the background subplot behind the others
    background_ax.axis("off")
    background_ax.imshow(img, aspect='auto')  # show the backgroud image
    fig.savefig(
        temp,
        dpi=200,
        transparent=True,
        bbox_inches='tight'
    )
    plt.close(fig)
    temp.seek(0)
    await upload_to_cdn(picture=temp, title=title)
    title = title.replace(" ", "_").lower()
    return {"link" : f"https://cdn.clashking.xyz/{title}.png"}



@router.get("/guild_links/{guild_id}",
         name="Get clans that are linked to a discord guild",
         include_in_schema=False)
@cache(expire=300)
async def guild_links(guild_id: int, request: Request, response: Response):
    return {}






@router.get("/shortner",
         name="Create a short link", include_in_schema=False)
async def shortner(url: str):
    id = str(uuid.uuid4())
    await db_client.link_shortner.insert_one({"_id" : id, "url" : url})
    return {"url" : f"https://api.clashk.ing/shortlink?id={id}"}


@router.get("/shortlink",
            response_class=RedirectResponse,
            name="Create a short link", include_in_schema=False)
async def shortlink(id: str):
    result = await db_client.link_shortner.find_one({"_id" : id})
    return result.get("url")



@router.get("/renderhtml",
         name="Render links to HTML as a page",
         include_in_schema=False)
async def render(url: str):
    async def fetch(u, session):
        async with session.get(u) as response:
            image_data = await response.read()
            return image_data

    async with aiohttp.ClientSession() as session:
        response = await fetch(str(url), session)
        await session.close()
    return HTMLResponse(content=response, status_code=200)


@router.post("/discord_links",
         name="Get discord links for tags",
         include_in_schema=False)
async def discord_link(player_tags: List[str], request: Request, response: Response):
    global link_client
    result = await link_client.get_links(*player_tags)
    return dict(result)






