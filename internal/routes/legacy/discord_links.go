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
		var requested []string
		if len(c.Body()) == 0 || json.Unmarshal(c.Body(), &requested) != nil || requested == nil {
			return fiber.NewError(http.StatusUnprocessableEntity, "body must be an array of player tags")
		}

		result := make(map[string]*json.Number, len(requested))
		tags := make([]string, 0, len(requested))
		for _, raw := range requested {
			tag := legacyDiscordLinkTag(raw)
			if _, exists := result[tag]; exists {
				continue
			}
			result[tag] = nil
			tags = append(tags, tag)
		}
		if len(tags) == 0 {
			return apptypes.JSON(c, http.StatusOK, result)
		}

		found, err := lookup(c.UserContext(), tags)
		if err != nil {
			return err
		}
		for tag, userID := range found {
			if _, requested := result[tag]; requested {
				value := userID
				result[tag] = &value
			}
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

func legacyDiscordLinkTag(raw string) string {
	tag := tagCharacters.ReplaceAllString(strings.ToUpper(raw), "")
	tag = strings.ReplaceAll(tag, "O", "0")
	return "#" + tag
}

func queryDiscordLinks(ctx context.Context, db discordLinksDB, tags []string) (map[string]json.Number, error) {
	rows, err := db.Query(ctx, `
		SELECT tag, user_id
		FROM player_links
		WHERE tag = ANY($1::text[])
		  AND hidden = false
		  AND user_id ~ '^[0-9]{15,20}$'
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]json.Number, len(tags))
	for rows.Next() {
		var tag, rawUserID string
		if err := rows.Scan(&tag, &rawUserID); err != nil {
			return nil, err
		}
		result[tag] = json.Number(rawUserID)
	}
	return result, rows.Err()
}
