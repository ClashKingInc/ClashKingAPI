import copy
from typing import Optional
from fastapi import Request, APIRouter
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import aiohttp

router = APIRouter(tags=["War Timeline"])
templates = Jinja2Templates(directory="templates")

def extract_attacks(war_data):
    all_attacks = []
    clan = war_data["clan"]
    opponent = war_data["opponent"]

    # Extract clan attacks
    for m in clan["members"]:
        for a in m.get("attacks", []):
            all_attacks.append({
                "attackerClan": "clan",
                "attackerTag": a["attackerTag"],
                "defenderTag": a["defenderTag"],
                "stars": a["stars"],
                "destructionPercentage": a["destructionPercentage"],
                "order": a["order"],
                "duration": a.get("duration", 0)
            })

    # Extract opponent attacks
    for m in opponent["members"]:
        for a in m.get("attacks", []):
            all_attacks.append({
                "attackerClan": "opponent",
                "attackerTag": a["attackerTag"],
                "defenderTag": a["defenderTag"],
                "stars": a["stars"],
                "destructionPercentage": a["destructionPercentage"],
                "order": a["order"],
                "duration": a.get("duration", 0)
            })

    return sorted(all_attacks, key=lambda x: x["order"])

def initialize_member_stats(members):
    member_stats = {}
    for m in members:
        member_stats[m["tag"]] = {
            "tag": m["tag"],
            "attacks_used": 0,
            "defenses_used": 0
        }
    return member_stats

def compute_timeline(war_data):
    clan = war_data["clan"]
    opponent = war_data["opponent"]
    attacks_per_member = war_data.get("attacksPerMember", 1)
    team_size = war_data["teamSize"]

    all_attacks = extract_attacks(war_data)

    # Initialize cumulative stats
    clan_stars = 0
    clan_destruction = 0.0
    clan_attacks_used = 0

    opponent_stars = 0
    opponent_destruction = 0.0
    opponent_attacks_used = 0

    clan_members_stats = initialize_member_stats(clan["members"])
    opponent_members_stats = initialize_member_stats(opponent["members"])

    sum_clan_destruction = 0.0
    sum_opponent_destruction = 0.0

    war_timeline = [{
        "order": 0,
        "clan_stars": 0,
        "clan_destruction": 0.0,
        "clan_attacks_used": 0,
        "opponent_stars": 0,
        "opponent_destruction": 0.0,
        "opponent_attacks_used": 0,
        "clan_members": copy.deepcopy(list(clan_members_stats.values())),
        "opponent_members": copy.deepcopy(list(opponent_members_stats.values())),
        "last_attack": None
    }]

    for attack in all_attacks:
        if attack["attackerClan"] == "clan":
            clan_stars += attack["stars"]
            sum_clan_destruction += attack["destructionPercentage"]
            clan_attacks_used += 1

            if attack["attackerTag"] in clan_members_stats:
                clan_members_stats[attack["attackerTag"]]["attacks_used"] += 1
            if attack["defenderTag"] in opponent_members_stats:
                opponent_members_stats[attack["defenderTag"]]["defenses_used"] += 1

        else:
            opponent_stars += attack["stars"]
            sum_opponent_destruction += attack["destructionPercentage"]
            opponent_attacks_used += 1

            if attack["attackerTag"] in opponent_members_stats:
                opponent_members_stats[attack["attackerTag"]]["attacks_used"] += 1
            if attack["defenderTag"] in clan_members_stats:
                clan_members_stats[attack["defenderTag"]]["defenses_used"] += 1

        clan_destruction = (sum_clan_destruction / (team_size * 100)) * 100
        opponent_destruction = (sum_opponent_destruction / (team_size * 100)) * 100

        war_timeline.append({
            "order": attack["order"],
            "clan_stars": clan_stars,
            "clan_destruction": clan_destruction,
            "clan_attacks_used": clan_attacks_used,
            "opponent_stars": opponent_stars,
            "opponent_destruction": opponent_destruction,
            "opponent_attacks_used": opponent_attacks_used,
            "clan_members": copy.deepcopy(list(clan_members_stats.values())),
            "opponent_members": copy.deepcopy(list(opponent_members_stats.values())),
            "last_attack": attack
        })

    return war_timeline

@router.get("/timeline/{clan_tag}", response_class=HTMLResponse)
@router.get("/timeline/{clan_tag}/{timestamp}", response_class=HTMLResponse)
async def get_war(request: Request, clan_tag: str, timestamp: Optional[str] = None):
    war_data = None
    if timestamp is None:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://proxy.clashk.ing/v1/clans/{clan_tag.replace('#','%23')}/currentwar") as response:
                if response.status == 200:
                    war_data = await response.json()
    else:
        # Fetch specific war by timestamp
        async with aiohttp.ClientSession() as session:
            async with session.get(
                    f"https://api.clashk.ing/war/{clan_tag.replace('#', '%23')}/previous/{timestamp}") as response:
                if response.status == 200:
                    war_data = await response.json()

    # If no war_data found even after all logic
    if war_data is None:
        return HTMLResponse("<h1>No war data available</h1>", status_code=404)

    # Ensure clan/opponent orientation
    if war_data["clan"]["tag"] != clan_tag:
        tmp = war_data["clan"]
        war_data["clan"] = war_data["opponent"]
        war_data["opponent"] = tmp

    war_timeline = compute_timeline(war_data)

    wars_available = []

    return templates.TemplateResponse(
        "war.html",
        {
            "request": request,
            "war_timeline": war_timeline,
            "clan": war_data["clan"],
            "opponent": war_data["opponent"],
            "attacks_per_member": war_data.get("attacksPerMember", 1),
            "wars_available": wars_available,
            "selected_timestamp": timestamp,
            "clan_tag": clan_tag
        }
    )