package routes

import (
	"net/url"
	"slices"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

var categories = map[string]categoryMeta{
	"buildings":           {SupportsVillage: true, SupportsType: true},
	"traps":               {SupportsVillage: true},
	"troops":              {SupportsVillage: true, SupportsCategory: true},
	"guardians":           {},
	"spells":              {SupportsVillage: true},
	"heroes":              {SupportsVillage: true},
	"pets":                {},
	"equipment":           {},
	"decorations":         {},
	"obstacles":           {},
	"sceneries":           {},
	"skins":               {},
	"capital_house_parts": {},
	"capital_leagues":     {},
	"helpers":             {},
	"war_leagues":         {},
	"league_tiers":        {},
	"achievements":        {},
}

var locales = []string{"EN", "AR", "CN", "CNT", "DE", "ES", "FA", "FI", "FR", "ID", "IT", "JP", "KR", "MS", "NL", "NO", "PL", "PT", "RU", "TH", "TR", "VI"}
var levelCategories = []string{"buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "helpers", "achievements"}

const appStaticDataIconBaseURL = "https://coc-assets.clashk.ing"

type categoryMeta struct {
	SupportsVillage  bool
	SupportsType     bool
	SupportsCategory bool
}

// listCategories returns the available static data categories.
//
// @Summary Get static categories
// @Description Returns all available static data categories and item counts.
// @Produce json
// @Success 200 {object} map[string]interface{}
func listCategories(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := a.Clash.Client().StaticData().Raw
		out := make([]map[string]any, 0, len(categories))
		for category := range categories {
			out = append(out, map[string]any{"name": category, "count": len(raw[category])})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"categories": out})
	}
}

// categoryItems returns filtered category items.
//
// @Summary Get category items
// @Description Returns static items for a category, with optional filters applied.
// @Produce json
// @Param category path string true "Category name"
// @Param locale query string false "Locale code"
// @Param name query string false "Substring to filter item names"
// @Param village query string false "Village filter"
// @Param type query string false "Type filter"
// @Param category query string false "Category filter"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
func categoryItems(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		items, err := filteredItems(a, c)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

// categoryNames returns the names of filtered static items.
//
// @Summary Get category names
// @Description Returns the names of static items for a category, with optional filters applied.
// @Produce json
// @Param category path string true "Category name"
// @Param locale query string false "Locale code"
// @Param name query string false "Substring to filter item names"
// @Param village query string false "Village filter"
// @Param type query string false "Type filter"
// @Param category query string false "Category filter"
// @Success 200 {array} string
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/static/{category}/names [get]
func categoryNames(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		items, err := filteredItems(a, c)
		if err != nil {
			return err
		}
		out := make([]string, 0, len(items))
		for _, item := range items {
			if name, _ := item["name"].(string); name != "" {
				out = append(out, name)
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, out)
	}
}

// categoryItem returns a single static item by ID or name.
//
// @Summary Get category item by id
// @Description Returns a static data item resolved by item ID or name.
// @Produce json
// @Param category path string true "Category name"
// @Param item_id_or_name path string true "Item ID or name"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} modelsv2.ErrorResponse
func categoryItem(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := findItem(a, c.Params("category"), c.Params("item_id_or_name"))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// maxLevel returns the maximum level for a leveled static item.
//
// @Summary Get item max level
// @Description Returns the highest level defined for a static item.
// @Produce json
// @Param category path string true "Category name"
// @Param item_id_or_name path string true "Item ID or name"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/static/{category}/{item_id_or_name}/max-level [get]
func maxLevel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		category := c.Params("category")
		if !slices.Contains(levelCategories, category) {
			return apptypes.Error(fiber.StatusBadRequest, "Category '"+category+"' does not support levels. Eligible categories: "+strings.Join(levelCategories, ", "))
		}
		item, err := findItem(a, category, c.Params("item_id_or_name"))
		if err != nil {
			return err
		}
		maxLevel := extractMaxLevel(item)
		if maxLevel == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Could not extract level numbers from item '"+item["name"].(string)+"' in category '"+category+"'")
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"name": item["name"], "max_level": maxLevel})
	}
}

// appStaticDataBundle godoc
// @Summary Get mobile app static data bundle
// @Description Returns the static-data bundle used by mobile clients.
// @Produce json
// @Success 200 {object} map[string]interface{}
func appStaticDataBundle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := a.Clash.Client().StaticData().Raw
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"troops_data":          map[string]any{"troops": buildAppTroopsData(raw["troops"])},
			"heroes_data":          map[string]any{"heroes": buildAppHeroesData(raw["heroes"])},
			"spells_data":          map[string]any{"spells": buildAppSpellsData(raw["spells"])},
			"pets_data":            map[string]any{"pets": buildAppPetsData(raw["pets"])},
			"gears_data":           map[string]any{"gears": buildAppEquipmentData(raw["equipment"])},
			"league_data":          map[string]any{"leagues": buildAppLeagueData(raw["war_leagues"], raw["league_tiers"])},
			"player_league_data":   map[string]any{"leagues": buildNamedAppData(raw["league_tiers"], nil)},
			"war_leagues_data":     map[string]any{"leagues": buildNamedAppData(raw["war_leagues"], nil)},
			"capital_leagues_data": map[string]any{"leagues": buildNamedAppData(raw["capital_leagues"], nil)},
			"game_data":            map[string]any{"max_TownHall": appMaxTownHallLevel(raw["buildings"])},
		})
	}
}

// appStaticTranslations returns a compact locale-specific translation pack for app static data.
//
// @Summary Get app static translations
// @Description Returns locale-specific translations keyed by TID for the static-data app bundle.
// @Produce json
// @Param locale query string true "Locale code"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
func appStaticTranslations(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		locale := strings.ToUpper(c.Query("locale"))
		if locale == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Missing required locale query parameter")
		}
		if !slices.Contains(locales, locale) {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid locale '"+locale+"'. Available locales: "+strings.Join(locales, ", "))
		}

		raw := a.Clash.Client().StaticData().Raw
		translations := a.Clash.Client().StaticData().Translations
		tids := collectAppBundleTIDs(raw)
		pack := make(map[string]string, len(tids))
		for tid := range tids {
			if translated := translations[tid][locale]; translated != "" {
				pack[tid] = translated
			}
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"locale":       locale,
			"translations": pack,
		})
	}
}

func filteredItems(a apptypes.Deps, c *fiber.Ctx) ([]map[string]any, error) {
	category := c.Params("category")
	meta, ok := categories[category]
	if !ok {
		return nil, apptypes.Error(fiber.StatusNotFound, "Category '"+category+"' not found. Available categories: "+strings.Join(categoryNamesList(), ", "))
	}
	locale := strings.ToUpper(c.Query("locale"))
	if locale != "" && !slices.Contains(locales, locale) {
		return nil, apptypes.Error(fiber.StatusBadRequest, "Invalid locale '"+locale+"'. Available locales: "+strings.Join(locales, ", "))
	}
	rawItems := a.Clash.Client().StaticData().Raw[category]
	items := make([]map[string]any, 0, len(rawItems))
	for _, item := range rawItems {
		items = append(items, clone(item))
	}
	if locale != "" {
		translate(items, locale, a.Clash.Client().StaticData().Translations)
	}
	name := strings.ToLower(c.Query("name"))
	village := strings.ToLower(c.Query("village"))
	kind := c.Query("type")
	categoryFilter := c.Query("category")
	filtered := items[:0]
	for _, item := range items {
		if name != "" && !strings.Contains(strings.ToLower(staticDataAsString(item["name"])), name) {
			continue
		}
		if village != "" && meta.SupportsVillage && strings.ToLower(staticDataAsString(item["village"])) != village {
			continue
		}
		if kind != "" && meta.SupportsType && staticDataAsString(item["type"]) != kind {
			continue
		}
		if categoryFilter != "" && meta.SupportsCategory && staticDataAsString(item["category"]) != categoryFilter {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered, nil
}

func findItem(a apptypes.Deps, category, itemID string) (map[string]any, error) {
	if decoded, err := url.PathUnescape(itemID); err == nil {
		itemID = decoded
	}
	if _, ok := categories[category]; !ok {
		return nil, apptypes.Error(fiber.StatusNotFound, "Category '"+category+"' not found. Available categories: "+strings.Join(categoryNamesList(), ", "))
	}
	items := a.Clash.Client().StaticData().Raw[category]
	if id, err := strconv.Atoi(itemID); err == nil {
		for _, item := range items {
			if int(asFloat(item["_id"])) == id {
				return clone(item), nil
			}
		}
	}
	for _, item := range items {
		if strings.EqualFold(staticDataAsString(item["name"]), itemID) {
			return clone(item), nil
		}
	}
	return nil, apptypes.Error(fiber.StatusNotFound, "Item with ID or name '"+itemID+"' not found in category '"+category+"'")
}

func translate(items []map[string]any, locale string, translations map[string]map[string]string) {
	for _, item := range items {
		tid, _ := item["TID"].(map[string]any)
		name := staticDataAsString(tid["name"])
		if translated := translations[name][locale]; translated != "" {
			item["name"] = translated
		}
	}
}

func clone(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func buildAppTroopsData(items []map[string]any) map[string]any {
	return buildNamedAppData(items, func(item map[string]any) {
		item["type"] = appTroopType(item)
	})
}

func buildAppHeroesData(items []map[string]any) map[string]any {
	return buildNamedAppData(items, func(item map[string]any) {
		if staticDataAsString(item["village"]) == "builderBase" {
			item["type"] = "bb-hero"
			return
		}
		item["type"] = "hero"
	})
}

func buildAppSpellsData(items []map[string]any) map[string]any {
	return buildNamedAppData(items, func(item map[string]any) {
		item["type"] = "spell"
		item["elixir"] = appSpellElixirType(item)
		if staticDataAsString(item["village"]) == "" {
			item["village"] = "home"
		}
	})
}

func buildAppPetsData(items []map[string]any) map[string]any {
	return buildNamedAppData(items, func(item map[string]any) {
		item["type"] = "pet"
		if staticDataAsString(item["village"]) == "" {
			item["village"] = "home"
		}
	})
}

func buildAppEquipmentData(items []map[string]any) map[string]any {
	return buildNamedAppData(items, func(item map[string]any) {
		rawRarity := staticDataAsString(item["rarity"])
		item["type"] = "gear"
		item["rarity_label"] = rawRarity
		item["rarity"] = appEquipmentRarityCode(rawRarity)
		if staticDataAsString(item["village"]) == "" {
			item["village"] = "home"
		}
	})
}

func buildAppLeagueData(warLeagues []map[string]any, leagueTiers []map[string]any) map[string]any {
	out := buildNamedAppData(warLeagues, nil)
	for _, rawItem := range leagueTiers {
		name := staticDataAsString(rawItem["name"])
		if name != "Unranked" {
			continue
		}
		item := clone(rawItem)
		if iconURL := appItemIconURL(rawItem); iconURL != "" {
			item["url"] = iconURL
		}
		out[name] = item
	}
	return out
}

func buildNamedAppData(items []map[string]any, enrich func(map[string]any)) map[string]any {
	out := make(map[string]any, len(items))
	for _, rawItem := range items {
		name := staticDataAsString(rawItem["name"])
		if name == "" {
			continue
		}
		item := clone(rawItem)
		item["maxLevel"] = extractMaxLevel(rawItem)
		if iconURL := appItemIconURL(rawItem); iconURL != "" {
			item["url"] = iconURL
		}
		if enrich != nil {
			enrich(item)
		}
		out[name] = item
	}
	return out
}

func collectAppBundleTIDs(raw map[string][]map[string]any) map[string]struct{} {
	tids := make(map[string]struct{})
	for _, category := range []string{
		"troops",
		"heroes",
		"spells",
		"pets",
		"equipment",
		"war_leagues",
		"league_tiers",
		"capital_leagues",
	} {
		for _, item := range raw[category] {
			collectTIDs(item, tids)
		}
	}
	return tids
}

func collectTIDs(value any, tids map[string]struct{}) {
	switch current := value.(type) {
	case map[string]any:
		for key, nested := range current {
			if key == "TID" {
				if tidMap, ok := nested.(map[string]any); ok {
					for _, tidValue := range tidMap {
						if tid := staticDataAsString(tidValue); tid != "" {
							tids[tid] = struct{}{}
						}
					}
				}
				continue
			}
			collectTIDs(nested, tids)
		}
	case []any:
		for _, nested := range current {
			collectTIDs(nested, tids)
		}
	}
}

func appItemIconURL(item map[string]any) string {
	icon := strings.TrimPrefix(staticDataAsString(item["icon"]), "/")
	if icon == "" {
		return ""
	}
	return appStaticDataIconBaseURL + "/" + icon
}

func extractMaxLevel(item map[string]any) int {
	rawLevels, ok := item["levels"].([]any)
	if !ok || len(rawLevels) == 0 {
		return 0
	}
	maxLevel := 0
	for _, rawLevel := range rawLevels {
		switch value := rawLevel.(type) {
		case map[string]any:
			if level, ok := value["level"].(float64); ok && int(level) > maxLevel {
				maxLevel = int(level)
			}
		case float64:
			if int(value) > maxLevel {
				maxLevel = int(value)
			}
		}
	}
	return maxLevel
}

func appTroopType(item map[string]any) string {
	if staticDataAsString(item["village"]) == "builderBase" {
		return "bb-troop"
	}
	if item["super_troop"] != nil {
		return "super-troop"
	}
	if strings.EqualFold(staticDataAsString(item["production_building"]), "Workshop") {
		return "siege-machine"
	}
	return "troop"
}

func appSpellElixirType(item map[string]any) string {
	if strings.EqualFold(staticDataAsString(item["upgrade_resource"]), "Dark Elixir") {
		return "dark"
	}
	return "basic"
}

func appEquipmentRarityCode(rarity string) string {
	switch strings.ToLower(rarity) {
	case "epic":
		return "2"
	case "common":
		return "1"
	default:
		return "1"
	}
}

func appMaxTownHallLevel(items []map[string]any) int {
	for _, item := range items {
		if strings.EqualFold(staticDataAsString(item["name"]), "Town Hall") {
			return extractMaxLevel(item)
		}
	}
	return 0
}

func staticDataAsString(v any) string {
	value, _ := v.(string)
	return value
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	default:
		return 0
	}
}

func categoryNamesList() []string {
	out := make([]string, 0, len(categories))
	for category := range categories {
		out = append(out, category)
	}
	slices.Sort(out)
	return out
}
