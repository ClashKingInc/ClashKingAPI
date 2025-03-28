from fastapi import HTTPException

import pendulum
from utils.database import MongoClient as mongo

from utils.utils import fix_tag


def get_legend_season_range(date: pendulum.DateTime) -> tuple[pendulum.DateTime, pendulum.DateTime]:
    """Return the start and end of the Legend League season (Monday 5am UTC to Monday 5am UTC) for a given date."""

    # Find the last Monday of the month at 5am UTC
    last_monday_this_month = date.end_of("month")
    while last_monday_this_month.day_of_week != pendulum.MONDAY:
        last_monday_this_month = last_monday_this_month.subtract(days=1)
    season_start = last_monday_this_month.replace(hour=0, minute=0, second=0, microsecond=0)

    # If the date is before the last Monday of the month, it's part of the previous season
    if date < season_start:
        last_monday_previous_month = date.subtract(months=1).end_of("month")
        while last_monday_previous_month.day_of_week != pendulum.MONDAY:
            last_monday_previous_month = last_monday_previous_month.subtract(days=1)
        season_start = last_monday_previous_month.replace(hour=0, minute=0, second=0, microsecond=0)

    # If the date is after the last Monday of the month, it's part of the next season
    last_monday_next_month = season_start.add(months=1).end_of("month")
    while last_monday_next_month.day_of_week != pendulum.MONDAY:
        last_monday_next_month = last_monday_next_month.subtract(days=1)
    season_end = last_monday_next_month.replace(hour=0, minute=0, second=0, microsecond=0).subtract(seconds=1)

    return season_start, season_end


from typing import Union, List


async def get_legend_stats_common(player_tags: Union[str, List[str]]) -> Union[dict, List[dict]]:
    """Returns enriched legend stats for a single tag or list of tags."""
    if isinstance(player_tags, str):
        fixed_tag = fix_tag(player_tags)
        player = await mongo.player_stats.find_one(
            {'tag': fixed_tag},
            {'_id': 0, 'tag': 1, 'legends': 1}
        )
        if not player:
            raise HTTPException(status_code=404, detail=f"Player {fixed_tag} not found")
        grouped_legends = await process_legend_stats(player.get("legends", {}))
        return {
            "tag": fixed_tag,
            "legends_by_season": grouped_legends
        }

    fixed_tags = [fix_tag(tag) for tag in player_tags]
    players_info = await mongo.player_stats.find(
        {'tag': {'$in': fixed_tags}},
        {'_id': 0, 'tag': 1, 'legends': 1}
    ).to_list(length=None)

    return [
        {
            "tag": player["tag"],
            "legends_by_season": await process_legend_stats(player.get("legends", {}))
        } for player in players_info
    ]


def group_legends_by_season(legends: dict) -> dict:
    """Group daily legends data into seasons with cumulative stats."""
    grouped = {}

    for day_str, day_data in legends.items():
        if not isinstance(day_data, dict):
            continue  # Skip non-date keys like "streak"

        try:
            day = pendulum.parse(day_str)
            season_start, season_end = get_legend_season_range(day)
        except Exception:
            continue

        if day.to_date_string() == "2024-08-26":
            print(season_start, season_end)

        season_key = season_start.to_date_string()

        if season_key not in grouped:
            grouped[season_key] = {
                "season_start": season_start.to_date_string(),
                "season_end": season_end.to_date_string(),
                "season_duration": 0,
                "season_days_in_legend": 0,
                "season_end_trophies": 0,
                "season_trophies_gained_total": 0,
                "season_trophies_lost_total": 0,
                "season_trophies_net": 0,
                "season_total_attacks": 0,
                "season_total_defenses": 0,
                "season_average_trophies_gained_per_attack": 0,
                "season_average_trophies_lost_per_defense": 0,
                "season_total_attacks_defenses_possible": 0,
                "season_total_gained_lost_possible": 0,
                "season_trophies_gained_ratio": 0,
                "season_trophies_lost_ratio": 0,
                "season_total_attacks_ratio": 0,
                "season_total_defenses_ratio": 0,
                "days": {}
            }

        season = grouped[season_key]

        # Detect format type
        is_new_format = "new_attacks" in day_data or "new_defenses" in day_data

        if is_new_format:
            new_attacks = day_data.get("new_attacks", [])
            new_defenses = day_data.get("new_defenses", [])
            all_events = sorted(new_attacks + new_defenses, key=lambda x: x.get("time", 0))

            if all_events and "trophies" in all_events[-1]:
                end_trophies = all_events[-1]["trophies"]
                trophies_gained = sum(e.get("change", 0) for e in new_attacks)
                trophies_lost = sum(e.get("change", 0) for e in new_defenses)
                trophies_total = trophies_gained - trophies_lost
                start_trophies = all_events[0]["trophies"]

                day_data["start_trophies"] = start_trophies
                day_data["end_trophies"] = end_trophies
                day_data["trophies_gained_total"] = trophies_gained
                day_data["trophies_lost_total"] = trophies_lost
                day_data["trophies_total"] = trophies_total

        else:
            attacks = day_data.get("attacks", [])
            defenses = day_data.get("defenses", [])

            trophies_gained = sum(attacks)
            trophies_lost = sum(defenses)
            trophies_total = trophies_gained + trophies_lost

            day_data["trophies_gained_total"] = trophies_gained
            day_data["trophies_lost_total"] = trophies_lost
            day_data["trophies_total"] = trophies_total

        # Final aggregation for the season
        gained = day_data.get("trophies_gained_total", 0)
        lost = day_data.get("trophies_lost_total", 0)
        attacks = day_data.get("num_attacks", 0)
        defenses = count_number_of_attacks_from_list(day_data.get("defenses", []))
        end_trophies = day_data.get("end_trophies", 0)
        season["season_end_trophies"] = end_trophies

        season["days"][day_str] = day_data

        season["season_trophies_gained_total"] += gained
        season["season_trophies_lost_total"] += lost
        season["season_trophies_net"] += (gained - lost)
        season["season_total_attacks"] += attacks
        season["season_total_defenses"] += defenses

        # Update theoretical max stats
        total_possible = len(season["days"]) * 8
        season["season_total_attacks_defenses_possible"] = total_possible
        season["season_total_gained_lost_possible"] = total_possible * 40

        # Compute ratios (rounded to 2 decimals)
        if season["season_total_gained_lost_possible"] > 0:
            season["season_trophies_gained_ratio"] = round(
                season["season_trophies_gained_total"] / season["season_total_gained_lost_possible"], 2)
            season["season_trophies_lost_ratio"] = round(
                season["season_trophies_lost_total"] / season["season_total_gained_lost_possible"],
                2)

        if season["season_total_attacks_defenses_possible"] > 0:
            season["season_total_attacks_ratio"] = round(
                season["season_total_attacks"] / season["season_total_attacks_defenses_possible"],
                2)
            season["season_total_defenses_ratio"] = round(
                season["season_total_defenses"] / season["season_total_attacks_defenses_possible"],
                2)

        # Final averages
    for season in grouped.values():
        if season["season_total_attacks"] > 0:
            season["season_average_trophies_gained_per_attack"] = round(
                season["season_trophies_gained_total"] / season["season_total_attacks"], 2)
        if season["season_total_defenses"] > 0:
            season["season_average_trophies_lost_per_defense"] = round(
                season["season_trophies_lost_total"] / season["season_total_defenses"], 2)

        season["season_days_in_legend"] = len(season["days"])
        try:
            start = pendulum.parse(season["season_start"])
            end = pendulum.parse(season["season_end"])
            season["season_duration"] = (end - start).days + 1
        except Exception:
            season["season_duration"] = 0

    return grouped


def count_number_of_attacks_from_list(attacks: list[int]) -> int:
    """Count the number of attacks from a list of attack trophies."""
    count = 0
    for value in attacks:
        if 280 < value <= 320:
            count += 8
        elif 240 < value <= 280:
            count += 7
        elif 200 < value <= 240:
            count += 6
        elif 160 < value <= 200:
            count += 5
        elif 120 < value <= 160:
            count += 4
        elif 80 < value <= 120:
            count += 3
        elif 40 < value <= 80:
            count += 2
        else:
            count += 1
    return count


async def process_legend_stats(raw_legends: dict) -> dict:
    """Enrich raw legends days and group them by season."""
    for day, data in raw_legends.items():
        if not isinstance(data, dict):
            continue

        new_attacks = data.get("new_attacks", [])
        new_defenses = data.get("new_defenses", [])

        all_events = sorted(new_attacks + new_defenses, key=lambda x: x.get("time", 0))
        if all_events and "trophies" in all_events[-1]:
            end_trophies = all_events[-1]["trophies"]
            trophies_gained = sum(entry.get("change", 0) for entry in new_attacks)
            trophies_lost = sum(entry.get("change", 0) for entry in new_defenses)
            trophies_total = trophies_gained + trophies_lost
            start_trophies = end_trophies - trophies_total

            data["start_trophies"] = start_trophies
            data["end_trophies"] = end_trophies
            data["trophies_gained_total"] = trophies_gained
            data["trophies_lost_total"] = trophies_lost
            data["trophies_total"] = trophies_total
            data["num_defenses"] = count_number_of_attacks_from_list(data.get("defenses", []))

    return group_legends_by_season(raw_legends)


async def get_legend_rankings_for_tag(tag: str, limit: int = 10) -> list[dict]:
    tag = fix_tag(tag)
    results = await mongo.history_db.find({"tag": tag}).sort("season", -1).limit(limit).to_list(length=None)
    for result in results:
        result.pop("_id", None)
    return results


async def get_current_rankings(tag: str) -> dict:
    ranking_data = await mongo.leaderboard_db.find_one({"tag": tag}, projection={"_id": 0})
    if not ranking_data:
        ranking_data = {
            "country_code": None,
            "country_name": None,
            "local_rank": None,
            "global_rank": None
        }
    if ranking_data.get("global_rank") is None:
        fallback = await mongo.legend_rankings.find_one({"tag": tag})
        if fallback:
            ranking_data["global_rank"] = fallback.get("rank")
    return ranking_data
