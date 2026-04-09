package v2

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
	"helpers":             {},
	"war_leagues":         {},
	"league_tiers":        {},
	"achievements":        {},
}

var locales = []string{"EN", "AR", "CN", "CNT", "DE", "ES", "FA", "FI", "FR", "ID", "IT", "JP", "KR", "MS", "NL", "NO", "PL", "PT", "RU", "TH", "TR", "VI"}
var levelCategories = []string{"buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "helpers", "achievements"}

type categoryMeta struct {
	SupportsVillage  bool
	SupportsType     bool
	SupportsCategory bool
}

// listCategories returns the available static data categories.
//
// @Summary Get static categories
// @Description Returns all available static data categories and item counts.
// @Tags Static Data
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/categories [get]
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
// @Tags Static Data
// @Produce json
// @Param category path string true "Category name"
// @Param locale query string false "Locale code"
// @Param name query string false "Substring to filter item names"
// @Param village query string false "Village filter"
// @Param type query string false "Type filter"
// @Param category query string false "Category filter"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{category} [get]
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
// @Tags Static Data
// @Produce json
// @Param category path string true "Category name"
// @Param locale query string false "Locale code"
// @Param name query string false "Substring to filter item names"
// @Param village query string false "Village filter"
// @Param type query string false "Type filter"
// @Param category query string false "Category filter"
// @Success 200 {array} string
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{category}/names [get]
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
// @Tags Static Data
// @Produce json
// @Param category path string true "Category name"
// @Param item_id_or_name path string true "Item ID or name"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{category}/{item_id_or_name} [get]
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
// @Tags Static Data
// @Produce json
// @Param category path string true "Category name"
// @Param item_id_or_name path string true "Item ID or name"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{category}/{item_id_or_name}/maxlevel [get]
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
		rawLevels, ok := item["levels"].([]any)
		if !ok || len(rawLevels) == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Item '"+item["name"].(string)+"' in category '"+category+"' has no levels defined")
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
		if maxLevel == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Could not extract level numbers from item '"+item["name"].(string)+"' in category '"+category+"'")
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"name": item["name"], "max_level": maxLevel})
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
