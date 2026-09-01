package legacy

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type discordLinksDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type discordLinksLookup func(context.Context, []string, []string) (map[string]json.Number, error)

func discordLinks(deps apptypes.Deps) fiber.Handler {
	return discordLinksHandler(func(ctx context.Context, discordIDs, tags []string) (map[string]json.Number, error) {
		if deps.Store == nil || deps.Store.SQL == nil {
			return nil, apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
		}
		return queryDiscordLinks(ctx, deps.Store.SQL, discordIDs, tags)
	})
}

func discordLinksHandler(lookup discordLinksLookup) fiber.Handler {
	return func(c *fiber.Ctx) error {
		discordIDs, tags, err := legacyDiscordLinkInputs(c.Body())
		if err != nil {
			return err
		}
		if len(discordIDs) == 0 && len(tags) == 0 {
			return apptypes.JSON(c, http.StatusOK, map[string]json.Number{})
		}

		found, err := lookup(c.UserContext(), discordIDs, tags)
		if err != nil {
			return err
		}

		result := make(map[string]*json.Number, len(found)+len(tags))
		for _, tag := range tags {
			result[tag] = nil
		}
		for tag, userID := range found {
			value := userID
			result[tag] = &value
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

func legacyDiscordLinkInputs(body []byte) ([]string, []string, error) {
	var rawInputs []json.RawMessage
	if len(body) == 0 || json.Unmarshal(body, &rawInputs) != nil || rawInputs == nil {
		return nil, nil, fiber.NewError(http.StatusUnprocessableEntity, "body must be an array of Discord IDs and/or player tags")
	}

	discordIDs := make([]string, 0, len(rawInputs))
	tags := make([]string, 0, len(rawInputs))
	seenDiscordIDs := make(map[string]struct{}, len(rawInputs))
	seenTags := make(map[string]struct{}, len(rawInputs))
	for _, rawInput := range rawInputs {
		value := strings.TrimSpace(string(rawInput))
		if strings.HasPrefix(value, `"`) {
			if err := json.Unmarshal(rawInput, &value); err != nil {
				return nil, nil, fiber.NewError(http.StatusUnprocessableEntity, "items must be Discord IDs or player tags")
			}
			value = strings.TrimSpace(value)
			if len(value) < 15 || len(value) > 20 || strings.Trim(value, "0123456789") != "" {
				tag := legacyDiscordLinkTag(value)
				if _, exists := seenTags[tag]; exists {
					continue
				}
				seenTags[tag] = struct{}{}
				tags = append(tags, tag)
				continue
			}
		}
		if len(value) < 15 || len(value) > 20 || strings.Trim(value, "0123456789") != "" {
			return nil, nil, fiber.NewError(http.StatusUnprocessableEntity, "items must be Discord IDs or player tags")
		}
		if _, exists := seenDiscordIDs[value]; exists {
			continue
		}
		seenDiscordIDs[value] = struct{}{}
		discordIDs = append(discordIDs, value)
	}
	return discordIDs, tags, nil
}

func legacyDiscordLinkTag(raw string) string {
	tag := tagCharacters.ReplaceAllString(strings.ToUpper(raw), "")
	tag = strings.ReplaceAll(tag, "O", "0")
	return "#" + tag
}

func queryDiscordLinks(ctx context.Context, db discordLinksDB, discordIDs, tags []string) (map[string]json.Number, error) {
	rows, err := db.Query(ctx, `
		SELECT tag, user_id
		FROM player_links
		WHERE (user_id = ANY($1::text[]) OR tag = ANY($2::text[]))
		  AND hidden = false
		  AND user_id ~ '^[0-9]{15,20}$'
	`, discordIDs, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]json.Number)
	for rows.Next() {
		var tag, rawUserID string
		if err := rows.Scan(&tag, &rawUserID); err != nil {
			return nil, err
		}
		result[tag] = json.Number(rawUserID)
	}
	return result, rows.Err()
}
