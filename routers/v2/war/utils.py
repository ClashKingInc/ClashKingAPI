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