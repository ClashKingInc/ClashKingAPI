from collections import defaultdict

import coc
from fastapi import HTTPException

import pendulum

from routers.v2.player.models import PlayerWarhitsFilter
from utils.database import MongoClient as mongo
from utils.time import is_raids

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


from typing import Union, List, Optional


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

        gained = day_data.get("trophies_gained_total", 0)
        lost = day_data.get("trophies_lost_total", 0)
        attacks = day_data.get("num_attacks", 0)
        defenses = day_data.get("num_defenses", 0)
        end_trophies = day_data.get("end_trophies", 0)
        season["season_end_trophies"] = end_trophies

        season["days"][day_str] = day_data

        season["season_trophies_gained_total"] += gained
        season["season_trophies_lost_total"] += lost
        season["season_trophies_net"] += (gained - lost)
        season["season_total_attacks"] += attacks
        season["season_total_defenses"] += defenses

        for trophies in day_data.get("attacks", []):
            if 5 <= trophies <= 15:
                season["season_stars_distribution_attacks"][1] += 1
            elif 16 <= trophies <= 32:
                season["season_stars_distribution_attacks"][2] += 1
            elif trophies == 40:
                season["season_stars_distribution_attacks"][3] += 1
            else:
                season["season_stars_distribution_attacks"][2] += 1

        for trophies in day_data.get("defenses", []):
            if 0 <= trophies <= 4:
                season["season_stars_distribution_defenses"][0] += 1
            elif 5 <= trophies <= 15:
                season["season_stars_distribution_defenses"][1] += 1
            elif 16 <= trophies <= 32:
                season["season_stars_distribution_defenses"][2] += 1
            elif trophies == 40:
                season["season_stars_distribution_defenses"][3] += 1
            else:
                season["season_stars_distribution_defenses"][2] += 1

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


async def fetch_player_api_data(session, tag: str):
    url = f"https://proxy.clashk.ing/v1/players/{tag.replace('#', '%23')}"
    async with session.get(url) as response:
        if response.status == 200:
            return await response.json()
    return None


async def fetch_raid_data(session, tag: str, player_clan_tag: str):
    raid_data = {}
    if player_clan_tag:
        url = f"https://proxy.clashk.ing/v1/clans/{player_clan_tag.replace('#', '%23')}/capitalraidseasons?limit=1"
        async with session.get(url) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("items"):
                    raid_weekend_entry = coc.RaidLogEntry(data=data["items"][0], client=None, clan_tag=player_clan_tag)
                    if raid_weekend_entry.end_time.seconds_until >= 0:
                        raid_member = raid_weekend_entry.get_member(tag=tag)
                        if raid_member:
                            raid_data = {
                                "attacks_done": raid_member.attack_count,
                                "attack_limit": raid_member.attack_limit + raid_member.bonus_attack_limit,
                            }
    return raid_data


async def fetch_full_player_data(session, tag: str, mongo_data: dict, clan_tag: Optional[str]):
    raid_data = await fetch_raid_data(session, tag, clan_tag) if is_raids() else {}
    war_data = await mongo.war_timers.find_one({"_id": tag}, {"_id": 0}) or {}
    return tag, raid_data, war_data, mongo_data


async def assemble_full_player_data(tag, raid_data, war_data, mongo_data, legends_data):
    player_data = mongo_data or {}

    # Add legends data
    player_data["legends_by_season"] = legends_data.get(tag, {})
    player_data.pop("legends", None)

    # Add additional stats
    player_data["legend_eos_ranking"] = await get_legend_rankings_for_tag(tag)
    player_data["rankings"] = await get_current_rankings(tag)
    player_data["raid_data"] = raid_data
    player_data["war_data"] = war_data

    return player_data


def compute_warhit_stats(
        attacks: List[dict],
        defenses: List[dict],
        filter: PlayerWarhitsFilter,
        missed_attacks: int = 0,
        missed_defenses: int = 0,
        num_wars: int = 0,
):
    from collections import defaultdict


    def filter_hit(hit, is_attack=True):
        th_key = "defender" if is_attack else "attacker"

        if filter.min_stars is not None and hit["stars"] < filter.min_stars:
            return False
        if filter.max_stars is not None and hit["stars"] > filter.max_stars:
            return False
        if filter.min_destruction is not None and hit["destructionPercentage"] < filter.min_destruction:
            return False
        if filter.max_destruction is not None and hit["destructionPercentage"] > filter.max_destruction:
            return False
        if filter.enemy_th is not None and hit[th_key].get("townhallLevel") != filter.enemy_th:
            return False
        if filter.map_position_min is not None and hit[th_key].get("mapPosition") < filter.map_position_min:
            return False
        if filter.map_position_max is not None and hit[th_key].get("mapPosition") > filter.map_position_max:
            return False
        if filter.own_th is not None and hit["attacker"].get("townhallLevel") != filter.own_th:
            return False
        return True

    filtered_attacks = [a for a in attacks if filter_hit(a, is_attack=True)]
    filtered_defenses = [d for d in defenses if filter_hit(d, is_attack=False)]

    def average(key, lst):
        return round(sum(hit[key] for hit in lst) / len(lst), 2) if lst else 0.0

    def count_stars(lst):
        star_count = defaultdict(int)
        for hit in lst:
            star_count[hit["stars"]] += 1
        return {str(k): star_count[k] for k in range(4)}

    def group_by_enemy_th(lst, is_attack=True):
        th_key = "defender" if is_attack else "attacker"
        grouped = defaultdict(list)
        for hit in lst:
            enemy_th_level = hit[th_key]["townhallLevel"]
            grouped[enemy_th_level].append(hit)

        result = {}
        for th, hits in grouped.items():
            result[str(th)] = {
                "averageStars": average("stars", hits),
                "averageDestruction": average("destructionPercentage", hits),
                "count": len(hits),
                "starsCount": count_stars(hits),
            }
        return result

    return {
        "warsCounts": num_wars,
        "totalAttacks": len(filtered_attacks),
        "totalDefenses": len(filtered_defenses),
        "missedAttacks": missed_attacks,
        "missedDefenses": missed_defenses,
        "starsCount": count_stars(filtered_attacks),
        "starsCountDef": count_stars(filtered_defenses),
        "byEnemyTownhall": group_by_enemy_th(filtered_attacks, is_attack=True),
        "byEnemyTownhallDef": group_by_enemy_th(filtered_defenses, is_attack=False),
    }


def group_attacks_by_type(attacks, defenses, wars):
    grouped = {
        "all": {"attacks": [], "defenses": [], "missedAttacks": 0, "missedDefenses": 0, "warsCounts": 0},
        "random": {"attacks": [], "defenses": [], "missedAttacks": 0, "missedDefenses": 0, "warsCounts": 0},
        "cwl": {"attacks": [], "defenses": [], "missedAttacks": 0, "missedDefenses": 0, "warsCounts": 0},
        "friendly": {"attacks": [], "defenses": [], "missedAttacks": 0, "missedDefenses": 0, "warsCounts": 0},
    }

    for war in wars:
        war_type = war.get("war_data", {}).get("type", "all").lower()
        missed_attacks = war.get("missedAttacks", 0)
        missed_defenses = war.get("missedDefenses", 0)

        grouped["all"]["missedAttacks"] += missed_attacks
        grouped["all"]["missedDefenses"] += missed_defenses
        grouped["all"]["warsCounts"] += 1

        if war_type in grouped:
            grouped[war_type]["missedAttacks"] += missed_attacks
            grouped[war_type]["missedDefenses"] += missed_defenses
            grouped[war_type]["warsCounts"] += 1

    for atk in attacks:
        war_type = atk.get("war_type", "all").lower()
        grouped["all"]["attacks"].append(atk)
        if war_type in grouped:
            grouped[war_type]["attacks"].append(atk)

    for dfn in defenses:
        war_type = dfn.get("war_type", "all").lower()
        grouped["all"]["defenses"].append(dfn)
        if war_type in grouped:
            grouped[war_type]["defenses"].append(dfn)

    return grouped