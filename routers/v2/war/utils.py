import asyncio
from collections import defaultdict
from typing import List
import coc
import requests
from routers.v2.war.models import PlayerWarhitsFilter

semaphore = asyncio.Semaphore(10)

def ranking_create(data: dict):
    # Initialize accumulators
    star_dict = defaultdict(int)
    dest_dict = defaultdict(int)
    tag_to_name = {}
    rounds_won = defaultdict(int)
    rounds_lost = defaultdict(int)
    rounds_tied = defaultdict(int)

    for rnd in data.get("rounds", []):
        for war in rnd.get("warTags", []):
            if war is None:
                continue

            war_obj = coc.ClanWar(data=war, client=None)
            status = str(war_obj.status)
            if status == "won":
                rounds_won[war_obj.clan.tag] += 1
                rounds_lost[war_obj.opponent.tag] += 1
                star_dict[war_obj.clan.tag] += 10
            elif status == "lost":
                rounds_won[war_obj.opponent.tag] += 1
                rounds_lost[war_obj.clan.tag] += 1
                star_dict[war_obj.opponent.tag] += 10
            else:
                rounds_tied[war_obj.clan.tag] += 1
                rounds_tied[war_obj.opponent.tag] += 1

            tag_to_name[war_obj.clan.tag] = war_obj.clan.name
            tag_to_name[war_obj.opponent.tag] = war_obj.opponent.name

            for clan in [war_obj.clan, war_obj.opponent]:
                star_dict[clan.tag] += clan.stars
                dest_dict[clan.tag] += clan.destruction

    # Create a list of stats per clan for sorting
    star_list = []
    for tag, stars in star_dict.items():
        destruction = dest_dict[tag]
        name = tag_to_name.get(tag, "")
        star_list.append([name, tag, stars, destruction])

    # Sort descending by stars then destruction
    sorted_list = sorted(star_list, key=lambda x: (x[2], x[3]), reverse=True)
    return [
        {
            "name": x[0],
            "tag": x[1],
            "stars": x[2],
            "destruction": x[3],
            "rounds": {
                "won": rounds_won.get(x[1], 0),
                "tied": rounds_tied.get(x[1], 0),
                "lost": rounds_lost.get(x[1], 0)
            }
        }
        for x in sorted_list
    ]


async def fetch_current_war_info(clan_tag, bypass=False):
    try:
        tag_encoded = clan_tag.replace("#", "%23")
        url = f"https://proxy.clashk.ing/v1/clans/{tag_encoded}/currentwar"
        res = requests.get(url, timeout=15)

        if res.status_code == 200:
            data = res.json()
            if data.get("state") != "notInWar" and data.get("reason") != "accessDenied":
                return {"state": "war", "currentWarInfo": data, "bypass": bypass}
            elif data.get("state") == "notInWar":
                return {"state": "notInWar"}
        elif res.status_code == 403:
            return {"state": "accessDenied"}
    except Exception as e:
        print(f"Error fetching current war info: {e}")

    return {"state": "notInWar"}


async def fetch_opponent_tag(clan_tag):
    tag_clean = clan_tag.lstrip("#")
    url = f"https://proxy.clashk.ing/v1/war/{tag_clean}/basic"
    res = requests.get(url)

    if res.status_code == 200:
        data = res.json()
        if "clans" in data and isinstance(data["clans"], list):
            for tag in data["clans"]:
                if tag != clan_tag:
                    return tag
    return None


async def fetch_current_war_info_bypass(clan_tag, session):
    war = await fetch_current_war_info(clan_tag)
    if war["state"] == "accessDenied":
        opponent_tag = await fetch_opponent_tag(clan_tag, session)
        if opponent_tag:
            return await fetch_current_war_info(opponent_tag, bypass=True)
    return war


async def fetch_league_info(clan_tag, session):
    try:
        tag_encoded = clan_tag.replace("#", "%23")
        url = f"https://proxy.clashk.ing/v1/clans/{tag_encoded}/currentwar/leaguegroup"
        async with session.get(url, timeout=15) as res:
            if res.status == 200:
                data = await res.json()
                if data.get("state") != "notInWar":
                    return data
    except Exception as e:
        print(f"Error fetching CWL info: {e}")
    return None


async def fetch_war_league_info(war_tag, session):
    war_tag_encoded = war_tag.replace('#', '%23')
    url = f"https://proxy.clashk.ing/v1/clanwarleagues/wars/{war_tag_encoded}"

    for _ in range(3):
        try:
            async with semaphore:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("state") != "notInWar":
                            data["war_tag"] = war_tag
                            return data
                        return None
        except Exception:
            await asyncio.sleep(5)
    return None


async def fetch_war_league_infos(war_tags, session):
    tasks = [
        fetch_war_league_info(tag, session)
        for tag in war_tags
        if tag != "#0"
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if r and not isinstance(r, Exception)]


async def fetch_opponent_tag(clan_tag, session):
    tag_clean = clan_tag.lstrip("#")
    url = f"https://proxy.clashk.ing/v1/war/{tag_clean}/basic"
    try:
        async with session.get(url) as res:
            if res.status == 200:
                data = await res.json()
                if "clans" in data and isinstance(data["clans"], list):
                    for tag in data["clans"]:
                        if tag != clan_tag:
                            return tag
    except Exception:
        pass
    return None


async def init_clan_summary_map(league_info):
    clan_summary_map = {}
    for clan in league_info.get("clans", []):
        tag = clan.get("tag")
        clan_summary_map[tag] = {
            "total_stars": 0,
            "attack_count": 0,
            "missed_attacks": 0,
            "missed_defenses": 0,
            "total_destruction": 0.0,
            "total_destruction_inflicted": 0.0,
            "wars_played": 0,
            "town_hall_levels": {},
            "own_th_level_list_attack": [],
            "opponent_th_level_list_attack": [],
            "own_th_level_list_defense": [],
            "attacker_th_level_list_defense": [],
            "members": defaultdict(lambda: {
                "name": None,
                "map_position": None,
                "avg_opponent_position": None,
                "avg_attack_order": None,
                "stars": 0,
                "3_stars": {},
                "2_stars": {},
                "1_star": {},
                "0_star": {},
                "stars_by_th": {},
                "defense_stars_by_th": {},
                "total_destruction": 0.0,
                "attack_count": 0,
                "missed_attacks": 0,
                "missed_defenses": 0,
                "defense_stars_taken": 0,
                "defense_3_stars": {},
                "defense_2_stars": {},
                "defense_1_star": {},
                "defense_0_star": {},
                "defense_total_destruction": 0.0,
                "defense_count": 0
            })
        }
    return clan_summary_map


async def process_war_stats(war_league_infos, clan_summary_map):
    for war in war_league_infos:
        if war.get("state") not in ["inWar", "warEnded"]:
            continue

        for side in ["clan", "opponent"]:
            clan = war[side]
            tag = clan["tag"]
            if tag not in clan_summary_map:
                continue
            summary = clan_summary_map[tag]

            summary["total_stars"] += clan.get("stars", 0)
            summary["wars_played"] += 1

            avg_pos_map = compute_member_position_stats(war, side, "opponent" if side == "clan" else "clan")

            for member in clan.get("members", []):
                name = member["name"]
                mtag = member.get("tag")
                stats = summary["members"][mtag]
                stats["name"] = name

                # Initialize lists if not present
                if "own_th_level_list_attack" not in stats:
                    stats["own_th_level_list_attack"] = []
                if "opponent_th_level_list_attack" not in stats:
                    stats["opponent_th_level_list_attack"] = []
                if "own_th_level_list_defense" not in stats:
                    stats["own_th_level_list_defense"] = []
                if "attacker_th_level_list_defense" not in stats:
                    stats["attacker_th_level_list_defense"] = []

                if "map_position_list" not in stats:
                    stats["map_position_list"] = []
                    stats["opponent_position_list"] = []
                    stats["opponent_th_level_list"] = []
                    stats["attack_order_list"] = []
                    stats["attacker_position_list"] = []
                    stats["defense_order_list"] = []
                    stats["attacker_th_level_list"] = []

                if mtag in avg_pos_map:
                    stats = summary["members"][mtag]
                    stats["map_position"] = avg_pos_map[mtag]["map_position"]
                    stats["avg_opponent_position"] = avg_pos_map[mtag]["avg_opponent_position"]
                    stats["avg_attack_order"] = avg_pos_map[mtag]["avg_attack_order"]
                    stats["avg_townhall_level"] = avg_pos_map[mtag]["avg_townhall_level"]
                    stats["avg_opponent_townhall_level"] = avg_pos_map[mtag]["avg_opponent_townhall_level"]
                    data = avg_pos_map[mtag]
                    if data["map_position"] is not None:
                        stats["map_position_list"].append(data["map_position"])
                    if data["avg_opponent_position"] is not None:
                        stats["opponent_position_list"].append(data["avg_opponent_position"])
                    if data["avg_opponent_townhall_level"] is not None:
                        stats["opponent_th_level_list"].append(data["avg_opponent_townhall_level"])
                    if data["avg_attack_order"] is not None:
                        stats["attack_order_list"].append(data["avg_attack_order"])
                    if data["avg_attacker_position"] is not None:
                        stats["attacker_position_list"].append(data["avg_attacker_position"])
                    if data["avg_defense_order"] is not None:
                        stats["defense_order_list"].append(data["avg_defense_order"])
                    if data["avg_attacker_townhall_level"] is not None:
                        stats["attacker_th_level_list"].append(data["avg_attacker_townhall_level"])

                attacks = member.get("attacks")
                if attacks:
                    attack = attacks[0] if isinstance(attacks, list) else attacks
                    stars = attack["stars"]
                    destruction = attack["destructionPercentage"]
                    defender_tag = attack.get("defenderTag")
                    defender_th = None
                    own_th = member.get("townhallLevel")

                    if defender_tag and war["opponent" if side == "clan" else "clan"]:
                        for opp_member in war["opponent" if side == "clan" else "clan"]["members"]:
                            if opp_member["tag"] == defender_tag:
                                defender_th = opp_member.get("townhallLevel")
                                break

                    if defender_th is not None:
                        stats["stars_by_th"].setdefault(stars, {}).setdefault(defender_th, 0)
                        stats["stars_by_th"][stars][defender_th] += 1
                        stats["opponent_th_level_list_attack"].append(defender_th)
                        stats["own_th_level_list_attack"].append(own_th)

                    stats["stars"] += stars
                    stats["total_destruction"] += destruction
                    stats["attack_count"] += 1
                    summary["total_destruction_inflicted"] += destruction
                    summary["attack_count"] += 1

                else:
                    if war.get("state") == "warEnded":
                        stats["missed_attacks"] += 1
                        summary["missed_attacks"] += 1

                defense = member.get("bestOpponentAttack")
                if defense:
                    stars = defense["stars"]
                    attacker_tag = defense.get("attackerTag")
                    attacker_th = None
                    defender_th = member.get("townhallLevel")

                    if attacker_tag and war["opponent" if side == "clan" else "clan"]:
                        for opp_member in war["opponent" if side == "clan" else "clan"]["members"]:
                            if opp_member["tag"] == attacker_tag:
                                attacker_th = opp_member.get("townhallLevel")
                                break

                    if attacker_th is not None:
                        stats["defense_stars_by_th"].setdefault(stars, {}).setdefault(attacker_th, 0)
                        stats["defense_stars_by_th"][stars][attacker_th] += 1
                        stats["attacker_th_level_list_defense"].append(attacker_th)
                        stats["own_th_level_list_defense"].append(defender_th)

                    stats["defense_stars_taken"] += stars
                    stats["defense_total_destruction"] += defense["destructionPercentage"]
                    stats["defense_count"] += 1
                    summary["total_destruction"] += defense["destructionPercentage"]

                else:
                    stats["missed_defenses"] += 1
                    summary["missed_defenses"] += 1


async def compute_clan_ranking(clan_summary_map):
    clan_ranking = [
        {
            "tag": tag,
            "stars": summary["total_stars"],
            "destruction": summary["total_destruction_inflicted"]
        }
        for tag, summary in clan_summary_map.items()
    ]
    sorted_clans = sorted(clan_ranking, key=lambda x: (-x["stars"], -x["destruction"]))
    for idx, clan in enumerate(sorted_clans):
        clan["rank"] = idx + 1
    return sorted_clans


def compute_member_position_stats(war, clan_key="clan", opponent_key="opponent"):

    enemy_map = {
        member["tag"]: member.get("mapPosition")
        for member in war[opponent_key]["members"]
    }

    enemy_townhall_map = {
        member["tag"]: member.get("townhallLevel")
        for member in war[opponent_key]["members"]
    }

    result = {}

    for member in war[clan_key]["members"]:
        tag = member["tag"]
        position = member.get("mapPosition")
        townhall = member.get("townhallLevel")
        attacks = member.get("attacks", [])
        defense = member.get("bestOpponentAttack")

        opponent_positions = []
        opponent_th_levels = []
        attack_orders = []

        defense_positions = []
        defense_orders = []
        attacker_th_levels = []

        stars_by_th = defaultdict(lambda: defaultdict(int))
        defense_stars_by_th = defaultdict(lambda: defaultdict(int))

        for attack in attacks:
            defender_tag = attack.get("defenderTag")
            if defender_tag in enemy_map:
                opponent_positions.append(enemy_map[defender_tag])
            if defender_tag in enemy_townhall_map:
                th_level = enemy_townhall_map[defender_tag]
                opponent_th_levels.append(th_level)
                stars = attack.get("stars")
                if stars is not None:
                    stars_by_th[stars][th_level] += 1
            if "order" in attack:
                attack_orders.append(attack["order"])

        if defense:
            attacker_tag = defense.get("attackerTag")
            if attacker_tag in enemy_map:
                defense_positions.append(enemy_map[attacker_tag])
            if attacker_tag in enemy_townhall_map:
                th_level = enemy_townhall_map[attacker_tag]
                attacker_th_levels.append(th_level)
                stars = defense.get("stars")
                if stars is not None:
                    defense_stars_by_th[stars][th_level] += 1
            if "order" in defense:
                defense_orders.append(defense["order"])

        result[tag] = {
            "map_position": position,
            "avg_townhall_level": townhall,
            "avg_opponent_position": round(sum(opponent_positions) / len(opponent_positions),
                                           1) if opponent_positions else None,
            "avg_opponent_townhall_level": round(sum(opponent_th_levels) / len(opponent_th_levels),
                                                 1) if opponent_th_levels else None,
            "avg_attack_order": round(sum(attack_orders) / len(attack_orders), 1) if attack_orders else None,
            "avg_attacker_position": round(sum(defense_positions) / len(defense_positions),
                                           1) if defense_positions else None,
            "avg_defense_order": round(sum(defense_orders) / len(defense_orders), 1) if defense_orders else None,
            "avg_attacker_townhall_level": round(sum(attacker_th_levels) / len(attacker_th_levels),
                                                 1) if attacker_th_levels else None,
            "opponent_th_levels": opponent_th_levels,
            "attacker_th_levels": attacker_th_levels,
            "stars_by_th": dict(stars_by_th),
            "defense_stars_by_th": dict(defense_stars_by_th),
        }

    return result


async def enrich_league_info(league_info, war_league_infos, session):
    clan_summary_map = await init_clan_summary_map(league_info)
    await process_war_stats(war_league_infos, clan_summary_map)
    sorted_clans = await compute_clan_ranking(clan_summary_map)

    league_info["total_stars"] = sum(c["stars"] for c in sorted_clans)
    league_info["total_destruction"] = round(sum(c["destruction"] for c in sorted_clans), 2)

    for clan in league_info.get("clans", []):
        tag = clan.get("tag")
        if tag not in clan_summary_map:
            continue
        summary = clan_summary_map[tag]
        clan["total_stars"] = summary["total_stars"]
        clan["total_destruction"] = round(summary["total_destruction"], 2)
        clan["total_destruction_inflicted"] = round(summary["total_destruction_inflicted"], 2)
        clan["wars_played"] = summary["wars_played"]
        clan["rank"] = next((r["rank"] for r in sorted_clans if r["tag"] == tag), None)
        clan["attack_count"] = summary["attack_count"]
        clan["missed_attacks"] = summary["missed_attacks"]

        townhall_counts = defaultdict(int)

        for member in clan.get("members", []):
            mtag = member.get("tag")
            th_level = member.get("townHallLevel")
            if th_level:
                townhall_counts[th_level] += 1

            avg = lambda l: round(sum(l) / len(l), 1) if l else None

            if mtag in summary["members"]:
                stats = summary["members"][mtag]

                member.update({
                    "avgMapPosition": avg(stats.get("map_position_list", [])),
                    "avgOpponentPosition": avg(stats.get("opponent_position_list", [])),
                    "avgAttackOrder": avg(stats.get("attack_order_list", [])),
                    "avgTownHallLevel": stats.get("avg_townhall_level"),
                    "avgOpponentTownHallLevel": avg(stats.get("opponent_th_level_list", [])),
                    "avgAttackerPosition": avg(stats.get("attacker_position_list", [])),
                    "avgDefenseOrder": avg(stats.get("defense_order_list", [])),
                    "avgAttackerTownHallLevel": avg(stats.get("attacker_th_level_list", [])),
                    "attackLowerTHLevel": sum(
                        1 for own_th, enemy_th in
                        zip(stats.get("own_th_level_list_attack", []), stats.get("opponent_th_level_list_attack", []))
                        if enemy_th < own_th
                    ),
                    "attackUpperTHLevel": sum(
                        1 for own_th, enemy_th in
                        zip(stats.get("own_th_level_list_attack", []), stats.get("opponent_th_level_list", []))
                        if enemy_th > own_th
                    ),
                    "defenseLowerTHLevel": sum(
                        1 for own_th, enemy_th in
                        zip(stats.get("own_th_level_list_defense", []), stats.get("attacker_th_level_list_defense", []))
                        if enemy_th < own_th
                    ),
                    "defenseUpperTHLevel": sum(
                        1 for own_th, enemy_th in
                        zip(stats.get("own_th_level_list_defense", []), stats.get("attacker_th_level_list", []))
                        if enemy_th > own_th
                    ),

                    "attacks": {
                        "stars": stats["stars"],
                        "3_stars": dict(stats.get("stars_by_th", {}).get(3, {})),
                        "2_stars": dict(stats.get("stars_by_th", {}).get(2, {})),
                        "1_star": dict(stats.get("stars_by_th", {}).get(1, {})),
                        "0_star": dict(stats.get("stars_by_th", {}).get(0, {})),
                        "total_destruction": round(stats["total_destruction"], 2),
                        "attack_count": stats["attack_count"],
                        "missed_attacks": stats["missed_attacks"]
                    },
                    "defense": {
                        "stars": stats["defense_stars_taken"],
                        "3_stars": dict(stats.get("defense_stars_by_th", {}).get(3, {})),
                        "2_stars": dict(stats.get("defense_stars_by_th", {}).get(2, {})),
                        "1_star": dict(stats.get("defense_stars_by_th", {}).get(1, {})),
                        "0_star": dict(stats.get("defense_stars_by_th", {}).get(0, {})),
                        "total_destruction": round(stats["defense_total_destruction"], 2),
                        "defense_count": stats["defense_count"],
                        "missed_defenses": stats["missed_defenses"]
                    }
                })

        clan["town_hall_levels"] = dict(townhall_counts)

    # Get clan with rank = 3 to get current league because they won't go up or down
    third_clan = next((clan for clan in league_info["clans"] if clan["rank"] == 3), None)
    clan_tag = third_clan.get("tag", "").replace("#", "%23")
    url = f"https://proxy.clashk.ing/v1/clans/{clan_tag}"
    try:
        async with session.get(url) as res:
            if res.status == 200:
                data = await res.json()
                if "warLeague" in data:
                    league_info["war_league"] = data["warLeague"]["name"]
    except Exception:
        pass

    return league_info


def compute_warhit_stats(
        attacks: List[dict],
        defenses: List[dict],
        filter: PlayerWarhitsFilter,
        missed_attacks: int = 0,
        missed_defenses: int = 0,
        num_wars: int = 0,
):
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

    def group_by_th_matchup(lst, is_attack=True):

        th2_key = "defender" if is_attack else "attacker"
        th1_key = "attacker" if is_attack else "defender"
        grouped = defaultdict(list)

        for hit in lst:
            attacker_th = hit[th1_key]["townhallLevel"]
            defender_th = hit[th2_key]["townhallLevel"]
            matchup = f"{attacker_th}vs{defender_th}"
            grouped[matchup].append(hit)

        result = {}
        for matchup, hits in grouped.items():
            result[matchup] = {
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
        "byEnemyTownhall": group_by_th_matchup(filtered_attacks, is_attack=True),
        "byEnemyTownhallDef": group_by_th_matchup(filtered_defenses, is_attack=False),
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


def attack_passes_filters(atk, member, filter):
    if not filter:
        return True
    if filter.enemy_th and atk.defender.town_hall != filter.enemy_th:
        return False
    if filter.same_th and atk.defender.town_hall != member.town_hall:
        return False
    if filter.fresh_only and not atk.is_fresh_attack:
        return False
    if filter.min_stars and atk.stars < filter.min_stars:
        return False
    if filter.max_stars and atk.stars > filter.max_stars:
        return False
    if filter.min_destruction and atk.destruction < filter.min_destruction:
        return False
    if filter.max_destruction and atk.destruction > filter.max_destruction:
        return False
    if filter.map_position_min and atk.defender.map_position < filter.map_position_min:
        return False
    if filter.map_position_max and atk.defender.map_position > filter.map_position_max:
        return False
    return True


def defense_passes_filters(dfn, member, filter):
    if not filter:
        return True
    if not dfn.attacker:
        return False
    if filter.enemy_th and dfn.attacker.town_hall != filter.enemy_th:
        return False
    if filter.same_th and dfn.defender.town_hall != member.town_hall:
        return False
    if filter.fresh_only and not dfn.is_fresh_attack:
        return False
    if filter.min_stars and dfn.stars < filter.min_stars:
        return False
    if filter.max_stars and dfn.stars > filter.max_stars:
        return False
    if filter.min_destruction and dfn.destruction < filter.min_destruction:
        return False
    if filter.max_destruction and dfn.destruction > filter.max_destruction:
        return False
    if filter.map_position_min and dfn.attacker.map_position < filter.map_position_min:
        return False
    if filter.map_position_max and dfn.attacker.map_position > filter.map_position_max:
        return False
    return True


async def collect_player_hits_from_wars(wars_docs, tags_to_include=None, clan_tags=None, filter=None, client=None):

    players_data = defaultdict(lambda: {
        "attacks": [],
        "defenses": [],
        "townhall": None,
        "missedAttacks": 0,
        "missedDefenses": 0,
        "warsCount": 0,
        "wars": []
    })

    seen_wars = set()
    all_wars_dict = {}

    for war_doc in wars_docs:
        war_raw = war_doc["data"]
        war = coc.ClanWar(data=war_raw, client=client)
        war_id = "-".join(
            sorted([war.clan_tag, war.opponent.tag])) + f"-{int(war.preparation_start_time.time.timestamp())}"
        if war_id in seen_wars:
            continue
        seen_wars.add(war_id)

        if filter and filter.type != "all" and war.type.lower() != filter.type.lower():
            continue

        for side in [war.clan, war.opponent]:
            if clan_tags and side.tag not in clan_tags:
                continue

            for member in side.members:
                tag = member.tag
                if tags_to_include and tag not in tags_to_include:
                    continue

                player_data = players_data[tag]
                player_data["townhall"] = max(player_data["townhall"] or 0, member.town_hall)
                player_data["missedAttacks"] += war.attacks_per_member - len(member.attacks)
                player_data["missedDefenses"] += 1 if not member.best_opponent_attack else 0
                player_data["warsCount"] += 1

                # Base war and member data
                war_data = war._raw_data.copy()
                for field in ["status_code", "_response_retry", "timestamp"]:
                    war_data.pop(field, None)
                war_data["type"] = war.type
                war_data["clan"].pop("members", None)
                war_data["opponent"].pop("members", None)

                member_raw_data = member._raw_data.copy()
                member_raw_data.pop("attacks", None)
                member_raw_data.pop("bestOpponentAttack", None)

                member_raw_data["attacks"] = []
                member_raw_data["defenses"] = []

                war_info = {
                    "war_data": war_data,
                    "member_data": member_raw_data
                }

                for atk in member.attacks:
                    if not attack_passes_filters(atk, member, filter):
                        continue

                    atk_data = atk._raw_data.copy()
                    defender_data = atk.defender._raw_data.copy()
                    defender_data.pop("attacks", None)
                    defender_data.pop("bestOpponentAttack", None)
                    atk_data["defender"] = defender_data
                    atk_data["attacker"] = {
                        "tag": member.tag,
                        "townhallLevel": member.town_hall,
                        "name": member.name,
                        "mapPosition": member.map_position
                    }
                    atk_data["attack_order"] = atk.order
                    atk_data["fresh"] = atk.is_fresh_attack
                    atk_data["war_type"] = war.type.lower()

                    player_data["attacks"].append(atk_data)
                    member_raw_data["attacks"].append(atk_data)

                for dfn in member.defenses:
                    if not defense_passes_filters(dfn, member, filter):
                        continue

                    def_data = dfn._raw_data.copy()
                    def_data["attack_order"] = dfn.order
                    def_data["fresh"] = dfn.is_fresh_attack

                    if dfn.attacker:
                        attacker_data = dfn.attacker._raw_data.copy()
                        attacker_data.pop("attacks", None)
                        attacker_data.pop("bestOpponentAttack", None)
                        def_data["attacker"] = attacker_data

                    def_data["defender"] = {
                        "tag": member.tag,
                        "townhallLevel": member.town_hall,
                        "name": member.name,
                        "mapPosition": member.map_position,
                    }
                    def_data["war_type"] = war.type.lower()

                    player_data["defenses"].append(def_data)
                    member_raw_data["defenses"].append(def_data)

                member_raw_data["missedAttacks"] = war.attacks_per_member - len(member.attacks)
                member_raw_data["missedDefenses"] = 1 if not member.best_opponent_attack else 0
                if war_id not in all_wars_dict:
                    all_wars_dict[war_id] = {
                        "war_data": war_data,
                        "members": []
                    }

                all_wars_dict[war_id]["members"].append(member_raw_data)
                war_info["missedAttacks"] = war.attacks_per_member - len(member.attacks)
                war_info["missedDefenses"] = 1 if not member.best_opponent_attack else 0
                player_data["wars"].append(war_info)

    results = []
    for tag, data in players_data.items():
        for war_info in data["wars"]:
            war_type = war_info["war_data"].get("type", "all").lower()
            for atk in war_info["member_data"].get("attacks", []):
                atk["war_type"] = war_type
            for dfn in war_info["member_data"].get("defenses", []):
                dfn["war_type"] = war_type

        grouped = group_attacks_by_type(data["attacks"], data["defenses"], data["wars"])
        stats = {}
        for war_type, d in grouped.items():
            stats[war_type] = compute_warhit_stats(
                attacks=d["attacks"],
                defenses=d["defenses"],
                filter=filter,
                missed_attacks=d["missedAttacks"],
                missed_defenses=d["missedDefenses"],
                num_wars=d["warsCounts"],
            )

        results.append({
            "name": data["attacks"][0]["attacker"]["name"] if data["attacks"] else data["defenses"][0]["defender"][
                "name"],
            "tag": tag,
            "townhallLevel": data["townhall"],
            "stats": stats,
            "timeRange": {
                "start": filter.timestamp_start,
                "end": filter.timestamp_end,
            },
            "warType": filter.type,
        })

    if clan_tags:
        return {
            "items": results,
            "wars": list(all_wars_dict.values())
        }
    else:
        for tag in players_data:
            player_data = players_data[tag]
            wars_per_player = []
            for war_info in player_data["wars"]:
                wars_per_player.append({
                    "war_data": war_info["war_data"],
                    "members": [war_info["member_data"]]
                })

            for item in results:
                if item["tag"] == tag:
                    item["wars"] = wars_per_player
        return {
            "items": results
        }
