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

type discordLinksLookup func(context.Context, []string) (map[string]json.Number, error)

func discordLinks(deps apptypes.Deps) fiber.Handler {
	return discordLinksHandler(func(ctx context.Context, tags []string) (map[string]json.Number, error) {
		if deps.Store == nil || deps.Store.SQL == nil {
			return nil, apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
		}
		return queryDiscordLinks(ctx, deps.Store.SQL, tags)
	})
}

func discordLinksHandler(lookup discordLinksLookup) fiber.Handler {
	return func(c *fiber.Ctx) error {
		discordIDs, err := legacyDiscordIDs(c.Body())
		if err != nil {
			return err
		}
		if len(discordIDs) == 0 {
			return apptypes.JSON(c, http.StatusOK, map[string]json.Number{})
		}

		found, err := lookup(c.UserContext(), discordIDs)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, found)
	}
}

func legacyDiscordIDs(body []byte) ([]string, error) {
	var rawIDs []json.RawMessage
	if len(body) == 0 || json.Unmarshal(body, &rawIDs) != nil || rawIDs == nil {
		return nil, fiber.NewError(http.StatusUnprocessableEntity, "body must be an array of Discord IDs")
	}
	result := make([]string, 0, len(rawIDs))
	seen := make(map[string]struct{}, len(rawIDs))
	for _, rawID := range rawIDs {
		value := strings.TrimSpace(string(rawID))
		if strings.HasPrefix(value, `"`) {
			if err := json.Unmarshal(rawID, &value); err != nil {
				return nil, fiber.NewError(http.StatusUnprocessableEntity, "Discord IDs must be 15-20 digit numbers")
			}
			value = strings.TrimSpace(value)
		}
		if len(value) < 15 || len(value) > 20 || strings.Trim(value, "0123456789") != "" {
			return nil, fiber.NewError(http.StatusUnprocessableEntity, "Discord IDs must be 15-20 digit numbers")
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result, nil
}

func queryDiscordLinks(ctx context.Context, db discordLinksDB, discordIDs []string) (map[string]json.Number, error) {
	rows, err := db.Query(ctx, `
		SELECT tag, user_id
		FROM player_links
		WHERE user_id = ANY($1::text[])
		  AND hidden = false
	`, discordIDs)
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
