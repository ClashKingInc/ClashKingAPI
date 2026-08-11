package routes

import (
	"context"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

const (
	townhall18AchievementID          = "townhall_18"
	warWarriorAchievementID          = "war_warrior"
	mrLegendAchievementID            = "mr_legend"
	defenseDoesntMatterAchievementID = "defense_doesnt_matter"
	achievementLifetimeOccurrenceKey = "lifetime"
	achievementAssetBaseURL          = "https://assets.clashk.ing/achievements/"
)

var achievementDefinitions = []modelsv2.Achievement{
	{
		ID:         townhall18AchievementID,
		AssetURL:   achievementAssetBaseURL + "town-hall-18-achievement-badge.glb",
		Repeatable: true,
	},
	{
		ID:         warWarriorAchievementID,
		AssetURL:   achievementAssetBaseURL + "war-champion-achievement-badge.glb",
		Repeatable: true,
	},
	{
		ID:         mrLegendAchievementID,
		AssetURL:   achievementAssetBaseURL + "perfect-legends-day-achievement-badge.glb",
		Repeatable: true,
	},
	{
		ID:         defenseDoesntMatterAchievementID,
		AssetURL:   achievementAssetBaseURL + "bad-legends-achievement-badge.glb",
		Repeatable: true,
	},
}

// @Summary List achievements
// @Description Lists every available achievement with its model asset and the authenticated user's earned count.
// @Tags Achievements
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.AchievementsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/achievements [get]
func listAchievements(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		counts, err := achievementAwardCounts(c.UserContext(), a, apptypes.UserID(c.UserContext()))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, achievementCatalog(counts))
	}
}

// @Summary Check achievements
// @Description Checks verified linked players for achievements that can currently be evaluated, awards new matches, and returns the full catalog.
// @Tags Achievements
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.AchievementsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/achievements/check [post]
func checkAchievements(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()
		userID := apptypes.UserID(ctx)
		tags, err := verifiedAchievementPlayerTags(ctx, a, userID)
		if err != nil {
			return err
		}

		for result := range a.Clash.FetchPlayers(ctx, tags) {
			if result.Err != nil || result.Player == nil {
				continue
			}
			for _, achievementID := range evaluatedAchievementIDs(result.Player) {
				if _, err := a.Store.SQL.Exec(ctx, `
					INSERT INTO achievement_player_awards (
						achievement_id,
						player_tag,
						occurrence_key
					)
					VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING
				`, achievementID, apptypes.NormalizeTag(result.Player.Tag), achievementLifetimeOccurrenceKey); err != nil {
					return err
				}
			}
		}

		counts, err := achievementAwardCounts(ctx, a, userID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, achievementCatalog(counts))
	}
}

func verifiedAchievementPlayerTags(ctx context.Context, a apptypes.Deps, userID string) ([]string, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT tag
		FROM player_links
		WHERE user_id = $1 AND is_verified = true
		ORDER BY order_index ASC, added_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tags := make([]string, 0)
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func achievementAwardCounts(ctx context.Context, a apptypes.Deps, userID string) (map[string]int, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT awards.achievement_id, count(*)
		FROM achievement_player_awards AS awards
		JOIN player_links AS links ON links.tag = awards.player_tag
		WHERE links.user_id = $1 AND links.is_verified = true
		GROUP BY awards.achievement_id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var achievementID string
		var count int
		if err := rows.Scan(&achievementID, &count); err != nil {
			return nil, err
		}
		counts[achievementID] = count
	}
	return counts, rows.Err()
}

func evaluatedAchievementIDs(player *clashy.Player) []string {
	ids := make([]string, 0, 2)
	if player.TownHall >= 18 {
		ids = append(ids, townhall18AchievementID)
	}
	if player.WarStars >= 5000 {
		ids = append(ids, warWarriorAchievementID)
	}
	return ids
}

func achievementCatalog(counts map[string]int) modelsv2.AchievementsResponse {
	items := make([]modelsv2.Achievement, len(achievementDefinitions))
	for index, definition := range achievementDefinitions {
		definition.EarnedCount = counts[definition.ID]
		items[index] = definition
	}
	return modelsv2.AchievementsResponse{Items: items}
}
