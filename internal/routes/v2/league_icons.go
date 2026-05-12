package v2

import (
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
)

func leagueIconLookup(a apptypes.Deps) map[string]*clashy.Icon {
	if a.Clash == nil || a.Clash.Client() == nil {
		return nil
	}
	raw := a.Clash.Client().StaticData().Raw
	return buildLeagueIconLookup(raw["war_leagues"], raw["league_tiers"])
}

func buildLeagueIconLookup(warLeagues []map[string]any, leagueTiers []map[string]any) map[string]*clashy.Icon {
	out := make(map[string]*clashy.Icon, len(warLeagues)+1)
	appendLeagueIconsFromStaticData(out, warLeagues, nil)
	appendLeagueIconsFromStaticData(out, leagueTiers, map[string]struct{}{"Unranked": {}})
	return out
}

func appendLeagueIconsFromStaticData(out map[string]*clashy.Icon, items []map[string]any, allowedNames map[string]struct{}) {
	for _, item := range items {
		name := strings.TrimSpace(staticDataAsString(item["name"]))
		if name == "" {
			continue
		}
		if allowedNames != nil {
			if _, ok := allowedNames[name]; !ok {
				continue
			}
		}
		icon := staticLeagueIcon(item)
		if icon == nil {
			continue
		}
		out[name] = icon
	}
}

func staticLeagueIcon(item map[string]any) *clashy.Icon {
	iconURL := appItemIconURL(item)
	if iconURL == "" {
		return nil
	}
	return &clashy.Icon{
		Small:  iconURL,
		Medium: iconURL,
		Tiny:   iconURL,
	}
}

func mergeLeagueIcon(existing *clashy.Icon, fallback *clashy.Icon) *clashy.Icon {
	if fallback == nil {
		return existing
	}
	out := clashy.Icon{}
	if existing != nil {
		out = *existing
	}
	if out.Small == "" {
		out.Small = fallback.Small
	}
	if out.Medium == "" {
		out.Medium = fallback.Medium
	}
	if out.Tiny == "" {
		out.Tiny = fallback.Tiny
	}
	return &out
}

func mergeLeagueIconMap(existing map[string]any, fallback *clashy.Icon) map[string]any {
	if fallback == nil {
		return existing
	}
	out := make(map[string]any, len(existing)+3)
	for key, value := range existing {
		out[key] = value
	}
	if warAsString(out["small"]) == "" && fallback.Small != "" {
		out["small"] = fallback.Small
	}
	if warAsString(out["medium"]) == "" && fallback.Medium != "" {
		out["medium"] = fallback.Medium
	}
	if warAsString(out["tiny"]) == "" && fallback.Tiny != "" {
		out["tiny"] = fallback.Tiny
	}
	return out
}

func enrichClanLeagueIcons(clan *clashy.Clan, icons map[string]*clashy.Icon) *clashy.Clan {
	if clan == nil || clan.WarLeague == nil {
		return clan
	}
	clan.WarLeague.Icon = mergeLeagueIcon(clan.WarLeague.Icon, icons[strings.TrimSpace(clan.WarLeague.Name)])
	return clan
}

func enrichLeagueMapIcons(league map[string]any, icons map[string]*clashy.Icon) map[string]any {
	if len(league) == 0 {
		return league
	}
	fallback := icons[strings.TrimSpace(warAsString(league["name"]))]
	if fallback == nil {
		return league
	}
	out := mapsClone(league)
	out["iconUrls"] = mergeLeagueIconMap(mobileMap(out["iconUrls"]), fallback)
	return out
}

func enrichClanPayloadLeagueIcons(clan map[string]any, icons map[string]*clashy.Icon) map[string]any {
	if len(clan) == 0 {
		return clan
	}
	out := mapsClone(clan)
	if warLeague := mobileMap(out["warLeague"]); len(warLeague) > 0 {
		out["warLeague"] = enrichLeagueMapIcons(warLeague, icons)
	}
	return out
}

func enrichLeagueInfoIcons(leagueInfo map[string]any, icons map[string]*clashy.Icon) map[string]any {
	if len(leagueInfo) == 0 {
		return leagueInfo
	}
	out := mapsClone(leagueInfo)
	if fallback := icons[strings.TrimSpace(warAsString(out["war_league"]))]; fallback != nil {
		out["iconUrls"] = mergeLeagueIconMap(mobileMap(out["iconUrls"]), fallback)
	}
	clans := mobileList(out["clans"])
	if len(clans) == 0 {
		return out
	}
	enrichedClans := make([]any, 0, len(clans))
	for _, rawClan := range clans {
		clan := mobileMap(rawClan)
		if len(clan) == 0 {
			enrichedClans = append(enrichedClans, rawClan)
			continue
		}
		enrichedClans = append(enrichedClans, enrichClanPayloadLeagueIcons(clan, icons))
	}
	out["clans"] = enrichedClans
	return out
}
