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
                "season_stars_distribution_attacks": {0: 0, 1: 0, 2: 0, 3: 0},
                "season_stars_distribution_defenses": {0: 0, 1: 0, 2: 0, 3: 0},
                "season_stars_distribution_attacks_percentages": {},
                "season_stars_distribution_defenses_percentages": {},
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

        gained = day_data.get("trophies_gained_total", 0)
        lost = day_data.get("trophies_lost_total", 0)
        attacks = count_number_of_attacks_from_list(day_data.get("attacks", []))
        defenses = count_number_of_attacks_from_list(day_data.get("defenses", []))
        end_trophies = day_data.get("end_trophies", 0)
        season["season_end_trophies"] = end_trophies

        season["days"][day_str] = day_data

        season["season_trophies_gained_total"] += gained
        season["season_trophies_lost_total"] += lost
        season["season_trophies_net"] += (gained - lost)
        season["season_total_attacks"] += attacks
        season["season_total_defenses"] += defenses

        num_attacks = day_data.get("num_attacks", 0)
        attack_distribution = determine_star_distribution(day_data.get("attacks", []), num_attacks)
        for star, count in attack_distribution.items():
            season["season_stars_distribution_attacks"][star] += count

        num_defenses = day_data.get("num_defenses", 0)
        defense_distribution = determine_star_distribution(day_data.get("defenses", []), num_defenses)
        for star, count in defense_distribution.items():
            season["season_stars_distribution_defenses"][star] += count

        total_possible = len(season["days"]) * 8
        season["season_total_attacks_defenses_possible"] = total_possible
        season["season_total_gained_lost_possible"] = total_possible * 40

        if season["season_total_gained_lost_possible"] > 0:
            season["season_trophies_gained_ratio"] = round(
                season["season_trophies_gained_total"] / season["season_total_gained_lost_possible"], 2)
            season["season_trophies_lost_ratio"] = round(
                season["season_trophies_lost_total"] / season["season_total_gained_lost_possible"], 2)

        if season["season_total_attacks_defenses_possible"] > 0:
            season["season_total_attacks_ratio"] = round(
                season["season_total_attacks"] / season["season_total_attacks_defenses_possible"], 2)
            season["season_total_defenses_ratio"] = round(
                season["season_total_defenses"] / season["season_total_attacks_defenses_possible"], 2)

    for season in grouped.values():
        total_attacks = season.get("season_total_attacks", 0)
        total_defenses = season.get("season_total_defenses", 0)

        if total_attacks > 0:
            season["season_stars_distribution_attacks_percentages"] = {
                str(i): round(season["season_stars_distribution_attacks"].get(i, 0) / total_attacks * 100, 1)
                for i in range(4)
            }

        if total_defenses > 0:
            season["season_stars_distribution_defenses_percentages"] = {
                str(i): round(season["season_stars_distribution_defenses"].get(i, 0) / total_defenses * 100, 1)
                for i in range(4)
            }

        if total_attacks > 0:
            season["season_average_trophies_gained_per_attack"] = round(
                season["season_trophies_gained_total"] / total_attacks, 2
            )

        if total_defenses > 0:
            season["season_average_trophies_lost_per_defense"] = round(
                season["season_trophies_lost_total"] / total_defenses, 2
            )

        season["season_days_in_legend"] = len(season["days"])
        try:
            start = pendulum.parse(season["season_start"])
            end = pendulum.parse(season["season_end"])
            season["season_duration"] = (end - start).days + 1
        except Exception:
            season["season_duration"] = 0

    return grouped


def determine_star_distribution(trophies_list: list[int], expected_count: int) -> dict[int, int]:
    distribution = {0: 0, 1: 0, 2: 0, 3: 0}

    for trophies in trophies_list:
        if trophies == 320:
            distribution[3] += 8
        elif 280 < trophies < 320:
            distribution[2] += 8
        elif trophies == 280:
            distribution[3] += 7
        elif 240 < trophies < 280:
            distribution[2] += 7
        elif trophies == 240:
            distribution[3] += 6
        elif 200 < trophies < 240:
            distribution[2] += 6
        elif trophies == 200:
            distribution[3] += 5
        elif 160 < trophies < 200:
            distribution[2] += 5
        elif trophies == 160:
            distribution[3] += 4
        elif 120 < trophies < 160:
            distribution[2] += 4
        elif trophies == 120:
            distribution[3] += 3
        elif 80 < trophies < 120:
            distribution[2] += 3
        elif trophies == 80:
            distribution[3] += 2
        elif 40 < trophies < 80:
            distribution[2] += 2
        elif trophies == 40:
            distribution[3] += 1
        elif 5 <= trophies <= 15:
            distribution[1] += 1
        elif trophies <= 4:
            distribution[0] += 1
        else:
            distribution[2] += 1  # fallback

    # Normalize the distribution
    total = sum(distribution.values())
    if total > expected_count:
        surplus = total - expected_count
        # Remove stars from 3 to 0
        for star in [2, 1, 3, 0]:
            removed = min(surplus, distribution[star])
            distribution[star] -= removed
            surplus -= removed
            if surplus == 0:
                break

    return distribution


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


def get_star_distribution(trophies_list: list[int]) -> tuple[dict[int, int], int]:
    distribution = {0: 0, 1: 0, 2: 0, 3: 0}
    total_attacks = 0
    for trophies in trophies_list:
        stars = trophies_to_stars_stacked(trophies)
        for star, count in stars.items():
            distribution[star] += count
            total_attacks += count
    return distribution, total_attacks


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
