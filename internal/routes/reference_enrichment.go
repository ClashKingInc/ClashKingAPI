package routes

import (
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
)

type referenceCatalog struct {
	warLeagues  map[int]modelsv2.LeagueReference
	leagueTiers map[int]modelsv2.LeagueReference
}

func newReferenceCatalog(a apptypes.Deps) referenceCatalog {
	catalog := referenceCatalog{
		warLeagues:  make(map[int]modelsv2.LeagueReference),
		leagueTiers: make(map[int]modelsv2.LeagueReference),
	}
	catalog.warLeagues[cwlUnrankedLeagueID] = modelsv2.LeagueReference{
		ID: cwlUnrankedLeagueID, Name: "Unranked",
	}
	if a.Clash == nil || a.Clash.Client() == nil {
		return catalog
	}
	catalog.warLeagues = buildLeagueReferences(a.Clash.StaticSection("war_leagues"))
	catalog.warLeagues[cwlUnrankedLeagueID] = modelsv2.LeagueReference{
		ID: cwlUnrankedLeagueID, Name: "Unranked",
	}
	catalog.leagueTiers = buildLeagueReferences(a.Clash.StaticSection("league_tiers"))
	return catalog
}

func buildLeagueReferences(items []map[string]any) map[int]modelsv2.LeagueReference {
	out := make(map[int]modelsv2.LeagueReference, len(items))
	for _, item := range items {
		id := staticReferenceID(item["_id"])
		name := strings.TrimSpace(staticDataAsString(item["name"]))
		if id == 0 || name == "" {
			continue
		}
		out[id] = modelsv2.LeagueReference{ID: id, Name: name}
	}
	return out
}

func staticReferenceID(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	case string:
		parsed, _ := strconv.Atoi(typed)
		return parsed
	default:
		return 0
	}
}

func (c referenceCatalog) warLeague(id int) *modelsv2.LeagueReference {
	return leagueReference(c.warLeagues, id)
}

func (c referenceCatalog) leagueTier(id int) *modelsv2.LeagueReference {
	return leagueReference(c.leagueTiers, id)
}

func leagueReference(items map[int]modelsv2.LeagueReference, id int) *modelsv2.LeagueReference {
	reference, ok := items[id]
	if !ok {
		return nil
	}
	return &reference
}

func publicBadgeURLsFromToken(token string) modelsv2.PublicBadgeURLs {
	return modelsv2.PublicBadgeURLs{
		Small: badgeURL(token, 70), Medium: badgeURL(token, 200), Large: badgeURL(token, 512),
	}
}
