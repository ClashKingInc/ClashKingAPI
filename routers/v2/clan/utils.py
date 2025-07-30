import statistics
from collections import defaultdict, Counter
import math


def filter_leave_join(events: list, min_duration_seconds: int) -> list:
    """
    Remove leave-join pairs for the same player when the rejoin is within a short time window,
    regardless of the order of the events.
    """
    from collections import defaultdict

    by_tag = defaultdict(list)
    for e in events:
        by_tag[e["tag"]].append(e)

    filtered = []

    for tag, evts in by_tag.items():
        evts.sort(key=lambda e: e["time"])
        skip_next = set()
        i = 0
        while i < len(evts):
            curr = evts[i]
            if curr["type"] == "leave" and i + 1 < len(evts):
                next_evt = evts[i + 1]
                if next_evt["type"] == "join":
                    delta = (next_evt["time"] - curr["time"]).total_seconds()
                    if delta < min_duration_seconds:
                        skip_next.update([i, i + 1])
                        i += 2
                        continue
            i += 1

        for j, evt in enumerate(evts):
            if j not in skip_next:
                filtered.append(evt)

    return sorted(filtered, key=lambda x: x["time"], reverse=True)  # facultatif : pour garder ordre inverse

def filter_join_leave(events: list, min_duration_seconds: int) -> list:
    """
    Remove join-leave pairs for the same player when the leave happens soon after the join.
    """
    from collections import defaultdict

    by_tag = defaultdict(list)
    for e in events:
        by_tag[e["tag"]].append(e)

    filtered = []

    for tag, evts in by_tag.items():
        evts.sort(key=lambda e: e["time"])
        skip = set()
        i = 0
        while i < len(evts) - 1:
            e1 = evts[i]
            e2 = evts[i + 1]
            if e1["type"] == "join" and e2["type"] == "leave":
                delta = (e2["time"] - e1["time"]).total_seconds()
                if delta < min_duration_seconds:
                    skip.update([i, i + 1])
                    i += 2
                    continue
            i += 1
        for j, evt in enumerate(evts):
            if j not in skip:
                filtered.append(evt)

    return sorted(filtered, key=lambda x: x["time"], reverse=True)

def extract_join_leave_pairs(events: list, max_duration_seconds: int, direction: str = "join_leave") -> list:
    """
    Return only join-leave (or leave-join) pairs where both actions happened within a short time window.
    direction: "join_leave" or "leave_join"
    """
    by_tag = defaultdict(list)
    for e in events:
        by_tag[e["tag"]].append(e)

    pairs = []

    for tag, evts in by_tag.items():
        evts.sort(key=lambda e: e["time"])
        i = 0
        while i < len(evts) - 1:
            e1 = evts[i]
            e2 = evts[i + 1]
            if (
                direction == "join_leave" and e1["type"] == "join" and e2["type"] == "leave"
                or direction == "leave_join" and e1["type"] == "leave" and e2["type"] == "join"
            ):
                delta = (e2["time"] - e1["time"]).total_seconds()
                if delta < max_duration_seconds:
                    pairs.extend([e1, e2])
                    i += 2
                    continue
            i += 1

    return sorted(pairs, key=lambda x: x["time"], reverse=True)

def generate_stats(events):
    join_events = [e for e in events if e["type"] == "join"]
    leave_events = [e for e in events if e["type"] == "leave"]

    tags = [e["tag"] for e in events]
    players_by_tag = Counter(tags)

    active_players = set()
    seen_players = set()
    tag_events = defaultdict(list)

    for e in events:
        tag_events[e["tag"]].append(e)

    for e in sorted(events, key=lambda x: x["time"]):
        if e["type"] == "join":
            active_players.add(e["tag"])
        elif e["type"] == "leave":
            active_players.discard(e["tag"])
        seen_players.add(e["tag"])

    time_deltas = []
    for tag, evs in tag_events.items():
        evs_sorted = sorted(evs, key=lambda x: x["time"])
        for i in range(len(evs_sorted) - 1):
            if evs_sorted[i]["type"] == "join" and evs_sorted[i + 1]["type"] == "leave":
                delta = (evs_sorted[i + 1]["time"] - evs_sorted[i]["time"]).total_seconds()
                time_deltas.append(delta)

    hours = [e["time"].hour for e in events]
    most_common_hour = Counter(hours).most_common(1)[0][0] if hours else None

    top_users = Counter(tags).most_common(3)
    top_users_named = [{"tag": t, "count": c, "name": next(e['name'] for e in events if e["tag"] == t)} for t, c in top_users]

    still_in_clan = set()
    for tag, evs in tag_events.items():
        evs_sorted = sorted(evs, key=lambda x: x["time"])
        if evs_sorted[-1]["type"] == "join":
            still_in_clan.add(tag)

    left_and_never_came_back = set()
    for tag, evs in tag_events.items():
        evs_sorted = sorted(evs, key=lambda x: x["time"])
        if evs_sorted[-1]["type"] == "leave":
            left_and_never_came_back.add(tag)

    return {
        "total_events": len(events),
        "total_joins": len(join_events),
        "total_leaves": len(leave_events),
        "unique_players": len(seen_players),
        "moving_players": len(active_players),
        "rejoined_players": sum(1 for v in players_by_tag.values() if v > 1),
        "first_event": min(e["time"] for e in events).isoformat() if events else None,
        "last_event": max(e["time"] for e in events).isoformat() if events else None,
        "most_moving_hour": most_common_hour,
        "avg_time_between_join_leave": round(statistics.mean(time_deltas), 2) if time_deltas else None,
        "players_still_in_clan": len(still_in_clan),
        "players_left_forever": len(left_and_never_came_back),
        "most_moving_players": top_users_named,
    }

def generate_raids_clan_stats(history: list):
    total_loot = 0
    total_attacks = 0
    total_raids = 0
    number_weeks = 0
    total_districts_destroyed = 0
    best_raid = None
    worst_raid = None
    total_offensive_rewards = 0
    total_defensive_rewards = 0

    for raid in history:
        total_loot += raid.get("capitalTotalLoot", 0)
        total_attacks += raid.get("totalAttacks", 0)
        number_weeks += 1
        total_raids += raid.get("raidsCompleted", 0)
        total_districts_destroyed += raid.get("enemyDistrictsDestroyed", 0)
        total_offensive_rewards = 6 * raid.get("offensiveReward", 0)
        total_defensive_rewards = raid.get("defensiveReward", 0)
        total_rewards = total_defensive_rewards + total_offensive_rewards

        if best_raid is None or total_rewards > best_raid.get("totalRewards", 0):
            best_raid = raid
            best_raid["totalRewards"] = total_rewards
        if raid.get("state") == "ended" and (worst_raid is None or total_rewards < worst_raid.get("totalRewards", 0)):
            worst_raid = raid
            worst_raid["totalRewards"] = total_rewards

    if number_weeks > 1 :
        number_weeks -= 1

    avg_loot_per_attack = total_loot / total_attacks if total_attacks else 0
    avg_loot_per_week = total_loot / number_weeks if number_weeks else 0
    avg_attacks_per_week = total_attacks / number_weeks if number_weeks else 0
    avg_attacks_per_raid = total_attacks / total_raids if total_raids else 0
    avg_offensive_rewards = total_offensive_rewards / number_weeks if number_weeks else 0
    avg_defensive_rewards = total_defensive_rewards / number_weeks if number_weeks else 0


    return {
        "totalLoot": total_loot,
        "totalAttacks": total_attacks,
        "numberOfWeeks": number_weeks,
        "totalRaids": total_raids,
        "totalDistrictsDestroyed": total_districts_destroyed,
        "totalOffensiveRewards": total_offensive_rewards,
        "totalDefensiveRewards": total_defensive_rewards,
        "avgLootPerAttack": round(avg_loot_per_attack, 2),
        "avgLootPerWeek": round(avg_loot_per_week, 2),
        "avgAttacksPerWeek": round(avg_attacks_per_week, 2),
        "avgAttacksPerRaid": round(avg_attacks_per_raid, 2),
        "avgAttacksPerDistrict": round(total_attacks / max(total_districts_destroyed, 1), 2) if total_districts_destroyed else 0,
        "avgOffensiveRewards": round(avg_offensive_rewards, 2),
        "avgDefensiveRewards": round(avg_defensive_rewards, 2),
        "bestRaid": {
            "startTime": best_raid.get("startTime"),
            "capitalTotalLoot": best_raid.get("capitalTotalLoot"),
            "totalRewards": best_raid.get("totalRewards"),
            "raidsCompleted": best_raid.get("raidsCompleted"),
            "totalAttacks": best_raid.get("totalAttacks"),
            "enemyDistrictsDestroyed": best_raid.get("enemyDistrictsDestroyed"),
            "avgAttacksPerRaid": round(best_raid.get("totalAttacks", 0) / max(best_raid.get("raidsCompleted", 0), 1), 2),
            "avgAttacksPerDistrict": round(best_raid.get("totalAttacks", 0) / max(best_raid.get("enemyDistrictsDestroyed", 0), 1), 2),
        } if best_raid else None,
        "worstRaid": {
            "startTime": worst_raid.get("startTime"),
            "capitalTotalLoot": worst_raid.get("capitalTotalLoot"),
            "totalRewards": worst_raid.get("totalRewards"),
            "raidsCompleted": worst_raid.get("raidsCompleted"),
            "totalAttacks": worst_raid.get("totalAttacks"),
            "enemyDistrictsDestroyed": worst_raid.get("enemyDistrictsDestroyed"),
            "avgAttacksPerRaid": round(worst_raid.get("totalAttacks", 0) / max(worst_raid.get("raidsCompleted", 0), 1), 2),
            "avgAttacksPerDistrict": round(worst_raid.get("totalAttacks", 0) / max(worst_raid.get("enemyDistrictsDestroyed", 0), 1), 2),
        } if worst_raid else None,
    }


def predict_rewards(history: list):
    """
    Predicts offensive and defensive rewards for each raid season in the history.
    Modifies the history in place.
    """

    for raid_season in history:
        capital_loot = raid_season.get('capitalTotalLoot', 0)
        total_attacks = raid_season.get('totalAttacks', 0)

        if not capital_loot or not total_attacks:
            continue  

        # Calculate average loot per attack
        avg_loot_per_attack = capital_loot / total_attacks

        # Calculate avg defense loot if available (fallback to avg_loot if not)
        avg_def_loot = raid_season.get('defensiveReward', 0)
        def_attacks = raid_season.get('defenseLog', [])
        if def_attacks:
            total_def_loot = sum(
                sum(district.get('totalLooted', 0) for district in attack.get('districts', []))
                for attack in def_attacks
            )
            total_def_attacks = sum(
                sum(district.get('attackCount', 0) for district in attack.get('districts', []))
                for attack in def_attacks
            )
            if total_def_attacks > 0:
                avg_def_loot = total_def_loot / total_def_attacks
            else:
                avg_def_loot = avg_loot_per_attack  # Fallback
        else:
            avg_def_loot = avg_loot_per_attack  # Fallback

        # Predict performance
        upper_bound = 5 * math.sqrt(capital_loot + 100000) - 500
        loot_difference = avg_def_loot - avg_loot_per_attack
        deduction_center = loot_difference + 700
        deduction_bottom = (loot_difference + 2000) / 20
        deduction_top = loot_difference / 20 + 1400
        deduction = max(min(max(deduction_center, deduction_bottom), deduction_top), 0)
        predicted_performance = max(upper_bound - deduction, 0)

        # Estimate offensiveReward and defensiveReward based on predicted performance
        predicted_offensive_reward = predicted_performance * 0.8  # Roughly 80% comes from offense
        predicted_defensive_reward = predicted_performance * 0.2  # Roughly 20% comes from defense

        # Fill missing rewards if needed
        if raid_season.get('offensiveReward', 0) == 0:
            raid_season['offensiveReward'] = int(predicted_offensive_reward)
        if raid_season.get('defensiveReward', 0) == 0:
            raid_season['defensiveReward'] = int(predicted_defensive_reward)