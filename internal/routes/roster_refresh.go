package routes

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type rosterRefreshResult struct {
	ID        uuid.UUID
	Scope     string
	Refreshed int
	Failed    int
	At        time.Time
	Reused    bool
}

// refreshRosterBuilderCanonical godoc
// @Summary Refresh roster data or prepare role reconciliation
// @Description Data refreshes are synchronous and reuse a snapshot inside the configured cooldown. Role refresh returns the configured role and cache-ready Discord user IDs.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param roster_id path string true "Roster ID"
// @Param body body modelsv2.RosterRefreshRequest true "Refresh scope"
// @Success 200 {object} modelsv2.RosterRefreshResponseV2
// @Failure 409 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/rosters/{roster_id}/refresh [post]
func refreshRosterBuilderCanonical(a apptypes.Deps) fiber.Handler {
	return refreshRosterBuilder(a)
}

// refreshRosterBuilder godoc
// @Summary Refresh roster snapshot data
// @Description Enforces the configured data cooldown, deduplicates player tags, and invalidates only base view caches.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query string true "Discord server ID"
// @Param roster_id query string true "Roster ID"
// @Param body body modelsv2.RosterRefreshRequest true "Refresh scope"
// @Success 200 {object} modelsv2.RosterRefreshResponseV2
// @Failure 429 {object} modelsv2.ErrorResponse
// @Router /v2/roster/refresh-data [post]
func refreshRosterBuilder(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterRefreshRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.Scope != "data" && body.Scope != "role" {
			return apptypes.Error(http.StatusBadRequest, "scope must be data or role")
		}
		serverID, rosterID := c.Params("server_id"), c.Params("roster_id")
		if serverID == "" {
			serverID, rosterID = c.Query("server_id"), c.Query("roster_id")
		}
		if body.Scope == "role" {
			roleID, userIDs, err := rosterRoleRefreshTarget(c, a, serverID, rosterID)
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, modelsv2.RosterRefreshResponseV2{
				RefreshID: uuid.NewString(), Scope: "role", Status: "ready", RefreshedAt: time.Now().UTC(),
				RoleID: &roleID, RoleMemberUserIDs: userIDs,
			})
		}
		result, err := refreshRosterSnapshot(c, a, serverID, rosterID, body.Scope, true)
		if err != nil {
			return err
		}
		status := "completed"
		if result.Reused {
			status = "reused"
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RosterRefreshResponseV2{
			RefreshID: result.ID.String(), Scope: result.Scope, Status: status,
			RefreshedPlayers: result.Refreshed, FailedPlayers: result.Failed, RefreshedAt: result.At, Reused: result.Reused,
		})
	}
}

func rosterRoleRefreshTarget(c *fiber.Ctx, a apptypes.Deps, serverID, rosterID string) (string, []string, error) {
	var id uuid.UUID
	var roleID *string
	err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT id, roster_role_id FROM rosters WHERE id = $1 AND server_id = $2`, rosterID, serverID).Scan(&id, &roleID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, apptypes.Error(http.StatusNotFound, "Roster not found")
	}
	if err != nil {
		return "", nil, err
	}
	if roleID == nil || strings.TrimSpace(*roleID) == "" {
		return "", nil, apptypes.Error(http.StatusConflict, "Roster role is not configured")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT DISTINCT discord_user_id FROM roster_members WHERE roster_id = $1 AND discord_user_id IS NOT NULL ORDER BY discord_user_id`, id)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	userIDs := []string{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return "", nil, err
		}
		userIDs = append(userIDs, userID)
	}
	return *roleID, userIDs, rows.Err()
}

func refreshRosterSnapshot(c *fiber.Ctx, a apptypes.Deps, serverID, rosterID, scope string, allowReuse bool) (rosterRefreshResult, error) {
	result := rosterRefreshResult{ID: uuid.New(), Scope: scope, At: time.Now().UTC()}
	tx, err := a.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return result, err
	}
	defer tx.Rollback(c.UserContext())
	var id uuid.UUID
	var lastRefreshed, refreshStarted *time.Time
	err = tx.QueryRow(c.UserContext(), `
		SELECT id, last_refreshed_at, refresh_started_at FROM rosters
		WHERE id = $1 AND server_id = $2 FOR UPDATE
	`, rosterID, serverID).Scan(&id, &lastRefreshed, &refreshStarted)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, apptypes.Error(http.StatusNotFound, "Roster not found")
	}
	if err != nil {
		return result, err
	}
	if scope == "data" && lastRefreshed != nil {
		next := lastRefreshed.Add(time.Duration(a.Config.RosterRefreshCooldownMinutes) * time.Minute)
		if time.Now().UTC().Before(next) {
			if !allowReuse {
				c.Set(fiber.HeaderRetryAfter, strconv.Itoa(int(time.Until(next).Seconds())+1))
				return result, apptypes.Error(http.StatusTooManyRequests, "Roster data was refreshed recently")
			}
			result.Reused = true
			result.At = *lastRefreshed
			if err := tx.Commit(c.UserContext()); err != nil {
				return result, err
			}
			return result, nil
		}
	}
	if scope == "data" && refreshStarted != nil {
		staleAfter := refreshStarted.Add(time.Duration(a.Config.RosterRefreshCooldownMinutes) * time.Minute)
		if time.Now().UTC().Before(staleAfter) {
			return result, apptypes.Error(http.StatusConflict, "Roster data refresh is already in progress")
		}
	}
	if _, err := tx.Exec(c.UserContext(), `UPDATE rosters SET refresh_started_at = now() WHERE id = $1`, id); err != nil {
		return result, err
	}
	if err := tx.Commit(c.UserContext()); err != nil {
		return result, err
	}

	if scope == "data" {
		refreshed, failed, err := refreshRosterPlayers(c, a, id)
		if err != nil {
			clearRosterRefreshStarted(c, a, id)
			return result, err
		}
		result.Refreshed, result.Failed = refreshed, failed
	}
	if err := refreshRosterDiscordLinks(c, a, id); err != nil {
		clearRosterRefreshStarted(c, a, id)
		return result, err
	}
	if err := finishRosterRefresh(c, a, id, scope); err != nil {
		clearRosterRefreshStarted(c, a, id)
		return result, err
	}
	return result, nil
}

func clearRosterRefreshStarted(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID) {
	_, _ = a.Store.SQL.Exec(c.UserContext(), `UPDATE rosters SET refresh_started_at = NULL WHERE id = $1`, rosterID)
}

func refreshRosterPlayers(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID) (int, int, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT DISTINCT tag FROM roster_members WHERE roster_id = $1 ORDER BY tag`, rosterID)
	if err != nil {
		return 0, 0, err
	}
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			rows.Close()
			return 0, 0, err
		}
		tags = append(tags, tag)
	}
	rows.Close()
	if a.Clash == nil {
		return 0, len(tags), nil
	}
	refreshed, failed := 0, 0
	for _, tag := range tags {
		player, lookupErr := a.Clash.GetPlayer(c.UserContext(), tag)
		if isClashPlayerNotFound(lookupErr) {
			if _, err := a.Store.SQL.Exec(c.UserContext(), `DELETE FROM roster_members WHERE roster_id = $1 AND tag = $2`, rosterID, tag); err != nil {
				return refreshed, failed, err
			}
			refreshed++
			continue
		}
		if lookupErr != nil || player == nil {
			failed++
			continue
		}
		heroLevelSum := rosterHeroLevelSum(player.Heroes)
		maxPercent, maxPercentErr := calculateRosterMaxPercent(player)
		if maxPercentErr != nil {
			return refreshed, failed, maxPercentErr
		}
		var clanTag, clanName *string
		if player.Clan != nil {
			clanTag, clanName = &player.Clan.Tag, &player.Clan.Name
		}
		var leagueID *int
		var leagueName *string
		if player.LeagueTier.ID != 0 || player.LeagueTier.Name != "" {
			leagueID, leagueName = &player.LeagueTier.ID, &player.LeagueTier.Name
		}
		_, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE roster_members SET
				name = $3, townhall = $4, trophies = $5,
				current_clan_tag = $6, current_clan_name = $7,
				league_id = $8, league_name = $9, hero_level_sum = $10,
				max_percent = $11,
				last_online = (SELECT max(seen_at) FROM player_online_events WHERE tag = $2),
				refreshed_at = now()
			WHERE roster_id = $1 AND tag = $2
		`, rosterID, player.Tag, player.Name, player.TownHall, player.Trophies, clanTag, clanName, leagueID, leagueName, heroLevelSum, maxPercent)
		if err != nil {
			return refreshed, failed, err
		}
		refreshed++
	}
	return refreshed, failed, nil
}

func isClashPlayerNotFound(err error) bool {
	var notFound *clashy.NotFound
	return errors.As(err, &notFound)
}

func refreshRosterDiscordLinks(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID) error {
	if _, err := a.Store.SQL.Exec(c.UserContext(), `
		UPDATE roster_members member
		SET discord_user_id = links.user_id,
		    discord_username = CASE WHEN member.discord_user_id IS DISTINCT FROM links.user_id THEN NULL ELSE member.discord_username END,
		    discord_avatar_url = CASE WHEN member.discord_user_id IS DISTINCT FROM links.user_id THEN NULL ELSE member.discord_avatar_url END
		FROM player_links links
		WHERE member.roster_id = $1 AND links.tag = member.tag
		  AND member.discord_user_id IS DISTINCT FROM links.user_id
	`, rosterID); err != nil {
		return err
	}
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		UPDATE roster_members member
		SET discord_user_id = NULL, discord_username = NULL, discord_avatar_url = NULL
		WHERE member.roster_id = $1 AND member.discord_user_id IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM player_links links WHERE links.tag = member.tag)
	`, rosterID)
	return err
}

// refreshRosterDiscordIdentity performs an explicit one-person Discord lookup.
// Normal roster refreshes only repair link ownership and never page guild members.
func refreshRosterDiscordIdentity(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterDiscordIdentityRefreshRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		guildID, err := strconv.ParseInt(c.Params("server_id"), 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid server ID")
		}
		rosterID, err := uuid.Parse(c.Params("roster_id"))
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid roster ID")
		}
		playerTag := rosterNormalizeTag(body.PlayerTag)
		var userID string
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT links.user_id
			FROM roster_members member
			JOIN rosters roster ON roster.id = member.roster_id
			JOIN player_links links ON links.tag = member.tag
			WHERE member.roster_id = $1 AND roster.server_id = $2 AND member.tag = $3
		`, rosterID, c.Params("server_id"), playerTag).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.Error(http.StatusNotFound, "Roster member has no linked Discord user")
		}
		if err != nil {
			return err
		}
		parsedUserID, err := strconv.ParseInt(userID, 10, 64)
		if err != nil || a.Discord == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "Discord identity lookup is unavailable")
		}
		member := a.Discord.GetMemberDirect(c.UserContext(), guildID, parsedUserID)
		if member == nil {
			return apptypes.Error(http.StatusNotFound, "Linked Discord user is not in this server")
		}
		username, avatarURL := member.User.Username, member.EffectiveAvatarURL()
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE roster_members
			SET discord_user_id = $3, discord_username = $4, discord_avatar_url = $5
			WHERE roster_id = $1 AND tag = $2
		`, rosterID, playerTag, userID, username, avatarURL); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"playerTag": playerTag, "discordUserId": userID,
			"discordUsername": username, "discordAvatarUrl": avatarURL,
		})
	}
}

func finishRosterRefresh(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID, scope string) error {
	tx, err := a.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.UserContext())
	if scope == "data" {
		if _, err := tx.Exec(c.UserContext(), `UPDATE rosters SET last_refreshed_at = now(), refresh_started_at = NULL, updated_at = now(), revision = revision + 1 WHERE id = $1`, rosterID); err != nil {
			return err
		}
	}
	return tx.Commit(c.UserContext())
}
