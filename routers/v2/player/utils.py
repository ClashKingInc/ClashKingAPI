import pendulum


def get_legend_season_range(date: pendulum.DateTime) -> tuple[str, str]:
    """Return the start and end of the Legend League season (YYYY-MM-DD) for a given date."""

    # Step 1: Get last Monday of previous month
    previous_month = date.subtract(months=1).end_of('month')
    while previous_month.day_of_week != pendulum.MONDAY:
        previous_month = previous_month.subtract(days=1)
    season_start = previous_month

    # Step 2: Get last Monday of current month
    current_month = date.end_of('month')
    while current_month.day_of_week != pendulum.MONDAY:
        current_month = current_month.subtract(days=1)
    season_end = current_month.subtract(days=1)  # The Sunday before the last Monday

    return season_start.to_date_string(), season_end.to_date_string()


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

        season_key = season_start

        if season_key not in grouped:
            grouped[season_key] = {
                "season_start": season_start,
                "season_end": season_end,
                "trophies_gained_total": 0,
                "trophies_lost_total": 0,
                "trophies_net": 0,
                "total_attacks": 0,
                "total_defenses": 0,
                "average_trophies_gained_per_attack": 0,
                "average_trophies_lost_per_defense": 0,
                "total_attacks_defenses_possible": 0,
                "total_gained_lost_possible": 0,
                "trophies_gained_ratio": 0,
                "trophies_lost_ratio": 0,
                "total_attacks_ratio": 0,
                "total_defenses_ratio": 0,
                "days": {}
            }

        season = grouped[season_key]

        # Daily stats
        gained = day_data.get("trophies_gained_total", 0)
        lost = day_data.get("trophies_lost_total", 0)
        total = day_data.get("trophies_total", 0)
        attacks = day_data.get("total_attacks", 0)
        defenses = day_data.get("total_defenses", 0)

        # Add daily data to season
        season["days"][day_str] = day_data

        # Sum up cumulative stats
        season["trophies_gained_total"] += gained
        season["trophies_lost_total"] += lost
        season["trophies_net"] += (gained - lost)
        season["total_attacks"] += attacks
        season["total_defenses"] += defenses
        season["total_attacks_defenses_possible"] = len(season["days"]) * 8
        season["total_gained_lost_possible"] = season["total_attacks_defenses_possible"] * 40
        season["trophies_gained_ratio"] = round(season["trophies_gained_total"] / season["total_gained_lost_possible"], 2)
        season["trophies_lost_ratio"] = round(season["trophies_lost_total"] / season["total_gained_lost_possible"], 2)
        season["total_attacks_ratio"] = round(season["total_attacks"] / season["total_attacks_defenses_possible"], 2)
        season["total_defenses_ratio"] = round(season["total_defenses"] / season["total_attacks_defenses_possible"], 2)

    # Calculate averages
    for season in grouped.values():
        if season["total_attacks"] > 0:
            season["average_trophies_gained_per_attack"] = round(
                season["trophies_gained_total"] / season["total_attacks"], 2)
        if season["total_defenses"] > 0:
            season["average_trophies_lost_per_defense"] = round(
                season["trophies_lost_total"] / season["total_defenses"], 2)

    return grouped
