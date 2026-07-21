package server

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func pathInt(c *fiber.Ctx, key string) (int, error) {
	value := c.Params(key)
	out, err := strconv.Atoi(value)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid "+key)
	}
	return out, nil
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
	default:
		return typed
	}
}

func mapMaybe(value any) map[string]any {
	if sanitized, ok := sanitize(value).(map[string]any); ok {
		return sanitized
	}
	return map[string]any{}
}

func anyMapSlice(value any) []map[string]any {
	raw := anySlice(value)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if cast := mapMaybe(item); len(cast) > 0 {
			out = append(out, cast)
		}
	}
	return out
}

func serverNormalizeTag(tag string) string {
	if decoded, err := url.PathUnescape(tag); err == nil {
		tag = decoded
	}
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
	case nil:
		return ""
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

func boolPtrMaybe(value any) *bool {
	typed, ok := value.(bool)
	if !ok {
		return nil
	}
	return &typed
}

func intPtrMaybe(value any) *int {
	if value == nil {
		return nil
	}
	parsed := asIntWithDefault(value, -1)
	if parsed < 0 {
		return nil
	}
	return &parsed
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
	if err != nil {
		return apptypes.Error(http.StatusNotFound, message)
	}
	return nil
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

func asInt64(value any) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int32:
		return int64(typed)
	case int64:
		return typed
	case float64:
		return int64(typed)
	default:
		return 0
	}
}
