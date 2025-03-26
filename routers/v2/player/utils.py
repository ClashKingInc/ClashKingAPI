import pendulum


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
                day_data["total_attacks"] = len(new_attacks)
                day_data["total_defenses"] = len(new_defenses)

        else:
            attacks = day_data.get("attacks", [])
            defenses = day_data.get("defenses", [])
            num_attacks = day_data.get("num_attacks", len(attacks))
            num_defenses = len(defenses)

            trophies_gained = sum(attacks)
            trophies_lost = sum(defenses)
            trophies_total = trophies_gained + trophies_lost

            day_data["trophies_gained_total"] = trophies_gained
            day_data["trophies_lost_total"] = trophies_lost
            day_data["trophies_total"] = trophies_total
            day_data["total_attacks"] = num_attacks
            day_data["total_defenses"] = num_defenses

        # Final aggregation for the season
        gained = day_data.get("trophies_gained_total", 0)
        lost = day_data.get("trophies_lost_total", 0)
        attacks = day_data.get("total_attacks", 0)
        defenses = day_data.get("total_defenses", 0)
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
            season["season_trophies_lost_ratio"] = round(season["season_trophies_lost_total"] / season["season_total_gained_lost_possible"],
                                                  2)

        if season["season_total_attacks_defenses_possible"] > 0:
            season["season_total_attacks_ratio"] = round(season["season_total_attacks"] / season["season_total_attacks_defenses_possible"],
                                                  2)
            season["season_total_defenses_ratio"] = round(season["season_total_defenses"] / season["season_total_attacks_defenses_possible"],
                                                   2)

        # Final averages
    for season in grouped.values():
        if season["season_total_attacks"] > 0:
            season["season_average_trophies_gained_per_attack"] = round(
                season["season_trophies_gained_total"] / season["season_total_attacks"], 2)
        if season["season_total_defenses"] > 0:
            season["season_average_trophies_lost_per_defense"] = round(
                season["season_trophies_lost_total"] / season["season_total_defenses"], 2)

    return grouped
