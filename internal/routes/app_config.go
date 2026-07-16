package routes

import (
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

type publicFeatureFlag struct {
	Key               string     `json:"key"`
	Enabled           bool       `json:"enabled"`
	RolloutPercentage int        `json:"rollout_percentage"`
	MinAppVersion     string     `json:"min_app_version,omitempty"`
	Platforms         []string   `json:"platforms"`
	StartsAt          *time.Time `json:"starts_at,omitempty"`
	EndsAt            *time.Time `json:"ends_at,omitempty"`
}

// getAppConfig exposes only safe flag keys and delivery rules. Sensitive
// roadmap names and admin metadata never leave the authenticated panel.
func getAppConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT flag_key, enabled, rollout_percentage,
			min_app_version, platforms, starts_at, ends_at FROM admin_feature_flags
			WHERE public_exposure = 'safe' ORDER BY flag_key`)
		if err != nil {
			return err
		}
		defer rows.Close()
		flags := []publicFeatureFlag{}
		for rows.Next() {
			var flag publicFeatureFlag
			if err := rows.Scan(&flag.Key, &flag.Enabled, &flag.RolloutPercentage, &flag.MinAppVersion, &flag.Platforms, &flag.StartsAt, &flag.EndsAt); err != nil {
				return err
			}
			flags = append(flags, flag)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, fiber.Map{"flags": flags, "generated_at": time.Now().UTC()})
	}
}
