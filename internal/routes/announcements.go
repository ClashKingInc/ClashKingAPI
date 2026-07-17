package routes

import (
	"errors"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// activeAnnouncement returns the active mobile app announcement.
//
// @Summary Get active app announcement
// @Description Returns the currently active mobile app announcement, if one exists.
// @Tags Mobile App
// @Produce json
// @Param target query string false "all, ios, or android" Enums(all, ios, android)
// @Success 200 {object} modelsv2.ActiveAnnouncementResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements/active [get]
func activeAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		target, err := announcementTarget(c.Query("target", "all"))
		if err != nil {
			return err
		}
		item, err := sqlActiveAnnouncement(c, a, target)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.JSON(c, fiber.StatusOK, modelsv2.ActiveAnnouncementResponse{})
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ActiveAnnouncementResponse{Item: &item})
	}
}

// getAnnouncement returns a mobile app announcement.
//
// @Summary Get app announcement
// @Description Returns one mobile app announcement.
// @Tags Mobile App
// @Produce json
// @Param id path string true "Announcement ID"
// @Success 200 {object} modelsv2.Announcement
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements/{id} [get]
func getAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := sqlAnnouncementByID(c, a, c.Params("id"))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "Announcement not found")
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// listAnnouncements returns mobile app announcements for dashboard management.
//
// @Summary List app announcements
// @Description Returns mobile app announcements.
// @Tags Mobile App
// @Produce json
// @Security ApiKeyAuth
// @Param status query string false "draft, scheduled, published, or archived" Enums(draft, scheduled, published, archived)
// @Success 200 {object} modelsv2.AnnouncementListResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements [get]
func listAnnouncements(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		status := strings.TrimSpace(c.Query("status"))
		if status != "" {
			if _, err := announcementStatus(status); err != nil {
				return err
			}
		}
		items, err := sqlListAnnouncements(c, a, status)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AnnouncementListResponse{Items: items})
	}
}

// createAnnouncement creates a mobile app announcement.
//
// @Summary Create app announcement
// @Description Creates a mobile app announcement.
// @Tags Mobile App
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.AnnouncementRequest true "Announcement payload"
// @Success 200 {object} modelsv2.Announcement
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements [post]
func createAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AnnouncementRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		normalized, err := normalizeAnnouncementRequest(body, true)
		if err != nil {
			return err
		}
		item, err := sqlCreateAnnouncement(c, a, normalized)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// updateAnnouncement updates a mobile app announcement.
//
// @Summary Update app announcement
// @Description Updates a mobile app announcement.
// @Tags Mobile App
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "Announcement ID"
// @Param body body modelsv2.AnnouncementRequest true "Announcement payload"
// @Success 200 {object} modelsv2.Announcement
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements/{id} [put]
func updateAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AnnouncementRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		normalized, err := normalizeAnnouncementRequest(body, false)
		if err != nil {
			return err
		}
		item, err := sqlUpdateAnnouncement(c, a, c.Params("id"), normalized)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "Announcement not found")
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// deleteAnnouncement archives a mobile app announcement.
//
// @Summary Archive app announcement
// @Description Archives a mobile app announcement.
// @Tags Mobile App
// @Produce json
// @Security ApiKeyAuth
// @Param id path string true "Announcement ID"
// @Success 200 {object} modelsv2.Announcement
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/app/announcements/{id} [delete]
func deleteAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := sqlArchiveAnnouncement(c, a, c.Params("id"))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "Announcement not found")
			}
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

func announcementStatus(value string) (string, error) {
	status := strings.ToLower(strings.TrimSpace(value))
	if status == "" {
		status = "draft"
	}
	switch status {
	case "draft", "scheduled", "published", "archived":
		return status, nil
	default:
		return "", apptypes.Error(fiber.StatusBadRequest, "Invalid announcement status")
	}
}

func announcementTarget(value string) (string, error) {
	target := strings.ToLower(strings.TrimSpace(value))
	if target == "" {
		target = "all"
	}
	switch target {
	case "all", "ios", "android":
		return target, nil
	default:
		return "", apptypes.Error(fiber.StatusBadRequest, "Invalid announcement target")
	}
}

func normalizeAnnouncementRequest(body modelsv2.AnnouncementRequest, create bool) (modelsv2.AnnouncementRequest, error) {
	title := strings.TrimSpace(body.Title)
	subtitle := strings.TrimSpace(body.Subtitle)
	if title == "" {
		return body, apptypes.Error(fiber.StatusBadRequest, "Title is required")
	}
	if subtitle == "" {
		return body, apptypes.Error(fiber.StatusBadRequest, "Subtitle is required")
	}
	status, err := announcementStatus(body.Status)
	if err != nil {
		return body, err
	}
	target, err := announcementTarget(body.Target)
	if err != nil {
		return body, err
	}
	if create && body.StartsAt == nil {
		now := time.Now().UTC()
		body.StartsAt = &now
	}
	body.Title = title
	body.Subtitle = subtitle
	body.Status = status
	body.Target = target
	body.BannerImageURL = strings.TrimSpace(body.BannerImageURL)
	body.HTMLObjectKey = strings.TrimSpace(body.HTMLObjectKey)
	body.HTMLURL = strings.TrimSpace(body.HTMLURL)
	body.MinAppVersion = strings.TrimSpace(body.MinAppVersion)
	return body, nil
}

func sqlActiveAnnouncement(c *fiber.Ctx, a apptypes.Deps, target string) (modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.Announcement{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT id::text, title, subtitle, body, status, target, banner_image_url,
		       html_object_key, html_url, starts_at, ends_at, min_app_version,
		       created_at, updated_at
		FROM app_announcements
		WHERE status = 'published'
		  AND starts_at <= now()
		  AND (ends_at IS NULL OR ends_at > now())
		  AND (target = 'all' OR target = $1)
		ORDER BY starts_at DESC, created_at DESC
		LIMIT 1
	`, target)
	return scanAnnouncement(row)
}

func sqlAnnouncementByID(c *fiber.Ctx, a apptypes.Deps, id string) (modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.Announcement{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT id::text, title, subtitle, body, status, target, banner_image_url,
		       html_object_key, html_url, starts_at, ends_at, min_app_version,
		       created_at, updated_at
		FROM app_announcements
		WHERE id = $1
	`, id)
	return scanAnnouncement(row)
}

func sqlListAnnouncements(c *fiber.Ctx, a apptypes.Deps, status string) ([]modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	args := []any{}
	where := ""
	if status != "" {
		args = append(args, status)
		where = "WHERE status = $1"
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT id::text, title, subtitle, body, status, target, banner_image_url,
		       html_object_key, html_url, starts_at, ends_at, min_app_version,
		       created_at, updated_at
		FROM app_announcements
		`+where+`
		ORDER BY created_at DESC
		LIMIT 100
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.Announcement{}
	for rows.Next() {
		item, err := scanAnnouncement(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func sqlCreateAnnouncement(c *fiber.Ctx, a apptypes.Deps, body modelsv2.AnnouncementRequest) (modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.Announcement{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		INSERT INTO app_announcements (
			title, subtitle, body, status, target, banner_image_url,
			html_object_key, html_url, starts_at, ends_at, min_app_version
		)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9, $10, NULLIF($11, ''))
		RETURNING id::text, title, subtitle, body, status, target, banner_image_url,
		          html_object_key, html_url, starts_at, ends_at, min_app_version,
		          created_at, updated_at
	`, body.Title, body.Subtitle, body.Body, body.Status, body.Target, body.BannerImageURL, body.HTMLObjectKey, body.HTMLURL, body.StartsAt, body.EndsAt, body.MinAppVersion)
	return scanAnnouncement(row)
}

func sqlUpdateAnnouncement(c *fiber.Ctx, a apptypes.Deps, id string, body modelsv2.AnnouncementRequest) (modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.Announcement{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		UPDATE app_announcements
		SET title = $2,
		    subtitle = $3,
		    body = $4,
		    status = $5,
		    target = $6,
		    banner_image_url = NULLIF($7, ''),
		    html_object_key = NULLIF($8, ''),
		    html_url = NULLIF($9, ''),
		    starts_at = COALESCE($10, starts_at),
		    ends_at = $11,
		    min_app_version = NULLIF($12, ''),
		    updated_at = now()
		WHERE id = $1
		RETURNING id::text, title, subtitle, body, status, target, banner_image_url,
		          html_object_key, html_url, starts_at, ends_at, min_app_version,
		          created_at, updated_at
	`, id, body.Title, body.Subtitle, body.Body, body.Status, body.Target, body.BannerImageURL, body.HTMLObjectKey, body.HTMLURL, body.StartsAt, body.EndsAt, body.MinAppVersion)
	return scanAnnouncement(row)
}

func sqlArchiveAnnouncement(c *fiber.Ctx, a apptypes.Deps, id string) (modelsv2.Announcement, error) {
	if a.Store == nil || a.Store.SQL == nil {
		return modelsv2.Announcement{}, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		UPDATE app_announcements
		SET status = 'archived', updated_at = now()
		WHERE id = $1
		RETURNING id::text, title, subtitle, body, status, target, banner_image_url,
		          html_object_key, html_url, starts_at, ends_at, min_app_version,
		          created_at, updated_at
	`, id)
	return scanAnnouncement(row)
}

type announcementScanner interface {
	Scan(dest ...any) error
}

func scanAnnouncement(row announcementScanner) (modelsv2.Announcement, error) {
	var item modelsv2.Announcement
	var bannerImageURL, htmlObjectKey, htmlURL, minAppVersion pgtype.Text
	var endsAt pgtype.Timestamptz
	if err := row.Scan(
		&item.ID,
		&item.Title,
		&item.Subtitle,
		&item.Body,
		&item.Status,
		&item.Target,
		&bannerImageURL,
		&htmlObjectKey,
		&htmlURL,
		&item.StartsAt,
		&endsAt,
		&minAppVersion,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return item, err
	}
	if bannerImageURL.Valid {
		item.BannerImageURL = bannerImageURL.String
	}
	if htmlObjectKey.Valid {
		item.HTMLObjectKey = htmlObjectKey.String
	}
	if htmlURL.Valid {
		item.HTMLURL = htmlURL.String
	}
	if endsAt.Valid {
		value := endsAt.Time
		item.EndsAt = &value
	}
	if minAppVersion.Valid {
		item.MinAppVersion = minAppVersion.String
	}
	return item, nil
}
