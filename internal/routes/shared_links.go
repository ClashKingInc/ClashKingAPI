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
)

var sharedLinksDiscordIDPattern = regexp.MustCompile(`^[1-9][0-9]{14,19}$`)

type sharedLinksDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Begin(context.Context) (pgx.Tx, error)
}

type sharedLinksRateWindow struct {
	startedAt time.Time
	count     int
}

var sharedLinksRateLimits = struct {
	sync.Mutex
	windows map[string]sharedLinksRateWindow
}{windows: make(map[string]sharedLinksRateWindow)}

// getSharedLinksApplication returns the public identity for an active developer application.
//
// @Summary Get a shared-links application
// @Description Returns the public application identity used by the connected-app consent page. When redirect_uri is supplied, it must exactly match the application's registered URI.
// @Tags Shared Links
// @Produce json
// @Param application_id path string true "Application ID"
// @Param redirect_uri query string false "Exact registered redirect URI"
// @Success 200 {object} modelsv2.SharedLinksApplicationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared/applications/{application_id} [get]
func getSharedLinksApplication(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		application, configuredRedirectURI, err := loadSharedLinksApplication(c.UserContext(), db, applicationID)
		if err != nil {
			return err
		}

		var redirectURI *string
		requestedRedirectURI := c.Query("redirect_uri")
		if requestedRedirectURI != "" {
			if configuredRedirectURI == nil || requestedRedirectURI != *configuredRedirectURI {
				return apptypes.Error(http.StatusBadRequest, "redirect_uri is not registered for this application")
			}
			redirectURI = &requestedRedirectURI
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, modelsv2.SharedLinksApplicationResponse{
			Application: application,
			RedirectURI: redirectURI,
		})
	}
}

// getSharedLinksConsent returns the current user's verified accounts and existing grant.
//
// @Summary Get shared-links consent details
// @Description Returns the active application, the authenticated user's verified accounts, and any current read-only grant.
// @Tags Shared Links
// @Produce json
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Success 200 {object} modelsv2.SharedLinksGrant
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared/grants/{application_id} [get]
func getSharedLinksConsent(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		response, err := loadSharedLinksConsent(c.UserContext(), db, applicationID, apptypes.UserID(c.UserContext()))
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// putSharedLinksGrant creates or replaces the current user's read-only grant.
//
// @Summary Grant shared-links access
// @Description Grants an application read access to selected verified accounts or all current and future verified accounts.
// @Tags Shared Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Param body body modelsv2.SharedLinksGrantRequest true "Grant selection"
// @Success 200 {object} modelsv2.SharedLinksConsentResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared/grants/{application_id} [put]
func putSharedLinksGrant(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		var request modelsv2.SharedLinksGrantRequest
		if err := apptypes.DecodeJSON(c, &request); err != nil {
			return err
		}
		playerTags, err := validateSharedLinksGrantRequest(request)
		if err != nil {
			return err
		}
		userID := apptypes.UserID(c.UserContext())
		if err := replaceSharedLinksGrant(c.UserContext(), db, applicationID, userID, request.AccessMode, playerTags); err != nil {
			return err
		}
		grant, err := loadSharedLinksGrant(c.UserContext(), db, applicationID, userID)
		if err != nil {
			return err
		}
		if grant == nil {
			return errors.New("shared-links grant was not persisted")
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, grant)
	}
}

// deleteSharedLinksGrant revokes the current user's grant immediately.
//
// @Summary Revoke shared-links access
// @Description Revokes the current user's grant and removes its stored selected-account rows. The operation is idempotent.
// @Tags Shared Links
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Success 204
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared/grants/{application_id} [delete]
func deleteSharedLinksGrant(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		if err := revokeSharedLinksGrant(c.UserContext(), db, applicationID, apptypes.UserID(c.UserContext())); err != nil {
			return err
		}
		return c.SendStatus(http.StatusNoContent)
	}
}

// listSharedLinksConnections lists the current user's active connected applications.
//
// @Summary List connected shared-links applications
// @Description Returns the authenticated user's active read-only application grants.
// @Tags Shared Links
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.SharedLinksConnectionsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/links/shared/grants [get]
func listSharedLinksConnections(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		items, err := loadSharedLinksConnections(c.UserContext(), db, apptypes.UserID(c.UserContext()))
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, modelsv2.SharedLinksConnectionsResponse{Items: items})
	}
}

// postSharedLinks looks up verified links covered by active user grants.
//
// @Summary Look up shared Discord links
// @Description Returns verified Discord ID and player-tag pairs covered by active grants for the authenticated developer application. Unauthorized and nonexistent identifiers are omitted identically.
// @Tags Shared Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
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
		links, err := querySharedLinks(c.UserContext(), db, applicationID, discordIDs, playerTags)
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, modelsv2.SharedLinksLookupResponse{Links: links})
	}
}

func sharedLinksSQL(a apptypes.Deps) (sharedLinksDB, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(http.StatusServiceUnavailable, "SQL store is not configured")
	}
	return a.Store.SQL, nil
}

func sharedLinksApplicationUUID(raw string) (uuid.UUID, error) {
	applicationID, err := uuid.Parse(strings.TrimSpace(raw))
	if err != nil {
		return uuid.Nil, apptypes.Error(http.StatusBadRequest, "Invalid application_id")
	}
	return applicationID, nil
}

func loadSharedLinksApplication(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID) (modelsv2.SharedLinksApplication, *string, error) {
	var (
		id                 uuid.UUID
		name               string
		developerName      *string
		configuredRedirect *string
	)
	err := db.QueryRow(ctx, `
		SELECT application_id, application_name, developer_name, redirect_uri
		FROM developer_applications
		WHERE application_id = $1 AND revoked_at IS NULL
	`, applicationID).Scan(&id, &name, &developerName, &configuredRedirect)
	if errors.Is(err, pgx.ErrNoRows) {
		return modelsv2.SharedLinksApplication{}, nil, apptypes.Error(http.StatusNotFound, "Application not found")
	}
	if err != nil {
		return modelsv2.SharedLinksApplication{}, nil, err
	}
	return modelsv2.SharedLinksApplication{ID: id.String(), Name: name, DeveloperName: developerName}, configuredRedirect, nil
}

func loadSharedLinksConsent(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID, userID string) (modelsv2.SharedLinksConsentResponse, error) {
	application, _, err := loadSharedLinksApplication(ctx, db, applicationID)
	if err != nil {
		return modelsv2.SharedLinksConsentResponse{}, err
	}

	accounts := make([]modelsv2.SharedLinksAccount, 0)
	rows, err := db.Query(ctx, `
		SELECT links.tag, COALESCE(players.name, links.tag), links.hidden
		FROM player_links AS links
		LEFT JOIN basic_player AS players ON players.tag = links.tag
		WHERE links.user_id = $1 AND links.is_verified = true
		ORDER BY links.order_index ASC, links.added_at ASC, links.tag ASC
	`, userID)
	if err != nil {
		return modelsv2.SharedLinksConsentResponse{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var account modelsv2.SharedLinksAccount
		if err := rows.Scan(&account.PlayerTag, &account.Name, &account.Hidden); err != nil {
			return modelsv2.SharedLinksConsentResponse{}, err
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return modelsv2.SharedLinksConsentResponse{}, err
	}

	grant, err := loadSharedLinksGrant(ctx, db, applicationID, userID)
	if err != nil {
		return modelsv2.SharedLinksConsentResponse{}, err
	}
	return modelsv2.SharedLinksConsentResponse{Application: application, Accounts: accounts, Grant: grant}, nil
}

func loadSharedLinksGrant(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID, userID string) (*modelsv2.SharedLinksGrant, error) {
	var (
		grantID uuid.UUID
		grant   modelsv2.SharedLinksGrant
	)
	err := db.QueryRow(ctx, `
		SELECT grant_id, access_mode, created_at, updated_at
		FROM developer_link_grants
		WHERE application_id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, applicationID, userID).Scan(&grantID, &grant.AccessMode, &grant.ConnectedAt, &grant.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	grant.SelectedPlayerTags = make([]string, 0)
	rows, err := db.Query(ctx, `
		SELECT player_tag
		FROM developer_link_grant_accounts
		WHERE grant_id = $1
		ORDER BY player_tag ASC
	`, grantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var playerTag string
		if err := rows.Scan(&playerTag); err != nil {
			return nil, err
		}
		grant.SelectedPlayerTags = append(grant.SelectedPlayerTags, playerTag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &grant, nil
}

func validateSharedLinksGrantRequest(request modelsv2.SharedLinksGrantRequest) ([]string, error) {
	switch request.AccessMode {
	case modelsv2.SharedLinksAccessSelected:
		playerTags, err := normalizeSharedLinksPlayerTags(request.PlayerTags)
		if err != nil {
			return nil, err
		}
		if len(playerTags) == 0 {
			return nil, apptypes.Error(http.StatusBadRequest, "selected access requires at least one player_tag")
		}
		return playerTags, nil
	case modelsv2.SharedLinksAccessAllCurrentAndFuture:
		if len(request.PlayerTags) != 0 {
			return nil, apptypes.Error(http.StatusBadRequest, "player_tags must be empty for all_current_and_future access")
		}
		return []string{}, nil
	default:
		return nil, apptypes.Error(http.StatusBadRequest, "access_mode must be selected or all_current_and_future")
	}
}

func replaceSharedLinksGrant(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID, userID, accessMode string, playerTags []string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var activeApplicationID uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT application_id
		FROM developer_applications
		WHERE application_id = $1 AND revoked_at IS NULL
		FOR SHARE
	`, applicationID).Scan(&activeApplicationID); errors.Is(err, pgx.ErrNoRows) {
		return apptypes.Error(http.StatusNotFound, "Application not found")
	} else if err != nil {
		return err
	}

	if accessMode == modelsv2.SharedLinksAccessSelected {
		var ownedCount int
		if err := tx.QueryRow(ctx, `
			SELECT count(*)
			FROM player_links
			WHERE user_id = $1 AND is_verified = true AND tag = ANY($2::text[])
		`, userID, playerTags).Scan(&ownedCount); err != nil {
			return err
		}
		if ownedCount != len(playerTags) {
			return apptypes.Error(http.StatusBadRequest, "player_tags must be verified accounts owned by the current user")
		}
	}

	var grantID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO developer_link_grants (
			application_id, user_id, access_mode, created_at, updated_at, revoked_at
		)
		VALUES ($1, $2, $3, now(), now(), NULL)
		ON CONFLICT (application_id, user_id) WHERE revoked_at IS NULL DO UPDATE
		SET access_mode = EXCLUDED.access_mode,
			updated_at = now(),
			revoked_at = NULL
		RETURNING grant_id
	`, applicationID, userID, accessMode).Scan(&grantID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM developer_link_grant_accounts WHERE grant_id = $1`, grantID); err != nil {
		return err
	}
	if len(playerTags) != 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO developer_link_grant_accounts (grant_id, player_tag, created_at)
			SELECT $1, player_tag, now()
			FROM unnest($2::text[]) AS player_tag
		`, grantID, playerTags); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func revokeSharedLinksGrant(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID, userID string) error {
	_, err := db.Exec(ctx, `
		WITH revoked AS (
			UPDATE developer_link_grants
			SET revoked_at = now(), updated_at = now()
			WHERE application_id = $1 AND user_id = $2 AND revoked_at IS NULL
			RETURNING grant_id
		)
		DELETE FROM developer_link_grant_accounts AS accounts
		USING revoked
		WHERE accounts.grant_id = revoked.grant_id
	`, applicationID, userID)
	return err
}

func loadSharedLinksConnections(ctx context.Context, db sharedLinksDB, userID string) ([]modelsv2.SharedLinksConnection, error) {
	rows, err := db.Query(ctx, `
		SELECT applications.application_id, applications.application_name, applications.developer_name,
			grants.access_mode, grants.created_at, grants.updated_at,
			COALESCE(
				array_agg(accounts.player_tag ORDER BY accounts.player_tag)
					FILTER (WHERE accounts.player_tag IS NOT NULL),
				ARRAY[]::text[]
			)
		FROM developer_link_grants AS grants
		JOIN developer_applications AS applications ON applications.application_id = grants.application_id
		LEFT JOIN developer_link_grant_accounts AS accounts ON accounts.grant_id = grants.grant_id
		WHERE grants.user_id = $1
			AND grants.revoked_at IS NULL
			AND applications.revoked_at IS NULL
		GROUP BY applications.application_id, applications.application_name, applications.developer_name,
			grants.access_mode, grants.created_at, grants.updated_at
		ORDER BY grants.updated_at DESC, applications.application_name ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.SharedLinksConnection, 0)
	for rows.Next() {
		var (
			applicationID uuid.UUID
			item          modelsv2.SharedLinksConnection
		)
		if err := rows.Scan(
			&applicationID,
			&item.Application.Name,
			&item.Application.DeveloperName,
			&item.Grant.AccessMode,
			&item.Grant.ConnectedAt,
			&item.Grant.UpdatedAt,
			&item.Grant.SelectedPlayerTags,
		); err != nil {
			return nil, err
		}
		item.Application.ID = applicationID.String()
		if item.Grant.SelectedPlayerTags == nil {
			item.Grant.SelectedPlayerTags = []string{}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func authenticateSharedLinksApplication(ctx context.Context, db sharedLinksDB, authorization string) (string, error) {
	token := sharedLinksBearerToken(authorization)
	if token == "" || len(token) > 512 {
		return "", apptypes.Error(http.StatusUnauthorized, "Invalid developer API token")
	}
	hash := sha256.Sum256([]byte(token))
	var applicationID uuid.UUID
	err := db.QueryRow(ctx, `
		UPDATE developer_applications
		SET token_last_used_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL
		RETURNING application_id
	`, hash[:]).Scan(&applicationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apptypes.Error(http.StatusUnauthorized, "Invalid developer API token")
	}
	if err != nil {
		return "", err
	}
	return applicationID.String(), nil
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

func querySharedLinks(ctx context.Context, db sharedLinksDB, applicationID string, discordIDs, playerTags []string) ([]modelsv2.SharedLink, error) {
	rows, err := db.Query(ctx, `
		SELECT DISTINCT links.user_id, links.tag
		FROM player_links AS links
		JOIN developer_link_grants AS grants
			ON grants.application_id = $1::uuid
			AND grants.user_id = links.user_id
			AND grants.revoked_at IS NULL
		WHERE links.is_verified = true
			AND links.user_id ~ '^[1-9][0-9]{14,19}$'
			AND (links.user_id = ANY($2::text[]) OR links.tag = ANY($3::text[]))
			AND (
				grants.access_mode = 'all_current_and_future'
				OR (
					grants.access_mode = 'selected'
					AND EXISTS (
						SELECT 1
						FROM developer_link_grant_accounts AS accounts
						WHERE accounts.grant_id = grants.grant_id
							AND accounts.player_tag = links.tag
					)
				)
			)
		ORDER BY links.user_id ASC, links.tag ASC
	`, applicationID, discordIDs, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := make([]modelsv2.SharedLink, 0)
	for rows.Next() {
		var link modelsv2.SharedLink
		if err := rows.Scan(&link.DiscordID, &link.PlayerTag); err != nil {
			return nil, err
		}
		links = append(links, link)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return links, nil
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
