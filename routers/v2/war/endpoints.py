import asyncio
import json
import tempfile
import uuid
import coc
import sentry_sdk

import aiohttp
from fastapi.responses import JSONResponse
import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Request
from openpyxl.cell import Cell

from routers.v2.clan.models import ClanTagsRequest
from routers.v2.war.models import PlayerWarhitsFilter, ClanWarHitsFilter
from routers.v2.war.utils import fetch_current_war_info_bypass, fetch_league_info, ranking_create, \
    fetch_war_league_infos, enrich_league_info, collect_player_hits_from_wars
from utils.time import is_cwl
from utils.utils import fix_tag, remove_id_fields
from utils.database import MongoClient as mongo

from fastapi.responses import FileResponse
from openpyxl import Workbook
from tempfile import NamedTemporaryFile
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.drawing.image import Image as OpenpyxlImage

router = APIRouter(prefix="/v2", tags=["War"], include_in_schema=True)


@router.get("/war/{clan_tag}/previous",
            name="Previous Wars for a clan")
async def war_previous(
        clan_tag: str,
        request: Request = Request,
        timestamp_start: int = 0,
        timestamp_end: int = 9999999999,
        include_cwl: bool = False,
        limit: int = 50,
):
    clan_tag = fix_tag(clan_tag)
    START = pend.from_timestamp(timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    query = {
        "$and": [
            {"$or": [{"data.clan.tag": clan_tag}, {"data.opponent.tag": clan_tag}]},
            {"data.preparationStartTime": {"$gte": START}},
            {"data.preparationStartTime": {"$lte": END}}
        ]
    }

    if not include_cwl:
        query["$and"].append({"data.season": None})

    full_wars = await mongo.clan_wars.find(query).sort("data.endTime", -1).limit(limit).to_list(length=None)

    # early on we had some duplicate wars, so just filter them out
    found_ids = set()
    new_wars = []
    for war in full_wars:
        id = war.get("data").get("preparationStartTime")
        if id in found_ids:
            continue
        war.pop("_response_retry", None)
        new_wars.append(war.get("data"))
        found_ids.add(id)

    return remove_id_fields({"items": new_wars})


@router.get("/cwl/{clan_tag}/ranking-history", name="CWL ranking history for a clan")
async def cwl_ranking_history(clan_tag: str, request: Request):
    clan_tag = fix_tag(clan_tag)

    # Fetch all CWL group documents containing the clan
    results = await mongo.cwl_groups.find({"data.clans.tag": clan_tag}, {"data.clans": 0}).to_list(length=None)
    if not results:
        raise HTTPException(status_code=404, detail="No CWL Data Found")

    # Get league changes for the clan
    clan_data = await mongo.basic_clan.find_one({"tag": clan_tag}, {"changes.clanWarLeague": 1})
    cwl_changes = clan_data.get("changes", {}).get("clanWarLeague", {})

    # Collect all war tags across all CWL results (across all seasons)
    all_war_tags = set()
    for cwl_result in results:
        rounds = cwl_result["data"].get("rounds", [])
        for rnd in rounds:
            for tag in rnd.get("warTags", []):
                if tag:
                    all_war_tags.add(tag)

    # Fetch all war documents in one go using the union of war tags
    if all_war_tags:
        matching_wars_data = await mongo.clan_wars.find({
            "data.tag": {"$in": list(all_war_tags)}
        },
            {"data.clan.members": 0, "data.opponent.members": 0}
        ).to_list(length=None)
        # Build a lookup dictionary keyed by war tag
        war_lookup = {w["data"]["tag"]: w["data"] for w in matching_wars_data}
    else:
        war_lookup = {}

    ranking_results = []
    for cwl_result in results:
        season = cwl_result["data"].get("season")
        rounds = cwl_result["data"].get("rounds", [])

        # Replace each war tag with the corresponding war data,
        # but only include wars that match the current season.
        for rnd in rounds:
            rnd["warTags"] = [
                war_lookup.get(tag)
                for tag in rnd.get("warTags", [])
                if war_lookup.get(tag) and war_lookup.get(tag).get("season") == season
            ]

        cwl_data = cwl_result["data"]
        cwl_data["rounds"] = rounds
        ranking = ranking_create(data=cwl_data)

        # Get the ranking for our clan tag along with its index (place)
        ranking_data = next(
            (
                {'rank': idx, **item}
                for idx, item in enumerate(ranking, start=1)
                if item["tag"] == clan_tag
            ),
            None
        )
        if ranking_data is None:
            continue

        # Calculate season offset and check league changes
        season_offset = pend.date(
            year=int(season[:4]),
            month=int(season[-2:]),
            day=1
        ).subtract(months=1).strftime('%Y-%m')
        if season_offset not in cwl_changes:
            continue

        league = cwl_changes[season_offset].get("league")
        ranking_results.append({"season": season, "league": league, **ranking_data})

    return {"items": sorted(ranking_results, key=lambda x: x["season"], reverse=True)}


@router.get("/cwl/league-thresholds", name="Promo and demotion thresholds for CWL leagues")
async def cwl_league_thresholds(request: Request):
    return {
        "items": [
            {
                "id": 48000001,
                "name": "Bronze League III",
                "promo": 3,
                "demote": 9
            },
            {
                "id": 48000002,
                "name": "Bronze League II",
                "promo": 3,
                "demote": 8
            },
            {
                "id": 48000003,
                "name": "Bronze League I",
                "promo": 3,
                "demote": 8
            },
            {
                "id": 48000004,
                "name": "Silver League III",
                "promo": 2,
                "demote": 8
            },
            {
                "id": 48000005,
                "name": "Silver League II",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000006,
                "name": "Silver League I",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000007,
                "name": "Gold League III",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000008,
                "name": "Gold League II",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000009,
                "name": "Gold League I",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000010,
                "name": "Crystal League III",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000011,
                "name": "Crystal League II",
                "promo": 2,
                "demote": 7
            },
            {
                "id": 48000012,
                "name": "Crystal League I",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000013,
                "name": "Master League III",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000014,
                "name": "Master League II",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000015,
                "name": "Master League I",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000016,
                "name": "Champion League III",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000017,
                "name": "Champion League II",
                "promo": 1,
                "demote": 7
            },
            {
                "id": 48000018,
                "name": "Champion League I",
                "promo": 0,
                "demote": 6
            }
        ]
    }


@router.get(
    "/war/{clan_tag}/war-summary",
    name="Get full war and CWL summary for a clan, including war state, CWL rounds and war details"
)
async def get_clan_war_summary(clan_tag: str):
    async with aiohttp.ClientSession() as session:
        war_info = await fetch_current_war_info_bypass(clan_tag, session)
        league_info = None
        war_league_infos = []

        if is_cwl():
            league_info = await fetch_league_info(clan_tag, session)
            if league_info and "rounds" in league_info:
                for round_entry in league_info["rounds"]:
                    war_tags = round_entry.get("warTags", [])
                    war_league_infos.extend(await fetch_war_league_infos(war_tags, session))

                league_info = await enrich_league_info(league_info, war_league_infos, session)

        return JSONResponse(content={
            "isInWar": war_info["state"] == "war",
            "isInCwl": league_info is not None and war_info["state"] == "notInWar",
            "war_info": war_info,
            "league_info": league_info,
            "war_league_infos": war_league_infos
        })


@router.post("/war/war-summary", name="Get full war and CWL summary for multiple clans")
async def get_multiple_clan_war_summary(body: ClanTagsRequest, request: Request):
    if not body.clan_tags:
        raise HTTPException(status_code=400, detail="clan_tags cannot be empty")

    async with aiohttp.ClientSession() as session:

        async def process_clan(clan_tag: str):
            war_info = await fetch_current_war_info_bypass(clan_tag, session)
            league_info = None
            war_league_infos = []

            if is_cwl():
                league_info = await fetch_league_info(clan_tag, session)
                if league_info and "rounds" in league_info:
                    war_tags = [tag for r in league_info["rounds"] for tag in r.get("warTags", [])]
                    war_league_infos = await fetch_war_league_infos(war_tags, session)
                    league_info = await enrich_league_info(league_info, war_league_infos, session)

            return {
                "clan_tag": clan_tag,
                "isInWar": war_info["state"] == "war",
                "isInCwl": league_info is not None and war_info["state"] == "notInWar",
                "war_info": war_info,
                "league_info": league_info,
                "war_league_infos": war_league_infos
            }

        results = await asyncio.gather(*(process_clan(tag) for tag in body.clan_tags))
        return JSONResponse(content={"items": results})


@router.get("/war/cwl-summary/export", name="Export CWL summary and members stats to Excel")
async def export_cwl_summary_to_excel(tag: str):
    def format_table(sheet, start_row, end_row, table_name_hint):
        table_name = f"{table_name_hint}_{uuid.uuid4().hex[:8]}"[:31]

        thin_border = Border(
            left=Side(style='thin', color="000000"),
            right=Side(style='thin', color="000000"),
            top=Side(style='thin', color="000000"),
            bottom=Side(style='thin', color="000000")
        )

        for cell in sheet[start_row]:
            cell.alignment = Alignment(horizontal="center")
            cell.fill = clashking_theme["header_fill_red"]
            cell.font = clashking_theme["header_font_white"]
            cell.border = thin_border

        for row in sheet.iter_rows(min_row=start_row + 1, max_row=end_row):
            for cell in row:
                cell.alignment = Alignment(horizontal="center")
                cell.fill = clashking_theme["data_fill_white"]
                cell.border = thin_border

        for column_cells in sheet.columns:
            first_real_cell = next((cell for cell in column_cells if isinstance(cell, Cell)), None)
            if not first_real_cell:
                continue
            length = max(len(str(cell.value)) if cell.value else 0 for cell in column_cells)
            col_letter = first_real_cell.column_letter
            sheet.column_dimensions[col_letter].width = length + 2

        last_col_letter = sheet[end_row][len(sheet[end_row]) - 1].column_letter
        table_range = f"A{start_row}:{last_col_letter}{end_row}"
        table = Table(displayName=table_name, ref=table_range)
        style = TableStyleInfo(
            name="TableStyleMedium9",
            showFirstColumn=False,
            showLastColumn=False,
            showRowStripes=True,
            showColumnStripes=False
        )
        table.tableStyleInfo = style
        sheet.add_table(table)

    async def insert_logo_from_cdn(sheet, image_url: str, anchor_cell="A1", height=80):
        # Download the image to a temporary file
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as resp:
                if resp.status != 200:
                    raise Exception(f"Failed to download logo from CDN: {resp.status}")
                image_data = await resp.read()

        # Write image to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_img:
            tmp_img.write(image_data)
            tmp_img_path = tmp_img.name

        # Insert into Excel
        logo = OpenpyxlImage(tmp_img_path)
        logo.height = height
        logo.width = int(height * 3)
        sheet.add_image(logo, anchor_cell)

    clashking_theme = {
        "header_fill_red": PatternFill(start_color="D00000", end_color="D00000", fill_type="solid"),
        "header_fill_black": PatternFill(start_color="000000", end_color="000000", fill_type="solid"),
        "header_font_white": Font(color="FFFFFF", bold=True),
        "data_font_black": Font(color="000000"),
        "title_fill": PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid"),
        "data_fill_white": PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid"),
    }

    summary = await get_clan_war_summary(tag)
    if isinstance(summary, JSONResponse):
        summary = json.loads(summary.body)

    league_info = summary.get("league_info")

    if not league_info:
        raise HTTPException(status_code=404, detail="No league info available")

    wb = Workbook()
    ws_clan = wb.active
    ws_clan.title = "Summary"

    clans = sorted(league_info.get("clans", []), key=lambda c: c.get("rank", 0))

    await insert_logo_from_cdn(
        ws_clan,
        image_url="https://assets.clashk.ing/logos/crown-text-white-bg/BqlEp974170917vB1qK0zunfANJCGi0W031dTksEq7KQ9LoXWMFk0u77unHJa.png",
        anchor_cell="F1",
        height=50
    )

    row = ws_clan.max_row + 3
    ws_clan.merge_cells(f"A{row}:J{row}")
    cell = ws_clan.cell(row=row, column=1)
    cell.value = f"[{league_info.get('season', '')}] 🏆 {league_info.get('war_league', '')}"
    cell.alignment = Alignment(horizontal="center")
    cell.fill = clashking_theme["title_fill"]
    cell.font = Font(bold=True, size=14)

    row = ws_clan.max_row + 1
    ws_clan.merge_cells(f"A{row}:J{row}")
    cell = ws_clan.cell(row=row, column=1)
    cell.value = "CWL Clan Rankings"
    cell.alignment = Alignment(horizontal="center")
    cell.fill = clashking_theme["header_fill_black"]
    cell.font = clashking_theme["header_font_white"]

    ws_clan.append([
        "Rank", "Name", "Tag", "Level", "Wars Played",
        "Total Stars", "Total Destruction %", "Destruction Taken %",
        "Attack Count", "Missed Attacks"
    ])
    start_row = ws_clan.max_row

    for clan in clans:
        ws_clan.append([
            clan.get("rank"),
            clan.get("name"),
            clan.get("tag"),
            clan.get("clanLevel"),
            clan.get("wars_played"),
            clan.get("total_stars"),
            clan.get("total_destruction"),
            clan.get("total_destruction_inflicted"),
            clan.get("attack_count"),
            clan.get("missed_attacks"),
        ])
    end_row = ws_clan.max_row
    format_table(ws_clan, start_row, end_row, "ClanSummary")

    if tag is None:
        sentry_sdk.capture_message("clan tag is None in export_cwl_summary_to_excel", level="error")
        raise HTTPException(status_code=400, detail="clan tag cannot be None")
    tag = tag.replace("!", "#")
    for clan in clans:
        sheet = wb.create_sheet(title=clan.get("name", "Clan")[:30])
        await insert_logo_from_cdn(
            sheet,
            image_url="https://assets.clashk.ing/logos/crown-text-white-bg/BqlEp974170917vB1qK0zunfANJCGi0W031dTksEq7KQ9LoXWMFk0u77unHJa.png",
            anchor_cell="N1",
            height=50
        )

        row = sheet.max_row + 3
        sheet.merge_cells(f"A{row}:V{row}")
        cell = sheet.cell(row=row, column=1)
        cell.value = "⚔️ Attacks"
        cell.alignment = Alignment(horizontal="center")
        cell.fill = clashking_theme["header_fill_black"]
        cell.font = clashking_theme["header_font_white"]

        headers_attack = [
            "Name", "Tag", "TH", "War Participated", "Attacks Done", "Missed",
            "Stars", "Avg Stars", "3 Stars",
            "2 Stars", "1 Star", "0 Star", "3 Stars %", "0-1 Stars %",
            "Total Destruction", "Avg Destruction", "Avg Map Position", "Avg Opponent Map Position",
            "Avg Order", "Avg Opponent TH Level", "Lower TH", "Upper TH"
        ]
        sheet.append(headers_attack)
        attack_start_row = sheet.max_row

        for member in clan.get("members", []):
            if member.get("avgMapPosition"):
                a = member.get("attacks", {}) or {}
                w = a.get("missed_attacks", 0) + a.get("attack_count", 0)
                s = a.get("stars", 0)
                d = a.get("total_destruction", 0)

                sheet.append([
                    member.get("name"),
                    member.get("tag"),
                    member.get("townHallLevel"),
                    w,
                    a.get("attack_count", 0),
                    a.get("missed_attacks", 0),
                    s,
                    round(s / w if w > 0 else 0, 2),
                    sum((a.get("3_stars") or {}).values()),
                    sum((a.get("2_stars") or {}).values()),
                    sum((a.get("1_star") or {}).values()),
                    sum((a.get("0_star") or {}).values()),
                    round((sum((a.get("3_stars") or {}).values()) / w) * 100 if w > 0 else 0, 2),
                    round(((sum((a.get("0_star") or {}).values()) + sum(
                        (a.get("1_star") or {}).values())) * 100 / w) if w > 0 else 0, 2),
                    d,
                    round(d / w if w > 0 else 0, 2),
                    member.get("avgMapPosition"),
                    member.get("avgOpponentPosition"),
                    member.get("avgAttackOrder"),
                    member.get("avgOpponentTownHallLevel"),
                    member.get("attackLowerTHLevel"),
                    member.get("attackUpperTHLevel"),
                ])

        attack_end_row = sheet.max_row
        format_table(sheet, attack_start_row, attack_end_row, "AttacksTable")

        sheet.append([])  # Empty row
        sheet.append([])  # Empty row

        row = sheet.max_row + 2
        sheet.merge_cells(f"A{row}:V{row}")
        cell = sheet.cell(row=row, column=1)
        cell.value = "🛡️ Defenses"
        cell.alignment = Alignment(horizontal="center")
        cell.fill = clashking_theme["header_fill_black"]
        cell.font = clashking_theme["header_font_white"]

        headers_defense = [
            "Name", "Tag", "TH", "War Participated", "Defenses Received", "Missed",
            "Stars Taken", "Avg Stars", "3 Stars",
            "2 Stars", "1 Star", "0 Star", "3 Stars %", "0-1 Stars %",
            "Total Destruction", "Avg Destruction", "Avg Attacker Map Position", "Avg Map Position",
            "Avg Opponent Order",
            "Avg Opponent TH Level", "Lower TH", "Upper TH"
        ]
        sheet.append(headers_defense)
        defense_start_row = sheet.max_row

        for member in clan.get("members", []):
            if member.get("avgMapPosition"):
                attacks = member.get("attacks", {}) or {}
                war_participated = attacks.get("missed_attacks", 0) + attacks.get("attack_count", 0)
                defenses = member.get("defense", {}) or {}
                defense_count = defenses.get("defense_count", 0)
                stars_total = defenses.get("stars", 0)
                destruction_total = defenses.get("total_destruction", 0)
                missed_defenses = defenses.get("missed_defenses", 0)

                three_stars = sum((defenses.get("3_stars") or {}).values())
                two_stars = sum((defenses.get("2_stars") or {}).values())
                one_star = sum((defenses.get("1_star") or {}).values())
                zero_star = sum((defenses.get("0_star") or {}).values())

                sheet.append([
                    member.get("name"),
                    member.get("tag"),
                    member.get("townHallLevel"),
                    war_participated,
                    defense_count,
                    missed_defenses,
                    stars_total,
                    round(stars_total / war_participated * 100 if defense_count > 0 else 0, 2),
                    three_stars,
                    two_stars,
                    one_star,
                    zero_star,
                    round((three_stars / war_participated) * 100 if war_participated > 0 else 0, 2),
                    round(((zero_star + one_star) * 100 / war_participated) if war_participated > 0 else 0, 2),
                    destruction_total,
                    round(destruction_total / war_participated if war_participated > 0 else 0, 2),
                    member.get("avgOpponentPosition"),
                    member.get("avgMapPosition"),
                    member.get("avgDefenseOrder"),
                    member.get("avgAttackerTownHallLevel"),
                    member.get("defenseLowerTHLevel"),
                    member.get("defenseUpperTHLevel"),
                ])

        defense_end_row = sheet.max_row
        format_table(sheet, defense_start_row, defense_end_row, "DefensesTable")

    tmp = NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(tmp.name)
    tmp.seek(0)

    clan_name = next((c for c in clans if c.get("tag") == tag), None).get("name", "clan")
    season = league_info.get("season")
    filename = f"cwl_summary_{clan_name}_{season}.xlsx"
    return FileResponse(
        path=tmp.name,
        filename=filename,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )


@router.post("/war/players/warhits")
async def players_warhits_stats(filter: PlayerWarhitsFilter, request: Request):
    client = coc.Client(raw_attribute=True)
    START = pend.from_timestamp(filter.timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(filter.timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')

    async def fetch_player(tag: str):
        player_tag = fix_tag(tag)
        pipeline = [
            {"$match": {
                "$and": [
                    {"$or": [
                        {"data.clan.members.tag": player_tag},
                        {"data.opponent.members.tag": player_tag}
                    ]},
                    {"data.preparationStartTime": {"$gte": START}},
                    {"data.preparationStartTime": {"$lte": END}}
                ]
            }},
            {"$unset": ["_id"]},
            {"$project": {"data": "$data"}},
            {"$sort": {"data.preparationStartTime": -1}},
            {"$limit": filter.limit or 50},
        ]

        wars_docs = await mongo.clan_wars.aggregate(pipeline, allowDiskUse=True).to_list(length=None)

        result = await collect_player_hits_from_wars(
            wars_docs,
            tags_to_include=[player_tag],
            clan_tags=None,
            filter=filter,
            client=client
        )
        return result["items"]

    player_tasks = [fetch_player(tag) for tag in filter.player_tags]
    results_per_player = await asyncio.gather(*player_tasks)
    results = [item for sublist in results_per_player for item in sublist]  # flatten

    return {"items": results}


@router.post("/war/clans/warhits")
async def clan_warhits_stats(filter: ClanWarHitsFilter):
    client = coc.Client(raw_attribute=True)
    START = pend.from_timestamp(filter.timestamp_start, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    END = pend.from_timestamp(filter.timestamp_end, tz=pend.UTC).strftime('%Y%m%dT%H%M%S.000Z')
    clan_tags = [fix_tag(tag) for tag in filter.clan_tags]

    async def fetch_clan(clan_tag: str):
        pipeline = [
            {"$match": {
                "data.clan.tag": clan_tag,
                "data.preparationStartTime": {"$gte": START, "$lte": END}
            }},
            {"$unset": ["_id"]},
            {"$project": {"data": "$data"}},
            {"$sort": {"data.preparationStartTime": -1}},
            {"$limit": filter.limit or 100},
        ]

        wars_docs = await mongo.clan_wars.aggregate(pipeline, allowDiskUse=True).to_list(length=None)

        results = await collect_player_hits_from_wars(
            wars_docs,
            tags_to_include=None,
            clan_tags=[clan_tag],
            filter=filter,
            client=client,
        )

        return {
            "clan_tag": clan_tag,
            "players": results["items"],
            "wars": results["wars"]
        }

    clan_tasks = [fetch_clan(tag) for tag in clan_tags]
    items = await asyncio.gather(*clan_tasks)

    return {"items": items}
