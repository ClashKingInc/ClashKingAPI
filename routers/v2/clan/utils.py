import statistics
from collections import defaultdict, Counter


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
