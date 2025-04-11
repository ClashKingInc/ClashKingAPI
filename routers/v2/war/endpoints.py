import asyncio
import uuid

import aiohttp
from fastapi.responses import JSONResponse
import pendulum as pend
from fastapi import HTTPException
from fastapi import APIRouter, Request
from openpyxl.cell import Cell

from routers.v2.clan.models import ClanTagsRequest
from routers.v2.war.utils import fetch_current_war_info_bypass, fetch_league_info, ranking_create, \
    fetch_war_league_infos, enrich_league_info
from utils.time import is_cwl
from utils.utils import fix_tag, remove_id_fields
from utils.database import MongoClient as mongo

from fastapi.responses import FileResponse
from openpyxl import Workbook
from tempfile import NamedTemporaryFile
import datetime
from openpyxl.styles import Font, Alignment
from openpyxl.worksheet.dimensions import ColumnDimension
from openpyxl.worksheet.table import Table, TableStyleInfo

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

                league_info = await enrich_league_info(league_info, war_league_infos)

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
                    league_info = await enrich_league_info(league_info, war_league_infos)

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
    from openpyxl.worksheet.table import Table, TableStyleInfo

    def format_table(sheet, start_row, end_row, table_name_hint):
        # Generate a unique table name from the hint
        table_name = f"{table_name_hint}_{uuid.uuid4().hex[:8]}"  # max 31 chars

        # Bold + center header
        for cell in sheet[start_row]:
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center")

        # Center all values
        for row in sheet.iter_rows(min_row=start_row + 1, max_row=end_row):
            for cell in row:
                cell.alignment = Alignment(horizontal="center")

        # Adjust width
        for column_cells in sheet.columns:
            first_real_cell = next((cell for cell in column_cells if isinstance(cell, Cell)), None)
            if not first_real_cell:
                continue
            length = max(len(str(cell.value)) if cell.value else 0 for cell in column_cells)
            col_letter = first_real_cell.column_letter
            sheet.column_dimensions[col_letter].width = length + 2

        # Add table (with filters)
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

    # Fetch league_info from the existing war-summary endpoint
    async with aiohttp.ClientSession() as session:
        try:
            response = await session.get(f"http://localhost:8000/v2/war/{tag}/war-summary")
            response.raise_for_status()
            data = await response.json()
            league_info = data.get("league_info")
        except aiohttp.ClientError as e:
            raise HTTPException(status_code=500, detail=f"Error fetching war summary: {str(e)}")

    if not league_info:
        raise HTTPException(status_code=404, detail="No league info available")

    wb = Workbook()
    ws_clan = wb.active
    ws_clan.title = "Clan Summary"
    clan_name = ""

    # Sort clans by rank
    clans = sorted(league_info.get("clans", []), key=lambda c: c.get("rank", 0))

    # Add header row for clans overview
    ws_clan.append([
        "Rank",  # Rank in CWL
        "Name",  # Clan name
        "Tag",  # Clan tag
        "Level",  # Clan level
        "Wars Played",  # Number of wars played
        "Total Stars",  # Total stars
        "Total Destruction %",  # Total destruction % dealt
        "Destruction Taken %",  # Total destruction % received
        "Attack Count",  # Number of attacks performed
        "Missed Attacks"  # Number of missed attacks
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

    # Find our clan and create a separate sheet for its members
    tag = tag.replace("!", "#")

    for clan in clans:
        sheet = wb.create_sheet(title=clan.get("name", "Clan")[:30])

        row = sheet.max_row
        sheet.merge_cells(f"A{row}:P{row}")
        cell = sheet.cell(row=row, column=1)
        cell.value = "⚔️ Attacks"
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")
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
                attacks = member.get("attacks", {}) or {}
                war_participated = attacks.get("missed_attacks", 0) + attacks.get("attack_count", 0)
                attack_count = attacks.get("attack_count", 0)
                stars_total = attacks.get("stars", 0)
                destruction_total = attacks.get("total_destruction", 0)

                three_stars = sum((attacks.get("3_stars") or {}).values())
                two_stars = sum((attacks.get("2_stars") or {}).values())
                one_star = sum((attacks.get("1_star") or {}).values())
                zero_star = sum((attacks.get("0_star") or {}).values())

                sheet.append([
                    member.get("name"),
                    member.get("tag"),
                    member.get("townHallLevel"),
                    war_participated,
                    attack_count,
                    attacks.get("missed_attacks", 0),
                    stars_total,
                    round(stars_total / attack_count if attack_count > 0 else 0, 2),
                    three_stars,
                    two_stars,
                    one_star,
                    zero_star,
                    round((three_stars / attack_count) * 100 if attack_count > 0 else 0, 2),
                    round((zero_star + one_star) * 100 / attack_count if attack_count > 0 else 0, 2),
                    destruction_total,
                    round(destruction_total / attack_count if attack_count > 0 else 0, 2),
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
        # Merge cells A{row} to Q{row} and write "🛡️ Defenses"
        row = sheet.max_row + 2
        sheet.merge_cells(f"A{row}:P{row}")
        cell = sheet.cell(row=row, column=1)
        cell.value = "🛡️ Defenses"
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")
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
                    round(stars_total / defense_count * 100 if defense_count > 0 else 0, 2),
                    three_stars,
                    two_stars,
                    one_star,
                    zero_star,
                    round((three_stars / defense_count) * 100 if defense_count > 0 else 0, 2),
                    round(((zero_star + one_star) * 100 / defense_count) if defense_count > 0 else 0, 2),
                    destruction_total,
                    round(destruction_total / defense_count if defense_count > 0 else 0, 2),
                    member.get("avgOpponentPosition"),
                    member.get("avgMapPosition"),
                    member.get("avgDefenseOrder"),
                    member.get("avgAttackerTownHallLevel"),
                    member.get("defenseLowerTHLevel"),
                    member.get("defenseUpperTHLevel"),
                ])

        defense_end_row = sheet.max_row
        format_table(sheet, defense_start_row, defense_end_row, "DefensesTable")

    # Save the Excel file to a temporary location
    tmp = NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(tmp.name)
    tmp.seek(0)

    clan_name = next((c for c in clans if c.get("tag") == tag), None).get("name")
    season = league_info.get("season")
    filename = f"cwl_summary_{clan_name}_{season}.xlsx"
    return FileResponse(
        path=tmp.name,
        filename=filename,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
