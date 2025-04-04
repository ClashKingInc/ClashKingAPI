from collections import defaultdict
import coc
import requests
import time


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


async def fetch_current_war_info_bypass(clan_tag):
    war = await fetch_current_war_info(clan_tag)
    if war["state"] == "accessDenied":
        opponent_tag = await fetch_opponent_tag(clan_tag)
        if opponent_tag:
            return await fetch_current_war_info(opponent_tag, bypass=True)
    return war


async def fetch_league_info(clan_tag):
    try:
        tag_encoded = clan_tag.replace("#", "%23")
        url = f"https://proxy.clashk.ing/v1/clans/{tag_encoded}/currentwar/leaguegroup"
        res = requests.get(url, timeout=15)

        if res.status_code == 200:
            data = res.json()
            if data.get("state") != "notInWar":
                return data
    except Exception as e:
        print(f"Error fetching CWL info: {e}")
    return None


async def fetch_war_league_info(war_tag):
    retry_count = 0
    war_tag_encoded = war_tag.replace('#', '%23')
    while retry_count < 3:
        try:
            url = f"https://proxy.clashk.ing/v1/clanwarleagues/wars/{war_tag_encoded}"
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                if data.get("state") != "notInWar":
                    data["war_tag"] = war_tag
                    return data
                return None
            else:
                retry_count += 1
                time.sleep(5)
        except Exception:
            retry_count += 1
            time.sleep(5)
    return None


async def fetch_war_league_infos(war_tags):
    infos = []
    for tag in war_tags:
        if tag != "#0":
            info = await fetch_war_league_info(tag)
            if info:
                infos.append(info)
    return infos


async def init_clan_summary_map(league_info):
    clan_summary_map = {}
    for clan in league_info.get("clans", []):
        tag = clan.get("tag")
        clan_summary_map[tag] = {
            "total_stars": 0,
            "attack_count": 0,
            "missed_attacks": 0,
            "total_destruction": 0.0,
            "total_destruction_inflicted": 0.0,
            "wars_played": 0,
            "members": defaultdict(lambda: {
                "name": None,
                "stars": 0,
                "3_stars": 0,
                "2_stars": 0,
                "1_star": 0,
                "0_star": 0,
                "total_destruction": 0.0,
                "attack_count": 0,
                "missed_attacks": 0,
                "defense_stars_taken": 0,
                "defense_3_stars": 0,
                "defense_2_stars": 0,
                "defense_1_star": 0,
                "defense_0_star": 0,
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

            for member in clan.get("members", []):
                name = member["name"]
                mtag = member.get("tag")
                stats = summary["members"][mtag]
                stats["name"] = name

                attack = member.get("attacks")
                if attack:
                    attack = attack[0] if isinstance(attack, list) else attack
                    stars = attack["stars"]
                    destruction = attack["destructionPercentage"]
                    stats["stars"] += stars
                    stats["total_destruction"] += destruction
                    stats["attack_count"] += 1
                    summary["total_destruction_inflicted"] += destruction
                    summary["attack_count"] += 1
                    if stars == 3:
                        stats["3_stars"] += 1
                    elif stars == 2:
                        stats["2_stars"] += 1
                    elif stars == 1:
                        stats["1_star"] += 1
                    else:
                        stats["0_star"] += 1
                elif war.get("state") == "warEnded":
                    stats["missed_attacks"] += 1
                    summary["missed_attacks"] += 1

                defense = member.get("bestOpponentAttack")
                if defense:
                    stars = defense["stars"]
                    stats["defense_stars_taken"] += stars
                    stats["defense_total_destruction"] += defense["destructionPercentage"]
                    stats["defense_count"] += 1
                    summary["total_destruction"] += defense["destructionPercentage"]
                    if stars == 3:
                        stats["defense_3_stars"] += 1
                    elif stars == 2:
                        stats["defense_2_stars"] += 1
                    elif stars == 1:
                        stats["defense_1_star"] += 1
                    else:
                        stats["defense_0_star"] += 1


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


async def enrich_league_info(league_info, war_league_infos):
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

        for member in clan.get("members", []):
            mtag = member.get("tag")
            if mtag in summary["members"]:
                stats = summary["members"][mtag]
                member.update({
                    "attacks": {
                        "stars": stats["stars"],
                        "3_stars": stats["3_stars"],
                        "2_stars": stats["2_stars"],
                        "1_star": stats["1_star"],
                        "0_star": stats["0_star"],
                        "total_destruction": round(stats["total_destruction"], 2),
                        "attack_count": stats["attack_count"],
                        "missed_attacks": stats["missed_attacks"]
                    },
                    "defense": {
                        "stars": stats["defense_stars_taken"],
                        "3_stars": stats["defense_3_stars"],
                        "2_stars": stats["defense_2_stars"],
                        "1_star": stats["defense_1_star"],
                        "0_star": stats["defense_0_star"],
                        "total_destruction": round(stats["defense_total_destruction"], 2),
                        "defense_count": stats["defense_count"]
                    }
                })

    return league_info
