package routes

import (
	"context"
	"crypto/sha256"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	sharedLinksMaxIdentifiers    = 100
	sharedLinksRequestsPerMinute = 120
	sharedLinksInvalidToken      = "Invalid developer API token"
)

var sharedLinksDiscordIDPattern = regexp.MustCompile(`^[1-9][0-9]{14,19}$`)

type sharedLinksDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type sharedLinksRateWindow struct {
	startedAt time.Time
	count     int
}

var sharedLinksRateLimits = struct {
	sync.Mutex
	windows map[string]sharedLinksRateWindow
}{windows: make(map[string]sharedLinksRateWindow)}

// postSharedLinks looks up visible Discord links for a developer application.
//
// @Summary Look up shared Discord links
// @Description Returns visible Discord ID and player-tag pairs for the requested Discord IDs, player tags, or both. Hidden and nonexistent links are omitted identically. Results include both verified and unverified links.
// @Tags Links
// @Accept json
// @Produce json
// @Security DeveloperToken
// @Param body body modelsv2.SharedLinksLookupRequest true "Discord IDs and player tags"
// @Success 200 {object} modelsv2.SharedLinksLookupResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 429 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared [post]
func postSharedLinks(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		return executeSharedLinksLookup(c, db)
	}
}

func executeSharedLinksLookup(c *fiber.Ctx, db sharedLinksDB) error {
	applicationID, err := authenticateSharedLinksApplication(c.UserContext(), db, c.Get(fiber.HeaderAuthorization))
	if err != nil {
		return err
	}
	if !allowSharedLinksRequest(applicationID, time.Now().UTC()) {
		return apptypes.Error(http.StatusTooManyRequests, "Shared-links request limit exceeded")
	}

	var request modelsv2.SharedLinksLookupRequest
	if err := apptypes.DecodeJSON(c, &request); err != nil {
		return err
	}
	discordIDs, playerTags, err := validateSharedLinksLookupRequest(request)
	if err != nil {
		return err
	}
	if err := recordSharedLinksLookup(c.UserContext(), db, applicationID, len(discordIDs)+len(playerTags)); err != nil {
		return err
	}
	items, err := querySharedLinks(c.UserContext(), db, discordIDs, playerTags)
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderCacheControl, "no-store")
	return apptypes.JSON(c, http.StatusOK, modelsv2.SharedLinksLookupResponse{Items: items})
}

func sharedLinksSQL(a apptypes.Deps) (sharedLinksDB, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
	}
	return a.Store.SQL, nil
}

func authenticateSharedLinksApplication(ctx context.Context, db sharedLinksDB, authorization string) (string, error) {
	token := sharedLinksBearerToken(authorization)
	if token == "" || len(token) > 512 {
		return "", apptypes.Error(http.StatusUnauthorized, sharedLinksInvalidToken)
	}
	hash := sha256.Sum256([]byte(token))
	var applicationID uuid.UUID
	err := db.QueryRow(ctx, `
		UPDATE developer_applications
		SET token_last_used_at = now(),
			api_request_count = api_request_count + 1
		WHERE token_hash = $1 AND revoked_at IS NULL
		RETURNING application_id
	`, hash[:]).Scan(&applicationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apptypes.Error(http.StatusUnauthorized, sharedLinksInvalidToken)
	}
	if err != nil {
		return "", err
	}
	return applicationID.String(), nil
}

func recordSharedLinksLookup(ctx context.Context, db sharedLinksDB, applicationID string, identifiers int) error {
	result, err := db.Exec(ctx, `
		UPDATE developer_applications
		SET links_lookup_count = links_lookup_count + $2
		WHERE application_id = $1 AND revoked_at IS NULL
	`, applicationID, identifiers)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return apptypes.Error(http.StatusUnauthorized, sharedLinksInvalidToken)
	}
	return nil
}

func sharedLinksBearerToken(authorization string) string {
	parts := strings.Fields(strings.TrimSpace(authorization))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return parts[1]
}

func validateSharedLinksLookupRequest(request modelsv2.SharedLinksLookupRequest) ([]string, []string, error) {
	if len(request.DiscordIDs)+len(request.PlayerTags) > sharedLinksMaxIdentifiers {
		return nil, nil, apptypes.Error(http.StatusBadRequest, "A maximum of 100 identifiers is allowed")
	}
	discordIDs := make([]string, 0, len(request.DiscordIDs))
	seenDiscordIDs := make(map[string]struct{}, len(request.DiscordIDs))
	for _, rawDiscordID := range request.DiscordIDs {
		discordID := strings.TrimSpace(rawDiscordID)
		if !sharedLinksDiscordIDPattern.MatchString(discordID) {
			return nil, nil, apptypes.Error(http.StatusBadRequest, "discord_ids must contain valid Discord snowflakes")
		}
		if _, exists := seenDiscordIDs[discordID]; exists {
			continue
		}
		seenDiscordIDs[discordID] = struct{}{}
		discordIDs = append(discordIDs, discordID)
	}
	playerTags, err := normalizeSharedLinksPlayerTags(request.PlayerTags)
	if err != nil {
		return nil, nil, err
	}
	if len(discordIDs) == 0 && len(playerTags) == 0 {
		return nil, nil, apptypes.Error(http.StatusBadRequest, "At least one discord_id or player_tag is required")
	}
	return discordIDs, playerTags, nil
}

func normalizeSharedLinksPlayerTags(rawTags []string) ([]string, error) {
	if len(rawTags) > sharedLinksMaxIdentifiers {
		return nil, apptypes.Error(http.StatusBadRequest, "A maximum of 100 player_tags is allowed")
	}
	playerTags := make([]string, 0, len(rawTags))
	seen := make(map[string]struct{}, len(rawTags))
	for _, rawTag := range rawTags {
		tag := strings.ToUpper(strings.TrimSpace(rawTag))
		tag = strings.TrimPrefix(tag, "#")
		tag = strings.ReplaceAll(tag, "O", "0")
		if len(tag) < 3 || len(tag) > 15 {
			return nil, apptypes.Error(http.StatusBadRequest, "player_tags must contain valid Clash of Clans tags")
		}
		for _, character := range tag {
			if !strings.ContainsRune("0289PYLQGRJCUV", character) {
				return nil, apptypes.Error(http.StatusBadRequest, "player_tags must contain valid Clash of Clans tags")
			}
		}
		tag = "#" + tag
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		playerTags = append(playerTags, tag)
	}
	return playerTags, nil
}

func querySharedLinks(ctx context.Context, db sharedLinksDB, discordIDs, playerTags []string) ([]modelsv2.SharedLink, error) {
	rows, err := db.Query(ctx, `
		SELECT links.is_verified, links.tag, links.user_id
		FROM player_links AS links
		WHERE links.hidden = false
			AND links.user_id ~ '^[1-9][0-9]{14,19}$'
			AND (links.user_id = ANY($1::text[]) OR links.tag = ANY($2::text[]))
		ORDER BY links.user_id ASC, links.order_index ASC, links.tag ASC
	`, discordIDs, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.SharedLink, 0)
	for rows.Next() {
		var item modelsv2.SharedLink
		if err := rows.Scan(&item.IsVerified, &item.PlayerTag, &item.UserID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func allowSharedLinksRequest(applicationID string, now time.Time) bool {
	sharedLinksRateLimits.Lock()
	defer sharedLinksRateLimits.Unlock()
	window := sharedLinksRateLimits.windows[applicationID]
	if window.startedAt.IsZero() || now.Sub(window.startedAt) >= time.Minute {
		sharedLinksRateLimits.windows[applicationID] = sharedLinksRateWindow{startedAt: now, count: 1}
		return true
	}
	if window.count >= sharedLinksRequestsPerMinute {
		return false
	}
	window.count++
	sharedLinksRateLimits.windows[applicationID] = window
	return true
}
