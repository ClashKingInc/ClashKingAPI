import requests
clan_tag = "2GGUJ82UL"
data = requests.get(f"https://api.clashk.ing/war/{clan_tag}/previous?limit=100")
data = data.json()
destruction = 0
wars = 0
for war in data.get("items"):
    if war.get("tag"):
        continue
    clan, opponent = war["clan"], war["opponent"]
    clan = clan if clan["tag"] == clan_tag else opponent
    wars += 1
    destruction += clan.get("destructionPercentage")
print(f"Average Destruction: {destruction/wars}", f"wars: {wars}")

