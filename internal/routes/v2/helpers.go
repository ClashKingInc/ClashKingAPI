package v2

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var (
	serverRoleCollections = map[string]string{
		"townhall":        "townhallroles",
		"league":          "legendleagueroles",
		"builderhall":     "builderhallroles",
		"builder_league":  "builderleagueroles",
		"achievement":     "achievementroles",
		"family_position": "family_roles",
	}
	serverSettingsEvalCollections = map[string]string{
		"league_roles":          "legendleagueroles",
		"ignored_roles":         "evalignore",
		"family_roles":          "generalrole",
		"not_family_roles":      "linkrole",
		"only_family_roles":     "familyexclusiveroles",
		"family_position_roles": "family_roles",
		"townhall_roles":        "townhallroles",
		"builderhall_roles":     "builderhallroles",
		"achievement_roles":     "achievementroles",
		"status_roles":          "statusroles",
		"builder_league_roles":  "builderleagueroles",
	}
	familyRoleCollections = map[string]string{
		"general":          "generalrole",
		"not_family":       "linkrole",
		"family_exclusive": "familyexclusiveroles",
		"family_position":  "family_roles",
		"ignored":          "evalignore",
	}
	countdownDBFields = map[string]string{
		"cwl":          "cwlCountdown",
		"clan_games":   "gamesCountdown",
		"raid_weekend": "raidCountdown",
		"eos":          "eosCountdown",
		"member_count": "memberCountWarning",
		"season_day":   "seasonCountdown",
		"war_score":    "warCountdown",
		"war_timer":    "warTimerCountdown",
	}
	serverCountdownTypes = []string{"cwl", "clan_games", "raid_weekend", "eos", "member_count", "season_day"}
	clanCountdownTypes   = []string{"war_score", "war_timer"}
	logMapping           = map[string]string{
		"join_log":               "join_leave_log",
		"leave_log":              "join_leave_log",
		"donation_log":           "donation_log",
		"clan_achievement_log":   "clan_achievement_log",
		"clan_requirements_log":  "clan_requirements_log",
		"clan_description_log":   "clan_description_log",
		"war_log":                "war_log",
		"war_panel":              "war_panel",
		"cwl_lineup_change_log":  "cwl_lineup_change_log",
		"capital_donations":      "capital_donation_log",
		"capital_attacks":        "capital_raid_log",
		"raid_panel":             "raid_panel",
		"capital_weekly_summary": "capital_weekly_summary",
		"role_change":            "player_upgrade_log",
		"th_upgrade":             "player_upgrade_log",
		"troop_upgrade":          "player_upgrade_log",
		"hero_upgrade":           "player_upgrade_log",
		"spell_upgrade":          "player_upgrade_log",
		"hero_equipment_upgrade": "player_upgrade_log",
		"super_troop_boost":      "player_upgrade_log",
		"league_change":          "player_upgrade_log",
		"name_change":            "player_upgrade_log",
		"legend_log_attacks":     "legend_log",
		"legend_log_defenses":    "legend_log",
	}
	apiToDBLogMapping = map[string][]string{
		"join_leave_log":         {"join_log", "leave_log"},
		"donation_log":           {"donation_log"},
		"clan_achievement_log":   {"clan_achievement_log"},
		"clan_requirements_log":  {"clan_requirements_log"},
		"clan_description_log":   {"clan_description_log"},
		"war_log":                {"war_log"},
		"war_panel":              {"war_panel"},
		"cwl_lineup_change_log":  {"cwl_lineup_change_log"},
		"capital_donation_log":   {"capital_donations"},
		"capital_raid_log":       {"capital_attacks"},
		"raid_panel":             {"raid_panel"},
		"capital_weekly_summary": {"capital_weekly_summary"},
		"player_upgrade_log": {
			"th_upgrade", "troop_upgrade", "hero_upgrade", "spell_upgrade",
			"hero_equipment_upgrade", "super_troop_boost", "role_change",
			"league_change", "name_change",
		},
		"legend_log": {"legend_log_attacks", "legend_log_defenses"},
	}
)

func pathInt(c *fiber.Ctx, key string) (int, error) {
	value := c.Params(key)
	out, err := strconv.Atoi(value)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid "+key)
	}
	return out, nil
}

func objectID(raw string) (bson.ObjectID, error) {
	id, err := bson.ObjectIDFromHex(raw)
	if err != nil {
		return bson.ObjectID{}, apptypes.Error(http.StatusBadRequest, "invalid object id")
	}
	return id, nil
}

func findOneMap(ctx context.Context, collection *mongo.Collection, filter any) (map[string]any, error) {
	var out map[string]any
	err := collection.FindOne(ctx, filter).Decode(&out)
	return out, err
}

func findManyMaps(ctx context.Context, collection *mongo.Collection, filter any) ([]map[string]any, error) {
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var out []map[string]any
	if err := cursor.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func flattenForMongo(input map[string]any, prefix string) bson.M {
	out := bson.M{}
	for key, value := range input {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		if nested, ok := value.(map[string]any); ok {
			for nestedKey, nestedValue := range flattenForMongo(nested, path) {
				out[nestedKey] = nestedValue
			}
			continue
		}
		out[path] = value
	}
	return out
}

func sanitize(value any) any {
	switch typed := value.(type) {
	case []map[string]any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item).(map[string]any))
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item))
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			if key == "_id" {
				continue
			}
			out[key] = sanitize(item)
		}
		return out
	case bson.D:
		out := make(map[string]any, len(typed))
		for _, e := range typed {
			if e.Key == "_id" {
				continue
			}
			out[e.Key] = sanitize(e.Value)
		}
		return out
	case bson.A:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item))
		}
		return out
	case bson.ObjectID:
		return typed.Hex()
	default:
		return typed
	}
}

func roleCollection(rt apptypes.Deps, roleType string) *mongo.Collection {
	name := serverRoleCollections[roleType]
	if name == "" {
		return nil
	}
	return rt.Store.DB.Usafam.Collection(name)
}

func sanitizeObjectID(value any) any {
	if id, ok := value.(bson.ObjectID); ok {
		return id.Hex()
	}
	return value
}

func serverNormalizeTag(tag string) string {
	tag = apptypes.NormalizeTag(strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(tag, "#"))))
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func serverAsString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func asIntWithDefault(value any, fallback int) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return fallback
	}
}

func numericMaybe(raw string) any {
	if value, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return value
	}
	return raw
}

func toStringMaybe(value any) any {
	if value == nil {
		return nil
	}
	return serverAsString(value)
}

func notFoundErr(err error, message string) error {
	if err == mongo.ErrNoDocuments {
		return apptypes.Error(http.StatusNotFound, message)
	}
	return err
}

func randomID(seed string, n int) string {
	seed = strings.ToUpper(strings.ReplaceAll(seed, "#", "X"))
	if len(seed) >= n {
		return seed[:n]
	}
	if len(seed) == 0 {
		seed = "STRIKE"
	}
	for len(seed) < n {
		seed += "X"
	}
	return seed[:n]
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
