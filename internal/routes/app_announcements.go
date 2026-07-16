package routes

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// appAnnouncement is the public mobile representation of an admin post. The
// field names intentionally preserve the established AppAnnouncement contract.
type appAnnouncement struct {
	ID               string          `json:"id"`
	Version          string          `json:"version"`
	Title            string          `json:"title"`
	Subtitle         string          `json:"subtitle"`
	BannerImageURL   *string         `json:"banner_image_url,omitempty"`
	BodyBlocks       json.RawMessage `json:"body_blocks"`
	PresentationType string          `json:"presentation_type"`
	StoryURL         *string         `json:"story_url,omitempty"`
	ShowOnHome       bool            `json:"show_on_home"`
	PinnedOnHome     bool            `json:"pinned_on_home"`
	TargetRoute      *string         `json:"target_route,omitempty"`
	Status           string          `json:"status"`
	PublishedAt      *time.Time      `json:"published_at,omitempty"`
	StartsAt         *time.Time      `json:"starts_at,omitempty"`
	EndsAt           *time.Time      `json:"ends_at,omitempty"`
}

func appAnnouncementColumns(localePlaceholder string) string {
	return fmt.Sprintf(`
	id::text, updated_at::text,
	COALESCE(NULLIF(translations -> %s ->> 'title', ''), title),
	COALESCE(NULLIF(translations -> %s ->> 'summary', ''), summary),
	hero_image_url, COALESCE(translations -> %s -> 'body_blocks', body_blocks),
	presentation_type, story_url, show_on_home, pinned_on_home, target_route,
	status, published_at, starts_at, ends_at
`, localePlaceholder, localePlaceholder, localePlaceholder)
}

func requestedContentLocale(c *fiber.Ctx) string {
	locale := strings.ToLower(strings.TrimSpace(c.Query("locale", "en")))
	locale = strings.Split(strings.ReplaceAll(locale, "_", "-"), "-")[0]
	if len(locale) != 2 {
		return "en"
	}
	return locale
}

func scanAppAnnouncement(scanner interface{ Scan(...any) error }) (appAnnouncement, error) {
	var item appAnnouncement
	var blocks []byte
	err := scanner.Scan(
		&item.ID, &item.Version, &item.Title, &item.Subtitle,
		&item.BannerImageURL, &blocks, &item.PresentationType, &item.StoryURL, &item.ShowOnHome,
		&item.PinnedOnHome, &item.TargetRoute, &item.Status, &item.PublishedAt,
		&item.StartsAt, &item.EndsAt,
	)
	item.BodyBlocks = json.RawMessage(blocks)
	return item, err
}

// getActiveAppAnnouncement returns the ordered home carousel for the requesting
// platform. Pinned posts come first, while the legacy item field preserves the
// previous single-announcement contract. It is public because it is read before
// authentication.
func getActiveAppAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		target := c.Query("target", "all")
		locale := requestedContentLocale(c)
		if target != "all" && target != "ios" && target != "android" && target != "web" {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported announcement target")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT `+appAnnouncementColumns("$2")+`
			FROM admin_posts
			WHERE status = 'live'
			  AND (ends_at IS NULL OR ends_at > now())
			  AND ($1 = 'all' OR $1 = ANY(platforms))
			  AND show_on_home = true
			ORDER BY pinned_on_home DESC, priority DESC, published_at DESC
			LIMIT 10
		`, target, locale)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []appAnnouncement{}
		for rows.Next() {
			item, err := scanAppAnnouncement(rows)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		var first any
		if len(items) > 0 {
			first = items[0]
		}
		return apptypes.JSON(c, fiber.StatusOK, fiber.Map{"item": first, "items": items})
	}
}

// listPublishedAppPosts returns current and expired published posts for the
// in-app archive. Draft, scheduled, and archived content is never exposed.
func listPublishedAppPosts(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		target := c.Query("target", "all")
		locale := requestedContentLocale(c)
		if target != "all" && target != "ios" && target != "android" && target != "web" {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported post target")
		}
		limit := c.QueryInt("limit", 20)
		offset := c.QueryInt("offset", 0)
		if limit < 1 || limit > 50 || offset < 0 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid pagination")
		}

		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT `+appAnnouncementColumns("$4")+`
			FROM admin_posts
			WHERE status IN ('live', 'expired')
			  AND published_at IS NOT NULL
			  AND ($1 = 'all' OR $1 = ANY(platforms))
			ORDER BY published_at DESC
			LIMIT $2 OFFSET $3
		`, target, limit+1, offset, locale)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []appAnnouncement{}
		for rows.Next() {
			item, err := scanAppAnnouncement(rows)
			if err != nil {
				return err
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		hasMore := len(items) > limit
		if hasMore {
			items = items[:limit]
		}
		return apptypes.JSON(c, fiber.StatusOK, fiber.Map{
			"items":       items,
			"has_more":    hasMore,
			"next_offset": offset + len(items),
		})
	}
}

// getAppAnnouncement returns one live post so a notification can open the
// exact content it announced instead of whichever announcement is active now.
func getAppAnnouncement(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		item, err := scanAppAnnouncement(a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT `+appAnnouncementColumns("$2")+`
			FROM admin_posts
			WHERE id::text = $1
			  AND status IN ('live', 'expired')
		`, c.Params("id"), requestedContentLocale(c)))
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(fiber.StatusNotFound, "Announcement not found")
		}
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, fiber.Map{"item": item})
	}
}
