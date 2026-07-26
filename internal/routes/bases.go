package routes

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	disgorest "github.com/disgoorg/disgo/rest"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	defaultBasesLimit  = 50
	maxBasesLimit      = 100
	maxBaseImages      = 4
	maxBaseDescription = 1000
)

var baseImageExtensions = map[string]bool{
	"png": true, "jpg": true, "jpeg": true, "gif": true, "webp": true,
}

type basesDB interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type baseRowScanner interface {
	Scan(...any) error
}

type baseMessageDeleter interface {
	DeleteMessage(context.Context, int64, int64) error
}

type baseMessageCreator interface {
	CreateBaseMessage(context.Context, int64, int64, string, string, []string) (string, error)
}

type baseMessageIntegration interface {
	baseMessageCreator
	baseMessageDeleter
}

type baseDeleteFailure struct {
	status    int
	code      modelsv2.ErrorCode
	message   string
	cleanup   string
	retryable bool
	cause     error
}

type baseCreateFailure struct {
	status         int
	code           modelsv2.ErrorCode
	message        string
	messageCreated bool
	messageID      *string
	cleanup        string
	retryable      bool
	cause          error
}

func (failure *baseDeleteFailure) Error() string {
	if failure.cause != nil {
		return failure.cause.Error()
	}
	return failure.message
}

func (failure *baseCreateFailure) Error() string {
	if failure.cause != nil {
		return failure.cause.Error()
	}
	return failure.message
}

const (
	baseMessageCleanupDeleted        = "deleted"
	baseMessageCleanupAlreadyMissing = "alreadyMissing"
	baseMessageCleanupFailed         = "failed"
	baseMessageCleanupNotNeeded      = "notNeeded"
)

const baseSelectColumns = `
	b.id::text, b.server_id, b.channel_id, b.message_id, b.base_link, b.images, b.description,
	cardinality(b.downloaders)::int AS download_count,
	cardinality(b.upvoter_ids)::int AS upvotes,
	cardinality(b.downvoter_ids)::int AS downvotes,
	b.downloaders, b.created_at
`

const baseInsertReturningColumns = `
	id::text, server_id, channel_id, message_id, base_link, images, description,
	cardinality(downloaders)::int AS download_count,
	cardinality(upvoter_ids)::int AS upvotes,
	cardinality(downvoter_ids)::int AS downvotes,
	downloaders, created_at
`

// listBases godoc
// @Summary List a server's bases
// @Description Lists only bases with explicit ownership for the authorized server. Downloader IDs are returned without eager Discord profile resolution.
// @Tags Bases
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param limit query int false "Maximum results (default 50, maximum 100)"
// @Param offset query int false "Pagination offset"
// @Success 200 {object} modelsv2.BasesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bases [get]
func listBases(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		limit, offset := basesPagination(c)
		items, total, err := queryBases(c.UserContext(), db, serverID, limit, offset)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to list bases")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.BasesResponse{
			Items: items, Total: total, Limit: limit, Offset: offset,
		})
	}
}

// getBase godoc
// @Summary Get a server base
// @Description Returns one base only when it belongs to the authorized server and has explicit server/channel ownership.
// @Tags Bases
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param base_id path string true "Base ID"
// @Success 200 {object} modelsv2.Base
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bases/{base_id} [get]
func getBase(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		item, err := queryBase(c.UserContext(), db, strings.TrimSpace(c.Params("server_id")), baseID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Base not found")
			}
			return apptypes.Error(http.StatusInternalServerError, "Failed to load base")
		}
		return apptypes.JSON(c, http.StatusOK, item)
	}
}

// createBase godoc
// @Summary Create an immutable server base
// @Description Creates a Discord message in the selected server channel, then persists an immutable base using the returned message ID. If persistence fails, the API attempts to remove the new Discord message and reports the compensation result.
// @Tags Bases
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param body body modelsv2.CreateBaseRequest true "Base"
// @Success 201 {object} modelsv2.Base
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.BaseCreateErrorResponse
// @Failure 500 {object} modelsv2.BaseCreateErrorResponse
// @Failure 502 {object} modelsv2.BaseCreateErrorResponse
// @Failure 503 {object} modelsv2.BaseCreateErrorResponse
// @Router /v2/server/{server_id}/bases [post]
func createBase(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		var body modelsv2.CreateBaseRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateCreateBaseRequest(&body); err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		var integration baseMessageIntegration
		if a.Discord != nil {
			integration = a.Discord
		}
		item, err := createManagedBase(c.UserContext(), db, integration, serverID, body)
		if err != nil {
			var failure *baseCreateFailure
			if errors.As(err, &failure) {
				return writeBaseCreateFailure(c, failure)
			}
			return writeBaseCreateFailure(c, &baseCreateFailure{
				status:    http.StatusInternalServerError,
				code:      modelsv2.ErrorCodeInternal,
				message:   "Failed to create base",
				cleanup:   baseMessageCleanupNotNeeded,
				retryable: true,
				cause:     err,
			})
		}
		return apptypes.JSON(c, http.StatusCreated, item)
	}
}

// deleteBase godoc
// @Summary Delete an immutable server base
// @Description Deletes the associated Discord message first, then deletes the server-owned database row. A missing Discord message is treated as already cleaned up; other Discord failures retain the database row for retry.
// @Tags Bases
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param base_id path string true "Base ID"
// @Success 200 {object} modelsv2.BaseDeleteResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.BaseDeleteErrorResponse
// @Failure 500 {object} modelsv2.BaseDeleteErrorResponse
// @Failure 502 {object} modelsv2.BaseDeleteErrorResponse
// @Failure 503 {object} modelsv2.BaseDeleteErrorResponse
// @Router /v2/server/{server_id}/bases/{base_id} [delete]
func deleteBase(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		var deleter baseMessageDeleter
		if a.Discord != nil {
			deleter = a.Discord
		}

		cleanup, err := deleteManagedBase(c.UserContext(), db, deleter, serverID, baseID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Base not found")
			}
			var failure *baseDeleteFailure
			if errors.As(err, &failure) {
				return writeBaseDeleteFailure(c, baseID, failure)
			}
			return writeBaseDeleteFailure(c, baseID, &baseDeleteFailure{
				status:    http.StatusInternalServerError,
				code:      modelsv2.ErrorCodeInternal,
				message:   "Failed to delete base",
				cleanup:   baseMessageCleanupFailed,
				retryable: true,
				cause:     err,
			})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.BaseDeleteResponse{
			BaseID:                baseID,
			DatabaseDeleted:       true,
			DiscordMessageCleanup: cleanup,
		})
	}
}

// getBaseDownloaderProfile godoc
// @Summary Resolve one base downloader
// @Description Resolves a safe current Discord display name and avatar only after proving the user appears in this server-owned base's downloader history.
// @Tags Bases
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param base_id path string true "Base ID"
// @Param user_id path string true "Discord user ID"
// @Success 200 {object} modelsv2.BaseDownloaderProfile
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bases/{base_id}/downloaders/{user_id} [get]
func getBaseDownloaderProfile(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		serverID := strings.TrimSpace(c.Params("server_id"))
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		userID := strings.TrimSpace(c.Params("user_id"))
		guildSnowflake, guildErr := strconv.ParseInt(serverID, 10, 64)
		userSnowflake, userErr := strconv.ParseInt(userID, 10, 64)
		if guildErr != nil || guildSnowflake <= 0 || userErr != nil || userSnowflake <= 0 {
			return apptypes.Error(http.StatusBadRequest, "Invalid Discord ID")
		}
		exists, err := baseHasDownloader(c.UserContext(), db, serverID, baseID, userID)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to load base downloader")
		}
		if !exists {
			return apptypes.Error(http.StatusNotFound, "Base downloader not found")
		}

		response := modelsv2.BaseDownloaderProfile{UserID: userID}
		if a.Discord != nil {
			if member := a.Discord.GetMemberDirect(c.UserContext(), guildSnowflake, userSnowflake); member != nil {
				if displayName := strings.TrimSpace(member.EffectiveName()); displayName != "" {
					response.DisplayName = &displayName
				}
				if avatarURL := strings.TrimSpace(member.EffectiveAvatarURL()); avatarURL != "" {
					response.AvatarURL = &avatarURL
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// uploadBaseImage godoc
// @Summary Upload a base image
// @Description Uploads one base image through the current Bunny CDN storage path for later use in immutable base creation.
// @Tags Bases
// @Accept multipart/form-data
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param file formData file true "Image (max 25 MB)"
// @Success 200 {object} modelsv2.CDNUploadResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Failure 413 {object} modelsv2.ErrorResponse
// @Failure 415 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/bases/images [post]
func uploadBaseImage(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil || fileHeader == nil {
			return apptypes.Error(http.StatusBadRequest, "A 'file' field is required")
		}
		if fileHeader.Size > maxCDNUploadSize {
			return apptypes.Error(http.StatusRequestEntityTooLarge, "File too large (max 25 MB)")
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(fileHeader.Filename), "."))
		if !baseImageExtensions[ext] {
			return apptypes.Error(http.StatusUnsupportedMediaType, "Unsupported base image type")
		}
		file, err := fileHeader.Open()
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Failed to open uploaded image")
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Failed to read uploaded image")
		}
		if len(data) > maxCDNUploadSize {
			return apptypes.Error(http.StatusRequestEntityTooLarge, "File too large (max 25 MB)")
		}

		title := fmt.Sprintf("base_%s", uuid.New().String())
		// TODO: Migrate base image storage from Bunny CDN to Cloudflare when that project is authorized.
		cdnURL, err := bunnyUploadFileWithExt(a.Config.BunnyAccessKey, title, ext, data)
		if err != nil {
			return apptypes.Error(http.StatusInternalServerError, "Failed to upload base image")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.CDNUploadResponse{
			URL: cdnURL, Filename: fmt.Sprintf("%s.%s", title, ext),
		})
	}
}

func configuredBasesDB(a apptypes.Deps) (basesDB, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(http.StatusServiceUnavailable, "Database is not configured")
	}
	return a.Store.SQL, nil
}

func basesPagination(c *fiber.Ctx) (int, int) {
	limit := c.QueryInt("limit", defaultBasesLimit)
	if limit <= 0 {
		limit = defaultBasesLimit
	}
	if limit > maxBasesLimit {
		limit = maxBasesLimit
	}
	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func queryBases(ctx context.Context, db basesDB, serverID string, limit, offset int) ([]modelsv2.Base, int, error) {
	var total int
	if err := db.QueryRow(ctx, `
		SELECT count(*)::int
		FROM bases
		WHERE server_id = $1 AND channel_id IS NOT NULL
	`, serverID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, `
		SELECT `+baseSelectColumns+`
		FROM bases AS b
		WHERE b.server_id = $1 AND b.channel_id IS NOT NULL
		ORDER BY b.created_at DESC, b.id DESC
		LIMIT $2 OFFSET $3
	`, serverID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]modelsv2.Base, 0)
	for rows.Next() {
		item, err := scanBase(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func queryBase(ctx context.Context, db basesDB, serverID, baseID string) (modelsv2.Base, error) {
	return scanBase(db.QueryRow(ctx, `
		SELECT `+baseSelectColumns+`
		FROM bases AS b
		WHERE b.id = $1::uuid AND b.server_id = $2 AND b.channel_id IS NOT NULL
	`, baseID, serverID))
}

func insertBase(ctx context.Context, db basesDB, serverID, messageID string, body modelsv2.CreateBaseRequest) (modelsv2.Base, error) {
	return scanBase(db.QueryRow(ctx, `
		INSERT INTO bases (
			server_id, channel_id, message_id, base_link, images, description,
			downloaders, upvoter_ids, downvoter_ids
		)
		VALUES ($1, $2, $3, $4, $5, $6, '{}'::text[], '{}'::text[], '{}'::text[])
		RETURNING `+baseInsertReturningColumns+`
	`,
		serverID, body.ChannelID, messageID, body.BaseLink, body.Images, body.Description,
	))
}

func createManagedBase(ctx context.Context, db basesDB, integration baseMessageIntegration, serverID string, body modelsv2.CreateBaseRequest) (modelsv2.Base, error) {
	if integration == nil {
		return modelsv2.Base{}, &baseCreateFailure{
			status:    http.StatusServiceUnavailable,
			code:      modelsv2.ErrorCodeUpstreamUnavailable,
			message:   "Discord message creation is temporarily unavailable",
			cleanup:   baseMessageCleanupNotNeeded,
			retryable: true,
			cause:     errors.New("Discord client is unavailable"),
		}
	}
	guildID, guildErr := strconv.ParseInt(serverID, 10, 64)
	channelID, channelErr := strconv.ParseInt(body.ChannelID, 10, 64)
	if guildErr != nil || guildID <= 0 || channelErr != nil || channelID <= 0 {
		return modelsv2.Base{}, &baseCreateFailure{
			status:    http.StatusConflict,
			code:      modelsv2.ErrorCodeConflict,
			message:   "Selected Discord channel is invalid for this server",
			cleanup:   baseMessageCleanupNotNeeded,
			retryable: false,
			cause:     errors.New("invalid Discord server or channel ID"),
		}
	}

	messageID, err := integration.CreateBaseMessage(
		ctx, guildID, channelID, body.BaseLink, body.Description, body.Images,
	)
	if err != nil {
		return modelsv2.Base{}, classifyBaseMessageCreateFailure(err)
	}
	parsedMessageID, err := strconv.ParseInt(messageID, 10, 64)
	if err != nil || parsedMessageID <= 0 {
		return modelsv2.Base{}, &baseCreateFailure{
			status:         http.StatusBadGateway,
			code:           modelsv2.ErrorCodeUpstreamUnavailable,
			message:        "Discord returned an invalid created message",
			messageCreated: true,
			messageID:      &messageID,
			cleanup:        baseMessageCleanupFailed,
			retryable:      false,
			cause:          errors.New("invalid Discord message ID"),
		}
	}

	item, err := insertBase(ctx, db, serverID, messageID, body)
	if err == nil {
		return item, nil
	}

	cleanup := baseMessageCleanupDeleted
	cleanupErr := integration.DeleteMessage(ctx, channelID, parsedMessageID)
	if cleanupErr != nil {
		if isMissingBaseMessage(cleanupErr) {
			cleanup = baseMessageCleanupAlreadyMissing
		} else {
			cleanup = baseMessageCleanupFailed
		}
	}
	message := "Base was not saved; the created Discord message was removed"
	retryable := true
	if cleanup == baseMessageCleanupAlreadyMissing {
		message = "Base was not saved; the created Discord message was already missing"
	}
	if cleanup == baseMessageCleanupFailed {
		message = "Base was not saved and its created Discord message could not be removed"
		retryable = false
	}
	cause := err
	if cleanupErr != nil && cleanup == baseMessageCleanupFailed {
		cause = errors.Join(err, cleanupErr)
	}
	return modelsv2.Base{}, &baseCreateFailure{
		status:         http.StatusInternalServerError,
		code:           modelsv2.ErrorCodeInternal,
		message:        message,
		messageCreated: true,
		messageID:      &messageID,
		cleanup:        cleanup,
		retryable:      retryable,
		cause:          cause,
	}
}

func baseHasDownloader(ctx context.Context, db basesDB, serverID, baseID, userID string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM bases
			WHERE id = $1::uuid
			  AND server_id = $2
			  AND channel_id IS NOT NULL
			  AND $3 = ANY(downloaders)
		)
	`, baseID, serverID, userID).Scan(&exists)
	return exists, err
}

func deleteManagedBase(ctx context.Context, db basesDB, deleter baseMessageDeleter, serverID, baseID string) (string, error) {
	var storedServerID, channelID, messageID string
	if err := db.QueryRow(ctx, `
		SELECT server_id, channel_id, message_id
		FROM bases
		WHERE id = $1::uuid AND server_id = $2 AND channel_id IS NOT NULL
	`, baseID, serverID).Scan(&storedServerID, &channelID, &messageID); err != nil {
		return "", err
	}

	storedGuild, guildErr := strconv.ParseInt(storedServerID, 10, 64)
	storedChannel, channelErr := strconv.ParseInt(channelID, 10, 64)
	storedMessage, messageErr := strconv.ParseInt(messageID, 10, 64)
	if guildErr != nil || storedGuild <= 0 || channelErr != nil || storedChannel <= 0 || messageErr != nil || storedMessage <= 0 {
		return "", &baseDeleteFailure{
			status:    http.StatusConflict,
			code:      modelsv2.ErrorCodeConflict,
			message:   "Base has an invalid stored Discord message location",
			cleanup:   baseMessageCleanupFailed,
			retryable: false,
			cause:     errors.New("invalid stored Discord message location"),
		}
	}
	if deleter == nil {
		return "", &baseDeleteFailure{
			status:    http.StatusServiceUnavailable,
			code:      modelsv2.ErrorCodeUpstreamUnavailable,
			message:   "Discord message cleanup is temporarily unavailable",
			cleanup:   baseMessageCleanupFailed,
			retryable: true,
			cause:     errors.New("Discord client is unavailable"),
		}
	}

	cleanup := baseMessageCleanupDeleted
	if err := deleter.DeleteMessage(ctx, storedChannel, storedMessage); err != nil {
		if isMissingBaseMessage(err) {
			cleanup = baseMessageCleanupAlreadyMissing
		} else {
			return "", classifyBaseMessageDeleteFailure(err)
		}
	}

	tag, err := db.Exec(ctx, `
		DELETE FROM bases
		WHERE id = $1::uuid AND server_id = $2
	`, baseID, serverID)
	if err != nil {
		return "", &baseDeleteFailure{
			status:    http.StatusInternalServerError,
			code:      modelsv2.ErrorCodeInternal,
			message:   "Discord message cleanup completed, but the base record could not be deleted",
			cleanup:   cleanup,
			retryable: true,
			cause:     err,
		}
	}
	if tag.RowsAffected() == 0 {
		// A concurrent manager request already completed the same desired deletion.
		return cleanup, nil
	}
	return cleanup, nil
}

func isMissingBaseMessage(err error) bool {
	if disgorest.IsJSONErrorCode(err, disgorest.JSONErrorCodeUnknownMessage) {
		return true
	}
	var discordErr *disgorest.Error
	return errors.As(err, &discordErr) &&
		discordErr.Response != nil &&
		discordErr.Response.StatusCode == http.StatusNotFound
}

func classifyBaseMessageDeleteFailure(err error) *baseDeleteFailure {
	failure := &baseDeleteFailure{
		status:    http.StatusServiceUnavailable,
		code:      modelsv2.ErrorCodeUpstreamUnavailable,
		message:   "Discord message cleanup is temporarily unavailable",
		cleanup:   baseMessageCleanupFailed,
		retryable: true,
		cause:     err,
	}
	var discordErr *disgorest.Error
	if !errors.As(err, &discordErr) || discordErr.Response == nil {
		return failure
	}
	switch status := discordErr.Response.StatusCode; {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		failure.status = http.StatusBadGateway
		failure.message = "Discord rejected message cleanup because the bot lacks access"
		failure.retryable = false
	case status == http.StatusTooManyRequests || status >= http.StatusInternalServerError:
		// Keep the default retryable upstream-unavailable response.
	default:
		failure.status = http.StatusBadGateway
		failure.message = "Discord rejected message cleanup"
		failure.retryable = false
	}
	return failure
}

func classifyBaseMessageCreateFailure(err error) *baseCreateFailure {
	failure := &baseCreateFailure{
		status:    http.StatusServiceUnavailable,
		code:      modelsv2.ErrorCodeUpstreamUnavailable,
		message:   "Discord message creation is temporarily unavailable",
		cleanup:   baseMessageCleanupNotNeeded,
		retryable: true,
		cause:     err,
	}
	if errors.Is(err, apptypes.ErrDiscordCreatedMessageNoID) {
		failure.status = http.StatusBadGateway
		failure.message = "Discord created the base message but did not return its ID"
		failure.messageCreated = true
		failure.cleanup = baseMessageCleanupFailed
		failure.retryable = false
		return failure
	}
	if errors.Is(err, apptypes.ErrDiscordChannelOutsideGuild) ||
		errors.Is(err, apptypes.ErrDiscordChannelNotWritable) ||
		disgorest.IsJSONErrorCode(err, disgorest.JSONErrorCodeUnknownChannel) {
		failure.status = http.StatusConflict
		failure.code = modelsv2.ErrorCodeConflict
		failure.message = "Selected Discord channel is not available for this server"
		failure.retryable = false
		return failure
	}
	var discordErr *disgorest.Error
	if !errors.As(err, &discordErr) || discordErr.Response == nil {
		return failure
	}
	switch status := discordErr.Response.StatusCode; {
	case status == http.StatusNotFound:
		failure.status = http.StatusConflict
		failure.code = modelsv2.ErrorCodeConflict
		failure.message = "Selected Discord channel is not available for this server"
		failure.retryable = false
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		failure.status = http.StatusBadGateway
		failure.message = "Discord rejected message creation because the bot lacks access"
		failure.retryable = false
	case status == http.StatusTooManyRequests || status >= http.StatusInternalServerError:
		// Keep the default retryable upstream-unavailable response.
	default:
		failure.status = http.StatusBadGateway
		failure.message = "Discord rejected message creation"
		failure.retryable = false
	}
	return failure
}

func writeBaseCreateFailure(c *fiber.Ctx, failure *baseCreateFailure) error {
	apptypes.Logger().Error(
		"base_create_failed",
		"request_id", apptypes.RequestID(c),
		"status", failure.status,
		"discord_message_created", failure.messageCreated,
		"discord_message_id", failure.messageID,
		"discord_message_cleanup", failure.cleanup,
		"retryable", failure.retryable,
		"error", failure.Error(),
	)
	return apptypes.JSON(c, failure.status, modelsv2.BaseCreateErrorResponse{
		Code:                  failure.code,
		Message:               failure.message,
		RequestID:             apptypes.RequestID(c),
		DatabaseInserted:      false,
		DiscordMessageCreated: failure.messageCreated,
		DiscordMessageID:      failure.messageID,
		DiscordMessageCleanup: failure.cleanup,
		Retryable:             failure.retryable,
	})
}

func writeBaseDeleteFailure(c *fiber.Ctx, baseID string, failure *baseDeleteFailure) error {
	apptypes.Logger().Error(
		"base_delete_failed",
		"request_id", apptypes.RequestID(c),
		"base_id", baseID,
		"status", failure.status,
		"discord_message_cleanup", failure.cleanup,
		"retryable", failure.retryable,
		"error", failure.Error(),
	)
	return apptypes.JSON(c, failure.status, modelsv2.BaseDeleteErrorResponse{
		Code:                  failure.code,
		Message:               failure.message,
		RequestID:             apptypes.RequestID(c),
		BaseID:                baseID,
		DatabaseDeleted:       false,
		DiscordMessageCleanup: failure.cleanup,
		Retryable:             failure.retryable,
	})
}

// upsertBaseVote godoc
// @Summary Record a trusted bot base vote
// @Description Atomically records or changes one vote in the base voter arrays. This endpoint accepts only the configured bot credential.
// @Tags Bases Bot Integration
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param base_id path string true "Base ID"
// @Param voter_id path string true "Discord voter ID"
// @Param body body modelsv2.BaseVoteRequest true "Vote direction"
// @Success 200 {object} modelsv2.BaseVoteResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/bases/{base_id}/votes/{voter_id} [put]
func upsertBaseVote(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		voterID := strings.TrimSpace(c.Params("voter_id"))
		if !validPositiveDecimalID(voterID) {
			return apptypes.Error(http.StatusBadRequest, "Invalid voter_id")
		}
		var body modelsv2.BaseVoteRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body.Direction = strings.ToLower(strings.TrimSpace(body.Direction))
		if body.Direction != "up" && body.Direction != "down" {
			return apptypes.Error(http.StatusBadRequest, "direction must be up or down")
		}
		response, err := persistBaseVote(c.UserContext(), db, baseID, voterID, body.Direction)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Base not found")
			}
			return apptypes.Error(http.StatusInternalServerError, "Failed to record base vote")
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// removeBaseVote godoc
// @Summary Remove a trusted bot base vote
// @Description Atomically and idempotently removes one Discord voter from both base voter arrays. This endpoint accepts only the configured bot credential.
// @Tags Bases Bot Integration
// @Security ApiKeyAuth
// @Param base_id path string true "Base ID"
// @Param voter_id path string true "Discord voter ID"
// @Success 204
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/bases/{base_id}/votes/{voter_id} [delete]
func removeBaseVote(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		voterID := strings.TrimSpace(c.Params("voter_id"))
		if !validPositiveDecimalID(voterID) {
			return apptypes.Error(http.StatusBadRequest, "Invalid voter_id")
		}
		if err := deleteBaseVote(c.UserContext(), db, baseID, voterID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Base not found")
			}
			return apptypes.Error(http.StatusInternalServerError, "Failed to remove base vote")
		}
		return c.SendStatus(http.StatusNoContent)
	}
}

// recordBaseDownload godoc
// @Summary Record a trusted bot base download
// @Description Adds one Discord user ID to unique download history. Repeated downloads by the same user are a no-op. This endpoint accepts only the configured bot credential.
// @Tags Bases Bot Integration
// @Produce json
// @Security ApiKeyAuth
// @Param base_id path string true "Base ID"
// @Param user_id path string true "Discord user ID"
// @Success 200 {object} modelsv2.BaseDownloadResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/bases/{base_id}/downloaders/{user_id} [post]
func recordBaseDownload(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		db, err := configuredBasesDB(a)
		if err != nil {
			return err
		}
		baseID, err := parseBaseID(c.Params("base_id"))
		if err != nil {
			return err
		}
		userID := strings.TrimSpace(c.Params("user_id"))
		if !validPositiveDecimalID(userID) {
			return apptypes.Error(http.StatusBadRequest, "Invalid user_id")
		}
		count, err := appendUniqueBaseDownloader(c.UserContext(), db, baseID, userID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Base not found")
			}
			return apptypes.Error(http.StatusInternalServerError, "Failed to record base download")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.BaseDownloadResponse{
			BaseID: baseID, UserID: userID, DownloadCount: count,
		})
	}
}

func persistBaseVote(ctx context.Context, db basesDB, baseID, voterID, direction string) (modelsv2.BaseVoteResponse, error) {
	var response modelsv2.BaseVoteResponse
	err := db.QueryRow(ctx, `
		UPDATE bases
		SET upvoter_ids = CASE
				WHEN $3 = 'up' THEN array_append(array_remove(upvoter_ids, $2), $2)
				ELSE array_remove(upvoter_ids, $2)
			END,
			downvoter_ids = CASE
				WHEN $3 = 'down' THEN array_append(array_remove(downvoter_ids, $2), $2)
				ELSE array_remove(downvoter_ids, $2)
			END
		WHERE id = $1::uuid
		RETURNING id::text, $2::text, $3::text
	`, baseID, voterID, direction).Scan(&response.BaseID, &response.VoterID, &response.Direction)
	return response, err
}

func deleteBaseVote(ctx context.Context, db basesDB, baseID, voterID string) error {
	var returnedID string
	return db.QueryRow(ctx, `
		UPDATE bases
		SET upvoter_ids = array_remove(upvoter_ids, $2),
			downvoter_ids = array_remove(downvoter_ids, $2)
		WHERE id = $1::uuid
		RETURNING id::text
	`, baseID, voterID).Scan(&returnedID)
}

func appendUniqueBaseDownloader(ctx context.Context, db basesDB, baseID, userID string) (int, error) {
	var count int
	err := db.QueryRow(ctx, `
		UPDATE bases
		SET downloaders = CASE
			WHEN $2 = ANY(downloaders) THEN downloaders
			ELSE array_append(downloaders, $2)
		END
		WHERE id = $1::uuid
		RETURNING cardinality(downloaders)::int
	`, baseID, userID).Scan(&count)
	return count, err
}

func scanBase(row baseRowScanner) (modelsv2.Base, error) {
	var item modelsv2.Base
	if err := row.Scan(
		&item.ID, &item.ServerID, &item.ChannelID, &item.MessageID, &item.BaseLink,
		&item.Images, &item.Description, &item.DownloadCount, &item.Upvotes,
		&item.Downvotes, &item.Downloaders, &item.CreatedAt,
	); err != nil {
		return modelsv2.Base{}, err
	}
	if item.Images == nil {
		item.Images = []string{}
	}
	if item.Downloaders == nil {
		item.Downloaders = []string{}
	}
	item.DiscordMessageURL = fmt.Sprintf(
		"https://discord.com/channels/%s/%s/%s",
		item.ServerID, item.ChannelID, item.MessageID,
	)
	return item, nil
}

func validateCreateBaseRequest(body *modelsv2.CreateBaseRequest) error {
	body.ChannelID = strings.TrimSpace(body.ChannelID)
	body.BaseLink = strings.TrimSpace(body.BaseLink)
	body.Images = normalizeStrings(body.Images)

	if !validPositiveDecimalID(body.ChannelID) {
		return apptypes.Error(http.StatusBadRequest, "channelId must be a valid Discord channel ID")
	}
	if !validHTTPSURL(body.BaseLink) {
		return apptypes.Error(http.StatusBadRequest, "baseLink must be a valid HTTPS URL")
	}
	if utf8.RuneCountInString(body.Description) > maxBaseDescription {
		return apptypes.Error(http.StatusBadRequest, "description must be at most 1000 characters")
	}
	if len(body.Images) > maxBaseImages {
		return apptypes.Error(http.StatusBadRequest, "images must contain at most four URLs")
	}
	for _, image := range body.Images {
		parsed, err := url.Parse(image)
		if err != nil || parsed.Scheme != "https" || parsed.Host != "cdn.clashk.ing" {
			return apptypes.Error(http.StatusBadRequest, "images must use the ClashKing CDN")
		}
	}
	return nil
}

func parseBaseID(value string) (string, error) {
	parsed, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", apptypes.Error(http.StatusBadRequest, "Invalid base_id")
	}
	return parsed.String(), nil
}

func validPositiveDecimalID(value string) bool {
	parsed, err := strconv.ParseUint(value, 10, 64)
	return err == nil && parsed > 0
}

func validHTTPSURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}

func normalizeStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, strings.TrimSpace(value))
	}
	return out
}
