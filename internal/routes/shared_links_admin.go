package routes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const developerAPITokenPrefix = "ck_dev_"

type developerApplicationScanner interface {
	Scan(...any) error
}

type developerApplicationValues struct {
	ApplicationName string
	DeveloperName   *string
	ContactEmail    *string
	RedirectURI     *string
}

type developerApplicationPatch struct {
	ApplicationNamePresent bool
	ApplicationName        string
	DeveloperNamePresent   bool
	DeveloperName          *string
	ContactEmailPresent    bool
	ContactEmail           *string
	RedirectURIPresent     bool
	RedirectURI            *string
}

// listDeveloperApplications returns every active and revoked developer application.
//
// @Summary List developer applications
// @Description Returns developer applications managed by the ClashKing AdminPanel. Requires the internal bot service token.
// @Tags Admin Developer Applications
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {array} modelsv2.DeveloperApplication
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/admin/developer-applications [get]
func listDeveloperApplications(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		rows, err := db.Query(c.UserContext(), `
			SELECT application_id, application_name, developer_name, contact_email,
				redirect_uri, token_prefix, token_last_used_at, created_by_admin_id,
				created_at, updated_at, revoked_at
			FROM developer_applications
			ORDER BY revoked_at NULLS FIRST, updated_at DESC, application_name ASC
		`)
		if err != nil {
			return err
		}
		defer rows.Close()
		applications := make([]modelsv2.DeveloperApplication, 0)
		for rows.Next() {
			application, err := scanDeveloperApplication(rows, a.Config.DashboardOrigin)
			if err != nil {
				return err
			}
			applications = append(applications, application)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, applications)
	}
}

// getDeveloperApplication returns one application by public ID.
//
// @Summary Get a developer application
// @Tags Admin Developer Applications
// @Produce json
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Success 200 {object} modelsv2.DeveloperApplication
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/admin/developer-applications/{application_id} [get]
func getDeveloperApplication(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		application, err := queryDeveloperApplication(c.UserContext(), db, applicationID, a.Config.DashboardOrigin)
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, application)
	}
}

// createDeveloperApplication creates an application and returns its API token once.
//
// @Summary Create a developer application
// @Description Creates one read-only application. The plaintext API token is returned only by this response and is never stored.
// @Tags Admin Developer Applications
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.DeveloperApplicationCreateRequest true "Application metadata"
// @Success 201 {object} modelsv2.DeveloperApplicationCreateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/admin/developer-applications [post]
func createDeveloperApplication(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		var request modelsv2.DeveloperApplicationCreateRequest
		if err := apptypes.DecodeJSON(c, &request); err != nil {
			return err
		}
		values, err := validateDeveloperApplicationValues(
			request.ApplicationName,
			request.DeveloperName,
			request.ContactEmail,
			request.RedirectURI,
			true,
		)
		if err != nil {
			return err
		}
		createdByAdminID, err := uuid.Parse(strings.TrimSpace(request.CreatedByAdminID))
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "created_by_admin_id must be a valid UUID")
		}
		apiToken, tokenPrefix, tokenHash, err := newDeveloperAPIToken()
		if err != nil {
			return err
		}

		row := db.QueryRow(c.UserContext(), `
			INSERT INTO developer_applications (
				application_name, developer_name, contact_email, redirect_uri,
				token_hash, token_prefix, created_by_admin_id,
				created_at, updated_at
			)
			SELECT $1, $2, $3, $4, $5, $6, admins.id, now(), now()
			FROM admin_users AS admins
			WHERE admins.id = $7 AND admins.active = true
			RETURNING application_id, application_name, developer_name, contact_email,
				redirect_uri, token_prefix, token_last_used_at, created_by_admin_id,
				created_at, updated_at, revoked_at
		`, values.ApplicationName, values.DeveloperName, values.ContactEmail, values.RedirectURI,
			tokenHash, tokenPrefix, createdByAdminID)
		application, err := scanDeveloperApplication(row, a.Config.DashboardOrigin)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusBadRequest, "created_by_admin_id must reference an active admin")
		}
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusCreated, modelsv2.DeveloperApplicationCreateResponse{
			DeveloperApplication: application,
			APIToken:             apiToken,
		})
	}
}

// updateDeveloperApplication updates editable application metadata.
//
// @Summary Update a developer application
// @Tags Admin Developer Applications
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Param body body modelsv2.DeveloperApplicationUpdateRequest true "Editable metadata"
// @Success 200 {object} modelsv2.DeveloperApplication
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/admin/developer-applications/{application_id} [patch]
func updateDeveloperApplication(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		patch, err := decodeDeveloperApplicationPatch(c.Body())
		if err != nil {
			return err
		}
		row := db.QueryRow(c.UserContext(), `
			UPDATE developer_applications
			SET application_name = CASE WHEN $2 THEN $3 ELSE application_name END,
				developer_name = CASE WHEN $4 THEN $5 ELSE developer_name END,
				contact_email = CASE WHEN $6 THEN $7 ELSE contact_email END,
				redirect_uri = CASE WHEN $8 THEN $9 ELSE redirect_uri END,
				updated_at = now()
			WHERE application_id = $1 AND revoked_at IS NULL
			RETURNING application_id, application_name, developer_name, contact_email,
				redirect_uri, token_prefix, token_last_used_at, created_by_admin_id,
				created_at, updated_at, revoked_at
		`, applicationID,
			patch.ApplicationNamePresent, patch.ApplicationName,
			patch.DeveloperNamePresent, patch.DeveloperName,
			patch.ContactEmailPresent, patch.ContactEmail,
			patch.RedirectURIPresent, patch.RedirectURI,
		)
		application, err := scanDeveloperApplication(row, a.Config.DashboardOrigin)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Active application not found")
		}
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderCacheControl, "no-store")
		return apptypes.JSON(c, http.StatusOK, application)
	}
}

// revokeDeveloperApplication permanently revokes an application, its token, and its grants.
//
// @Summary Revoke a developer application
// @Tags Admin Developer Applications
// @Security ApiKeyAuth
// @Param application_id path string true "Application ID"
// @Success 204
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/admin/developer-applications/{application_id} [delete]
func revokeDeveloperApplication(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := sharedLinksSQL(a)
		if err != nil {
			return err
		}
		applicationID, err := sharedLinksApplicationUUID(c.Params("application_id"))
		if err != nil {
			return err
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(c.UserContext()) }()
		var revokedID uuid.UUID
		if err := tx.QueryRow(c.UserContext(), `
			UPDATE developer_applications
			SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
			WHERE application_id = $1
			RETURNING application_id
		`, applicationID).Scan(&revokedID); errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Application not found")
		} else if err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `
			WITH revoked AS (
				UPDATE developer_link_grants
				SET revoked_at = now(), updated_at = now()
				WHERE application_id = $1 AND revoked_at IS NULL
				RETURNING grant_id
			)
			DELETE FROM developer_link_grant_accounts AS accounts
			USING revoked
			WHERE accounts.grant_id = revoked.grant_id
		`, applicationID); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return c.SendStatus(http.StatusNoContent)
	}
}

func queryDeveloperApplication(ctx context.Context, db sharedLinksDB, applicationID uuid.UUID, dashboardOrigin string) (modelsv2.DeveloperApplication, error) {
	application, err := scanDeveloperApplication(db.QueryRow(ctx, `
		SELECT application_id, application_name, developer_name, contact_email,
			redirect_uri, token_prefix, token_last_used_at, created_by_admin_id,
			created_at, updated_at, revoked_at
		FROM developer_applications
		WHERE application_id = $1
	`, applicationID), dashboardOrigin)
	if errors.Is(err, pgx.ErrNoRows) {
		return modelsv2.DeveloperApplication{}, apptypes.Error(http.StatusNotFound, "Application not found")
	}
	return application, err
}

func scanDeveloperApplication(row developerApplicationScanner, dashboardOrigin string) (modelsv2.DeveloperApplication, error) {
	var (
		application   modelsv2.DeveloperApplication
		applicationID uuid.UUID
		adminID       uuid.UUID
	)
	err := row.Scan(
		&applicationID,
		&application.ApplicationName,
		&application.DeveloperName,
		&application.ContactEmail,
		&application.RedirectURI,
		&application.TokenPrefix,
		&application.TokenLastUsedAt,
		&adminID,
		&application.CreatedAt,
		&application.UpdatedAt,
		&application.RevokedAt,
	)
	if err != nil {
		return modelsv2.DeveloperApplication{}, err
	}
	application.ApplicationID = applicationID.String()
	application.CreatedByAdminID = adminID.String()
	application.ConnectURL = strings.TrimRight(dashboardOrigin, "/") + "/connect/" + application.ApplicationID
	return application, nil
}

func newDeveloperAPIToken() (string, string, []byte, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", "", nil, err
	}
	token := developerAPITokenPrefix + base64.RawURLEncoding.EncodeToString(secret)
	tokenPrefix := token[:len(developerAPITokenPrefix)+8]
	hash := sha256.Sum256([]byte(token))
	return token, tokenPrefix, hash[:], nil
}

func validateDeveloperApplicationValues(applicationName string, developerName, contactEmail, redirectURI *string, requireName bool) (developerApplicationValues, error) {
	values := developerApplicationValues{ApplicationName: strings.TrimSpace(applicationName)}
	if requireName && values.ApplicationName == "" {
		return developerApplicationValues{}, apptypes.Error(http.StatusBadRequest, "application_name is required")
	}
	if len(values.ApplicationName) > 120 {
		return developerApplicationValues{}, apptypes.Error(http.StatusBadRequest, "application_name must be 120 characters or fewer")
	}
	values.DeveloperName = normalizeOptionalDeveloperApplicationValue(developerName)
	if values.DeveloperName != nil && len(*values.DeveloperName) > 120 {
		return developerApplicationValues{}, apptypes.Error(http.StatusBadRequest, "developer_name must be 120 characters or fewer")
	}
	values.ContactEmail = normalizeOptionalDeveloperApplicationValue(contactEmail)
	if values.ContactEmail != nil {
		if len(*values.ContactEmail) > 320 {
			return developerApplicationValues{}, apptypes.Error(http.StatusBadRequest, "contact_email must be 320 characters or fewer")
		}
		address, err := mail.ParseAddress(*values.ContactEmail)
		if err != nil || address.Address != *values.ContactEmail {
			return developerApplicationValues{}, apptypes.Error(http.StatusBadRequest, "contact_email must be a valid email address")
		}
	}
	values.RedirectURI = normalizeOptionalDeveloperApplicationValue(redirectURI)
	if values.RedirectURI != nil {
		if err := validateDeveloperRedirectURI(*values.RedirectURI); err != nil {
			return developerApplicationValues{}, err
		}
	}
	return values, nil
}

func normalizeOptionalDeveloperApplicationValue(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func validateDeveloperRedirectURI(raw string) error {
	if len(raw) > 2048 {
		return apptypes.Error(http.StatusBadRequest, "redirect_uri must be 2048 characters or fewer")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.Fragment != "" || parsed.User != nil {
		return apptypes.Error(http.StatusBadRequest, "redirect_uri must be an absolute URL without credentials or a fragment")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	hostname := strings.ToLower(parsed.Hostname())
	if parsed.Scheme == "http" && (hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1") {
		return nil
	}
	return apptypes.Error(http.StatusBadRequest, "redirect_uri must use HTTPS, except for localhost development")
}

func decodeDeveloperApplicationPatch(body []byte) (developerApplicationPatch, error) {
	if len(body) == 0 {
		return developerApplicationPatch{}, apptypes.Error(http.StatusBadRequest, "Request body is required")
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil || raw == nil {
		return developerApplicationPatch{}, apptypes.Error(http.StatusBadRequest, "Invalid JSON body")
	}
	for key := range raw {
		switch key {
		case "application_name", "developer_name", "contact_email", "redirect_uri":
		default:
			return developerApplicationPatch{}, apptypes.Error(http.StatusBadRequest, "Unknown field: "+key)
		}
	}
	if len(raw) == 0 {
		return developerApplicationPatch{}, apptypes.Error(http.StatusBadRequest, "At least one editable field is required")
	}

	patch := developerApplicationPatch{}
	if value, exists := raw["application_name"]; exists {
		var name string
		if string(value) == "null" || json.Unmarshal(value, &name) != nil {
			return developerApplicationPatch{}, apptypes.Error(http.StatusBadRequest, "application_name must be a string")
		}
		validated, err := validateDeveloperApplicationValues(name, nil, nil, nil, true)
		if err != nil {
			return developerApplicationPatch{}, err
		}
		patch.ApplicationNamePresent = true
		patch.ApplicationName = validated.ApplicationName
	}
	var err error
	if value, exists := raw["developer_name"]; exists {
		patch.DeveloperNamePresent = true
		patch.DeveloperName, err = decodeNullableDeveloperApplicationString(value)
		if err == nil {
			_, err = validateDeveloperApplicationValues("", patch.DeveloperName, nil, nil, false)
		}
		if err != nil {
			return developerApplicationPatch{}, err
		}
	}
	if value, exists := raw["contact_email"]; exists {
		patch.ContactEmailPresent = true
		patch.ContactEmail, err = decodeNullableDeveloperApplicationString(value)
		if err == nil {
			_, err = validateDeveloperApplicationValues("", nil, patch.ContactEmail, nil, false)
		}
		if err != nil {
			return developerApplicationPatch{}, err
		}
	}
	if value, exists := raw["redirect_uri"]; exists {
		patch.RedirectURIPresent = true
		patch.RedirectURI, err = decodeNullableDeveloperApplicationString(value)
		if err == nil {
			_, err = validateDeveloperApplicationValues("", nil, nil, patch.RedirectURI, false)
		}
		if err != nil {
			return developerApplicationPatch{}, err
		}
	}
	return patch, nil
}

func decodeNullableDeveloperApplicationString(raw json.RawMessage) (*string, error) {
	if string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, apptypes.Error(http.StatusBadRequest, "Editable metadata fields must be strings or null")
	}
	return normalizeOptionalDeveloperApplicationValue(&value), nil
}
