package routes

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

type v2SortOption struct {
	Field string
	Desc  bool
}

type v2CollectionOptions struct {
	Sort   []v2SortOption
	Fields []string
}

type v2Pagination struct {
	Limit  int
	Offset int
}

func v2CollectionOptionsFromQuery(c *fiber.Ctx, allowedFields []string, defaultSort string) v2CollectionOptions {
	allowed := make(map[string]struct{}, len(allowedFields))
	for _, field := range allowedFields {
		allowed[field] = struct{}{}
	}
	sortOptions := v2ParseSort(c.Query("sort", defaultSort), allowed)
	if len(sortOptions) == 0 && defaultSort != "" {
		sortOptions = v2ParseSort(defaultSort, allowed)
	}
	return v2CollectionOptions{
		Sort:   sortOptions,
		Fields: v2ParseFields(c.Query("fields"), allowed),
	}
}

func v2PaginationFromQuery(c *fiber.Ctx, defaultLimit int, maxLimit int) (v2Pagination, error) {
	limit, err := v2QueryInt(c, "limit", defaultLimit)
	if err != nil {
		return v2Pagination{}, err
	}
	if limit <= 0 {
		return v2Pagination{}, apptypes.Error(http.StatusBadRequest, "limit must be greater than 0")
	}
	if maxLimit > 0 && limit > maxLimit {
		limit = maxLimit
	}

	offset, err := v2QueryInt(c, "offset", 0)
	if err != nil {
		return v2Pagination{}, err
	}
	if offset < 0 {
		return v2Pagination{}, apptypes.Error(http.StatusBadRequest, "offset must be greater than or equal to 0")
	}

	if c.Query("offset") == "" && c.Query("page") != "" {
		page, err := v2QueryInt(c, "page", 1)
		if err != nil {
			return v2Pagination{}, err
		}
		if page <= 0 {
			return v2Pagination{}, apptypes.Error(http.StatusBadRequest, "page must be greater than 0")
		}
		offset = (page - 1) * limit
	}

	return v2Pagination{Limit: limit, Offset: offset}, nil
}

func v2PaginationMeta(p v2Pagination, total int) map[string]any {
	nextOffset := any(nil)
	if p.Offset+p.Limit < total {
		nextOffset = p.Offset + p.Limit
	}
	previousOffset := any(nil)
	if p.Offset > 0 {
		prev := p.Offset - p.Limit
		if prev < 0 {
			prev = 0
		}
		previousOffset = prev
	}
	return map[string]any{
		"limit":           p.Limit,
		"offset":          p.Offset,
		"total":           total,
		"has_more":        p.Offset+p.Limit < total,
		"next_offset":     nextOffset,
		"previous_offset": previousOffset,
	}
}

func v2QueryInt(c *fiber.Ctx, key string, fallback int) (int, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, key+" must be an integer")
	}
	return value, nil
}

func v2ParseSort(raw string, allowed map[string]struct{}) []v2SortOption {
	parts := strings.Split(raw, ",")
	out := make([]v2SortOption, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		desc := strings.HasPrefix(part, "-")
		field := strings.TrimPrefix(part, "-")
		field = strings.TrimPrefix(field, "+")
		if _, ok := allowed[field]; !ok {
			continue
		}
		out = append(out, v2SortOption{Field: field, Desc: desc})
	}
	return out
}

func v2ParseFields(raw string, allowed map[string]struct{}) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		field := strings.TrimSpace(part)
		if field == "" {
			continue
		}
		if _, ok := allowed[field]; !ok {
			continue
		}
		if _, ok := seen[field]; ok {
			continue
		}
		seen[field] = struct{}{}
		out = append(out, field)
	}
	return out
}

func v2SQLOrderBy(sorts []v2SortOption, fields map[string]string, fallback string) string {
	parts := make([]string, 0, len(sorts)+1)
	for _, opt := range sorts {
		expr, ok := fields[opt.Field]
		if !ok {
			continue
		}
		direction := "ASC"
		if opt.Desc {
			direction = "DESC"
		}
		parts = append(parts, fmt.Sprintf("%s %s NULLS LAST", expr, direction))
	}
	if fallback != "" {
		parts = append(parts, fallback)
	}
	return strings.Join(parts, ", ")
}

func v2ApplyMapFields(item map[string]any, fields []string) map[string]any {
	if len(fields) == 0 {
		return item
	}
	out := make(map[string]any, len(fields))
	for _, field := range fields {
		if value, ok := item[field]; ok {
			out[field] = value
		}
	}
	return out
}

func v2SortMaps(items []map[string]any, sorts []v2SortOption) {
	if len(sorts) == 0 {
		return
	}
	sort.SliceStable(items, func(i, j int) bool {
		for _, opt := range sorts {
			cmp := v2CompareValues(items[i][opt.Field], items[j][opt.Field])
			if cmp == 0 {
				continue
			}
			if opt.Desc {
				return cmp > 0
			}
			return cmp < 0
		}
		return false
	})
}

func v2CompareValues(left, right any) int {
	leftTime, leftIsTime := mobileTime(left)
	rightTime, rightIsTime := mobileTime(right)
	if leftIsTime && rightIsTime {
		if leftTime.Before(rightTime) {
			return -1
		}
		if leftTime.After(rightTime) {
			return 1
		}
		return 0
	}

	leftFloat, leftIsNumber := v2FloatValue(left)
	rightFloat, rightIsNumber := v2FloatValue(right)
	if leftIsNumber && rightIsNumber {
		if leftFloat < rightFloat {
			return -1
		}
		if leftFloat > rightFloat {
			return 1
		}
		return 0
	}

	leftText := strings.ToLower(mobileString(left))
	rightText := strings.ToLower(mobileString(right))
	if leftText < rightText {
		return -1
	}
	if leftText > rightText {
		return 1
	}
	return 0
}

func v2FloatValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	default:
		return 0, false
	}
}
