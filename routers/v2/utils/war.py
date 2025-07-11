import coc
from collections import defaultdict
from fastapi import HTTPException



def deconstruct_type(value):
    types = []
    if value & 1:
        types.append(1)
    if value & 2:
        types.append(2)
    if value & 4:
        types.append(4)
    return types


async def calculate_war_stats(
        wars: list[dict],
        clan_tags: set,
        townhall_filter: str
):
    if townhall_filter == "all":
        townhall_filter = "*v*"
    elif townhall_filter == "equal":
        townhall_filter = "=v="

    if "v" not in townhall_filter:
        raise HTTPException(status_code=400, detail="Invalid townhall filter")
    townhall_level, opponent_townhall_level = townhall_filter.split("v")

    townhall_level = int(townhall_level.strip()) if townhall_level.isdigit() else townhall_level.strip()
    opponent_townhall_level = int(opponent_townhall_level.strip()) if opponent_townhall_level.isdigit() else opponent_townhall_level.strip()

    ALLOWED = {"*", "="}

    invalid_tl = not (isinstance(townhall_level, int) or townhall_level in ALLOWED)
    invalid_otl = not (isinstance(opponent_townhall_level, int) or opponent_townhall_level in ALLOWED)

    if invalid_tl or invalid_otl:
        raise HTTPException(status_code=400, detail="Invalid townhall filter")

    player_stats = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for war in wars:
        war = war.get("data")
        clan_tag = war.get("clan").get("tag")
        if clan_tag not in clan_tags:
            clan_tag = war.get("opponent").get("tag")
        war = coc.ClanWar(data=war, clan_tag=clan_tag, client=None)
        for member in war.clan.members:
            if not player_stats[member.tag].get("name"):
                player_stats[member.tag]["name"] = member.name
                player_stats[member.tag]["tag"] = member.tag
                player_stats[member.tag]["townhall"] = member.town_hall

            for attack in member.attacks:
                if townhall_filter == "=" and opponent_townhall_level == "=":
                    if member.town_hall != attack.defender.town_hall:
                        continue
                elif isinstance(townhall_filter, int) and townhall_filter != member.town_hall:
                    continue
                elif isinstance(opponent_townhall_level, int) and opponent_townhall_level != attack.defender.town_hall:
                    continue

                spot = player_stats[attack.attacker.tag]["stats"]
                spot["attacks"] += 1
                spot["destruction"] += attack.destruction
                spot["stars"] += attack.stars
                spot["fresh"] += 1 if attack.is_fresh_attack else 0
                spot["won"] += 1 if attack.war.status == "won" else 0
                spot["duration"] += attack.duration
                spot["order"] += attack.order
                spot["defensive_position"] += attack.defender.map_position
                spot["zero_stars"] += 1 if attack.stars == 0 else 0
                spot["one_stars"] += 1 if attack.stars == 1 else 0
                spot["two_stars"] += 1 if attack.stars == 2 else 0
                spot["three_stars"] += 1 if attack.stars == 3 else 0

            for x in range(war.attacks_per_member - len(member.attacks)):
                player_stats[member.tag]["missed"][f"{member.town_hall}"] += 1
                player_stats[member.tag]["missed"]["all"] += 1

    for player, thvs in player_stats.items():
        for thv, stats in thvs.items():
            if isinstance(stats, str) or isinstance(stats, int) or thv == "missed":
                continue
            attacks = stats["attacks"]
            if attacks:
                stats["avg_destruction"] = round(stats["destruction"] / attacks, 2)
                stats["avg_stars"] = round(stats["stars"] / attacks, 2)
                stats["avg_duration"] = round(stats["duration"] / attacks, 2)
                stats["avg_order"] = round(stats["order"] / attacks, 2)
                stats["avg_fresh"] = round(stats["fresh"] / attacks * 100, 2)
                stats["avg_won"] = round(stats["won"] / attacks * 100, 2)
                stats["avg_zero_stars"] = round(stats["zero_stars"] / attacks * 100, 2)
                stats["avg_one_stars"] = round(stats["one_stars"] / attacks * 100, 2)
                stats["avg_two_stars"] = round(stats["two_stars"] / attacks * 100, 2)
                stats["avg_three_stars"] = round(stats["three_stars"] / attacks * 100, 2)
                stats["avg_defender_position"] = round(stats["defensive_position"] / attacks, 2)
                del stats["defensive_position"]


    player_stats = dict(player_stats)
    return {"items": list(player_stats.values())}