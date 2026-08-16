package routes

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
)

const leagueAssetBaseURL = "https://assets.clashk.ing/leagues"

var nonLeagueSlugCharacter = regexp.MustCompile(`[^a-z0-9]+`)

type referenceCatalog struct {
	warLeagues     map[int]modelsv2.LeagueReference
	leagueTiers    map[int]modelsv2.LeagueReference
	builderLeagues map[int]modelsv2.LeagueReference
	capitalLeagues map[int]modelsv2.LeagueReference
}

func newReferenceCatalog(a apptypes.Deps) referenceCatalog {
	catalog := referenceCatalog{
		warLeagues: make(map[int]modelsv2.LeagueReference), leagueTiers: make(map[int]modelsv2.LeagueReference),
		builderLeagues: make(map[int]modelsv2.LeagueReference), capitalLeagues: make(map[int]modelsv2.LeagueReference),
	}
	catalog.warLeagues[cwlUnrankedLeagueID] = modelsv2.LeagueReference{
		ID: cwlUnrankedLeagueID, Name: "Unranked", IconURL: leagueIconURL("cwl", "Unranked"),
	}
	if a.Clash == nil || a.Clash.Client() == nil {
		return catalog
	}
	catalog.warLeagues = buildLeagueReferences(a.Clash.StaticSection("war_leagues"), "cwl")
	catalog.warLeagues[cwlUnrankedLeagueID] = modelsv2.LeagueReference{
		ID: cwlUnrankedLeagueID, Name: "Unranked", IconURL: leagueIconURL("cwl", "Unranked"),
	}
	catalog.leagueTiers = buildLeagueReferences(a.Clash.StaticSection("league_tiers"), "league-tier")
	catalog.builderLeagues = buildLeagueReferences(a.Clash.StaticSection("builder_leagues"), "builder-base")
	catalog.capitalLeagues = buildLeagueReferences(a.Clash.StaticSection("capital_leagues"), "capital-leagues")
	return catalog
}

func buildLeagueReferences(items []map[string]any, folder string) map[int]modelsv2.LeagueReference {
	out := make(map[int]modelsv2.LeagueReference, len(items))
	for _, item := range items {
		id := staticReferenceID(item["_id"])
		name := strings.TrimSpace(staticDataAsString(item["name"]))
		if id == 0 || name == "" {
			continue
		}
		out[id] = modelsv2.LeagueReference{ID: id, Name: name, IconURL: leagueIconURL(folder, name)}
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

func leagueIconURL(folder, name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	for roman, number := range map[string]string{" iii": " 3", " ii": " 2", " iv": " 4", " v": " 5", " i": " 1"} {
		if strings.HasSuffix(slug, roman) {
			slug = strings.TrimSuffix(slug, roman) + number
			break
		}
	}
	slug = strings.Trim(nonLeagueSlugCharacter.ReplaceAllString(slug, "_"), "_")
	return fmt.Sprintf("%s/%s/%s.png", leagueAssetBaseURL, folder, slug)
}

func (c referenceCatalog) warLeague(id int) *modelsv2.LeagueReference {
	return leagueReference(c.warLeagues, id)
}

func (c referenceCatalog) leagueTier(id int) *modelsv2.LeagueReference {
	return leagueReference(c.leagueTiers, id)
}

func (c referenceCatalog) builderLeague(id int) *modelsv2.LeagueReference {
	return leagueReference(c.builderLeagues, id)
}

func (c referenceCatalog) capitalLeague(id int) *modelsv2.LeagueReference {
	return leagueReference(c.capitalLeagues, id)
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
