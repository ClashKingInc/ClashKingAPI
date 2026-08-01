package routes

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const cwlBonusContextSelect = `
	SELECT g.cwl_id, g.season, COALESCE(s.cwl_league_id, g.cwl_league_id),
	       COALESCE(s.war_size, g.war_size), g.state,
	       gc.clan_tag, gc.name, s.wins, s.group_rank
	FROM server_clans AS configured
	JOIN cwl_group_clans AS gc ON gc.clan_tag = configured.tag
	JOIN cwl_groups AS g ON g.cwl_id = gc.cwl_id
	LEFT JOIN cwl_standings AS s
	  ON s.cwl_id = g.cwl_id AND s.clan_tag = gc.clan_tag
	WHERE configured.server_id = $1 AND configured.tag = $2 AND g.season = $3
	ORDER BY g.cwl_id DESC
	LIMIT 1
`

const cwlBonusCreateContextSelect = `
	SELECT g.cwl_id, g.season, COALESCE(s.cwl_league_id, g.cwl_league_id),
	       COALESCE(s.war_size, g.war_size), g.state,
	       gc.clan_tag, gc.name, s.wins, s.group_rank
	FROM server_clans AS configured
	JOIN cwl_group_clans AS gc ON gc.clan_tag = configured.tag
	JOIN cwl_groups AS g ON g.cwl_id = gc.cwl_id
	LEFT JOIN cwl_standings AS s
	  ON s.cwl_id = g.cwl_id AND s.clan_tag = gc.clan_tag
	WHERE configured.server_id = $1 AND g.cwl_id = $2
	LIMIT 1
`

type cwlBonusQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type cwlBonusFacts struct {
	CWLID, Season, State, ClanTag, ClanName string
	LeagueID, WarSize                       *int
	WarsWon, FinalPlacement                 *int
}

type cwlBonusRule struct {
	Version string
	Base    int
}

type cwlBonusStoredSubmission struct {
	Response       modelsv2.CWLBonusSubmission
	ServerID       string
	Season         string
	ClanTag        string
	AwardCount     int
	FinalPlacement int
	WarsWon        int
	LeagueID       int
	LeagueName     string
	WarSize        int
	Recipients     []modelsv2.CWLBonusMember
}

// getCWLBonusContext godoc
// @Summary Get CWL bonus-award context
// @Description Recalculates league, war size, final placement, wins, effective rules, official award count, frozen eligible members, and the current immutable submission revision.
// @Tags CWL Bonus Awards
// @Produce json
// @Security ApiKeyAuth
// @Param serverId query string true "Discord server ID"
// @Param clanTag query string true "Clan tag"
// @Param season query string true "CWL season (YYYY-MM)"
// @Success 200 {object} modelsv2.CWLBonusContext
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/bonus-awards/context [get]
func getCWLBonusContext(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Query("serverId"))
		clanTag := warFixTag(c.Query("clanTag"))
		season := strings.TrimSpace(c.Query("season"))
		if serverID == "" || clanTag == "" || !validCWLBonusLedgerSeason(season) {
			return apptypes.Error(http.StatusBadRequest, "serverId, clanTag, and a YYYY-MM season are required")
		}
		facts, err := loadCWLBonusFacts(c.UserContext(), a.Store.SQL, cwlBonusContextSelect, serverID, clanTag, season)
		if err != nil {
			return err
		}
		response, err := buildCWLBonusContext(c.UserContext(), a.Store.SQL, serverID, facts)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// submitCWLBonusAwards godoc
// @Summary Save CWL bonus-award recipients
// @Description Appends an immutable first submission or correction. Every league, standing, rule, count, member name, and eligibility input is recalculated server-side. Idempotency is scoped to the server.
// @Tags CWL Bonus Awards
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param Idempotency-Key header string true "Unique retry key"
// @Param body body modelsv2.SubmitCWLBonusAwards true "Award recipients and optimistic revision"
// @Success 201 {object} modelsv2.CWLBonusSubmission
// @Success 200 {object} modelsv2.CWLBonusSubmission
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/bonus-awards [post]
func submitCWLBonusAwards(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var request modelsv2.SubmitCWLBonusAwards
		if err := apptypes.DecodeJSON(c, &request); err != nil {
			return err
		}
		request.ServerID = strings.TrimSpace(request.ServerID)
		request.CWLID = strings.TrimSpace(request.CWLID)
		idempotencyKey := strings.TrimSpace(c.Get("Idempotency-Key"))
		if err := validateCWLBonusRequest(&request, idempotencyKey); err != nil {
			return err
		}
		if err := authorizeDashboardAccess(c, a, request.ServerID, "rosters", true, true, false); err != nil {
			return err
		}
		actor, err := rosterDashboardDiscordUserID(c, a)
		if err != nil {
			return err
		}

		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())

		// The schema scopes idempotency keys to the server, so the lock must use
		// that same scope rather than only the selected clan/season ledger.
		if _, err := tx.Exec(c.UserContext(), `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, request.ServerID); err != nil {
			return err
		}
		facts, err := loadCWLBonusFacts(c.UserContext(), tx, cwlBonusCreateContextSelect, request.ServerID, request.CWLID)
		if err != nil {
			return err
		}

		stored, found, err := loadCWLBonusSubmissionByIdempotency(c.UserContext(), tx, request.ServerID, idempotencyKey)
		if err != nil {
			return err
		}
		if found {
			if !cwlBonusIdempotencyMatches(stored, request, facts) {
				return apptypes.Error(http.StatusConflict, "Idempotency-Key was already used for a different CWL bonus submission")
			}
			if err := tx.Commit(c.UserContext()); err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, stored.Response)
		}

		rule, ruleFound, err := loadEffectiveCWLBonusRule(c.UserContext(), tx, facts)
		if err != nil {
			return err
		}
		if err := validateCWLBonusCompletion(facts, ruleFound); err != nil {
			return err
		}
		awardCount := rule.Base + *facts.WarsWon
		if request.AwardCountOverride != nil {
			if *request.AwardCountOverride == awardCount {
				return apptypes.Error(http.StatusBadRequest, "awardCountOverride must differ from the official award count")
			}
			awardCount = *request.AwardCountOverride
		}
		if len(request.RecipientTags) != awardCount {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("recipientTags must contain exactly %d players", awardCount))
		}
		members, err := loadCWLBonusRecipients(c.UserContext(), tx, facts, request.RecipientTags)
		if err != nil {
			return err
		}

		var priorID *uuid.UUID
		currentRevision := 0
		var currentID uuid.UUID
		err = tx.QueryRow(c.UserContext(), `
			SELECT id, revision
			FROM cwl_bonus_award_submissions
			WHERE server_id = $1 AND season = $2 AND clan_tag = $3
			ORDER BY revision DESC LIMIT 1 FOR UPDATE
		`, request.ServerID, facts.Season, facts.ClanTag).Scan(&currentID, &currentRevision)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if currentRevision != request.ExpectedRevision {
			return apptypes.Error(http.StatusConflict, fmt.Sprintf("expectedRevision is stale; current revision is %d", currentRevision))
		}
		if currentRevision == 0 {
			if request.CorrectionReason != nil {
				return apptypes.Error(http.StatusBadRequest, "correctionReason is only valid when correcting an existing submission")
			}
		} else {
			if request.CorrectionReason == nil {
				return apptypes.Error(http.StatusBadRequest, "correctionReason is required for a corrected submission")
			}
			priorID = &currentID
		}

		leagueName := cwlLeagueName(*facts.LeagueID)
		var submissionID uuid.UUID
		var submittedAt time.Time
		err = tx.QueryRow(c.UserContext(), `
			INSERT INTO cwl_bonus_award_submissions (
				server_id, season, clan_tag, clan_name, revision, supersedes_id,
				ruleset_version, league_id, league_name, war_size, final_placement,
				wars_won, base_award_slots, award_slot_count, override_reason,
				correction_reason, idempotency_key, submitted_by_discord_user_id
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
				$12, $13, $14, $15, $16, $17, $18
			) RETURNING id, submitted_at
		`, request.ServerID, facts.Season, facts.ClanTag, facts.ClanName, currentRevision+1, priorID,
			rule.Version, *facts.LeagueID, leagueName, *facts.WarSize, *facts.FinalPlacement,
			*facts.WarsWon, rule.Base, awardCount, request.OverrideReason, request.CorrectionReason,
			idempotencyKey, actor).Scan(&submissionID, &submittedAt)
		if err != nil {
			return err
		}
		for position, member := range members {
			if _, err := tx.Exec(c.UserContext(), `
				INSERT INTO cwl_bonus_award_recipients (
					submission_id, player_tag, player_name, position, selected_by_discord_user_id
				) VALUES ($1, $2, $3, $4, $5)
			`, submissionID, member.Tag, member.Name, position+1, actor); err != nil {
				return err
			}
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		response := modelsv2.CWLBonusSubmission{
			ID: submissionID.String(), Revision: currentRevision + 1, RecipientTags: slices.Clone(request.RecipientTags),
			ActorDiscordID: actor, CalculationMode: cwlBonusCalculationMode(request.OverrideReason),
			OverrideReason: request.OverrideReason, CorrectionReason: request.CorrectionReason,
			CreatedAt: submittedAt.UTC().Format(time.RFC3339),
		}
		return apptypes.JSON(c, http.StatusCreated, response)
	}
}

// getCWLBonusHistory godoc
// @Summary Get CWL bonus-award history
// @Description Returns every immutable revision for exactly one clan or player filter within a server.
// @Tags CWL Bonus Awards
// @Produce json
// @Security ApiKeyAuth
// @Param serverId query string true "Discord server ID"
// @Param clanTag query string false "Clan tag; exactly one of clanTag or playerTag is required"
// @Param playerTag query string false "Player tag; exactly one of clanTag or playerTag is required"
// @Success 200 {object} modelsv2.CWLBonusHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Router /v2/cwl/bonus-awards/history [get]
func getCWLBonusHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Query("serverId"))
		clanRaw, playerRaw := strings.TrimSpace(c.Query("clanTag")), strings.TrimSpace(c.Query("playerTag"))
		if serverID == "" {
			return apptypes.Error(http.StatusBadRequest, "serverId is required")
		}
		if (clanRaw == "") == (playerRaw == "") {
			return apptypes.Error(http.StatusBadRequest, "exactly one of clanTag or playerTag is required")
		}
		filterTag := warFixTag(clanRaw)
		filterByPlayer := false
		if playerRaw != "" {
			filterTag = warFixTag(playerRaw)
			filterByPlayer = true
		}
		if filterTag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid clanTag or playerTag")
		}
		items, err := loadCWLBonusHistory(c.UserContext(), a.Store.SQL, serverID, filterTag, filterByPlayer)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.CWLBonusHistoryResponse{Items: items})
	}
}

func authCWLBonusQueryRead(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Query("serverId"))
		if serverID == "" {
			return apptypes.Error(http.StatusBadRequest, "serverId is required")
		}
		if err := authorizeDashboardAccess(c, a, serverID, "rosters", false, false, false); err != nil {
			return err
		}
		return next(c)
	})
}

func authCWLBonusCreate(a apptypes.Deps, wrap func(fiber.Handler) fiber.Handler, next fiber.Handler) fiber.Handler {
	return authUserOrBot(a, wrap, next)
}

func loadCWLBonusFacts(ctx context.Context, db cwlBonusQuerier, query string, args ...any) (cwlBonusFacts, error) {
	var facts cwlBonusFacts
	var leagueID pgtype.Int4
	var warSize pgtype.Int2
	var wins, placement pgtype.Int4
	if err := db.QueryRow(ctx, query, args...).Scan(
		&facts.CWLID, &facts.Season, &leagueID, &warSize, &facts.State,
		&facts.ClanTag, &facts.ClanName, &wins, &placement,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return facts, apptypes.Error(http.StatusNotFound, "CWL group was not found for this configured server clan")
		}
		return facts, err
	}
	if leagueID.Valid {
		value := int(leagueID.Int32)
		facts.LeagueID = &value
	}
	if warSize.Valid {
		value := int(warSize.Int16)
		facts.WarSize = &value
	}
	if wins.Valid {
		value := int(wins.Int32)
		facts.WarsWon = &value
	}
	if placement.Valid {
		value := int(placement.Int32)
		facts.FinalPlacement = &value
	}
	return facts, nil
}

func buildCWLBonusContext(ctx context.Context, db cwlBonusQuerier, serverID string, facts cwlBonusFacts) (modelsv2.CWLBonusContext, error) {
	members, err := loadCWLBonusMembers(ctx, db, facts)
	if err != nil {
		return modelsv2.CWLBonusContext{}, err
	}
	rule, found, err := loadEffectiveCWLBonusRule(ctx, db, facts)
	if err != nil {
		return modelsv2.CWLBonusContext{}, err
	}
	calculation := cwlBonusCalculation(facts, rule, found)
	current, currentFound, err := loadCurrentCWLBonusSubmission(ctx, db, serverID, facts.Season, facts.ClanTag)
	if err != nil {
		return modelsv2.CWLBonusContext{}, err
	}
	response := modelsv2.CWLBonusContext{
		CWLID: facts.CWLID, Clan: modelsv2.CWLBonusClan{Tag: facts.ClanTag, Name: facts.ClanName}, Season: facts.Season,
		League: modelsv2.CWLBonusLeague{Name: "Unknown"}, FinalPlacement: facts.FinalPlacement,
		Calculation: calculation, Members: members,
	}
	if facts.LeagueID != nil {
		response.League = modelsv2.CWLBonusLeague{ID: *facts.LeagueID, Name: cwlLeagueName(*facts.LeagueID)}
	}
	if facts.WarSize != nil {
		response.WarSize = *facts.WarSize
	}
	if facts.WarsWon != nil {
		response.WarsWon = *facts.WarsWon
	}
	if currentFound {
		response.CurrentSubmission = &current.Response
	}
	return response, nil
}

func loadEffectiveCWLBonusRule(ctx context.Context, db cwlBonusQuerier, facts cwlBonusFacts) (cwlBonusRule, bool, error) {
	if facts.LeagueID == nil || facts.WarSize == nil || !validCWLBonusLedgerSeason(facts.Season) {
		return cwlBonusRule{}, false, nil
	}
	var rule cwlBonusRule
	err := db.QueryRow(ctx, `
		SELECT ruleset_version, base_award_slots
		FROM cwl_bonus_award_rules
		WHERE league_id = $1 AND war_size = $2
		  AND effective_from_season <= $3
		  AND (effective_through_season IS NULL OR effective_through_season >= $3)
		ORDER BY effective_from_season DESC, documented_at DESC, ruleset_version DESC
		LIMIT 1
	`, *facts.LeagueID, *facts.WarSize, facts.Season).Scan(&rule.Version, &rule.Base)
	if errors.Is(err, pgx.ErrNoRows) {
		return cwlBonusRule{}, false, nil
	}
	return rule, err == nil, err
}

func cwlBonusCalculation(facts cwlBonusFacts, rule cwlBonusRule, ruleFound bool) modelsv2.CWLBonusCalculation {
	reasons := cwlBonusIncompleteReasons(facts, ruleFound)
	result := modelsv2.CWLBonusCalculation{Status: "incomplete", RulesetVersion: rule.Version, Reasons: reasons}
	if ruleFound {
		base := rule.Base
		result.BaseAwardCount = &base
	}
	if len(reasons) == 0 {
		count := rule.Base + *facts.WarsWon
		result.Status = "ready"
		result.AwardCount = &count
	}
	return result
}

func cwlBonusIncompleteReasons(facts cwlBonusFacts, ruleFound bool) []string {
	reasons := make([]string, 0, 5)
	if facts.State != "ended" {
		reasons = append(reasons, "The CWL group has not ended")
	}
	if facts.FinalPlacement == nil || *facts.FinalPlacement <= 0 {
		reasons = append(reasons, "Final placement is not available")
	}
	if facts.WarsWon == nil {
		reasons = append(reasons, "Persisted standings are not available")
	}
	if facts.LeagueID == nil || facts.WarSize == nil {
		reasons = append(reasons, "League or war size is not available")
	}
	if !ruleFound {
		reasons = append(reasons, "No effective bonus-award rule matches this league and war size")
	}
	return reasons
}

func validateCWLBonusCompletion(facts cwlBonusFacts, ruleFound bool) error {
	if reasons := cwlBonusIncompleteReasons(facts, ruleFound); len(reasons) != 0 {
		return apptypes.Error(http.StatusConflict, "CWL bonus awards are unavailable: "+strings.Join(reasons, "; "))
	}
	return nil
}

func loadCWLBonusMembers(ctx context.Context, db cwlBonusQuerier, facts cwlBonusFacts) ([]modelsv2.CWLBonusMember, error) {
	rows, err := db.Query(ctx, `
		SELECT tag, name, town_hall
		FROM cwl_group_members
		WHERE cwl_id = $1 AND clan_tag = $2
		ORDER BY name, tag
	`, facts.CWLID, facts.ClanTag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := make([]modelsv2.CWLBonusMember, 0)
	for rows.Next() {
		var member modelsv2.CWLBonusMember
		if err := rows.Scan(&member.Tag, &member.Name, &member.TownHallLevel); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func loadCWLBonusRecipients(ctx context.Context, db cwlBonusQuerier, facts cwlBonusFacts, tags []string) ([]modelsv2.CWLBonusMember, error) {
	rows, err := db.Query(ctx, `
		SELECT tag, name, town_hall
		FROM cwl_group_members
		WHERE cwl_id = $1 AND clan_tag = $2 AND tag = ANY($3)
	`, facts.CWLID, facts.ClanTag, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byTag := make(map[string]modelsv2.CWLBonusMember, len(tags))
	for rows.Next() {
		var member modelsv2.CWLBonusMember
		if err := rows.Scan(&member.Tag, &member.Name, &member.TownHallLevel); err != nil {
			return nil, err
		}
		byTag[member.Tag] = member
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	members := make([]modelsv2.CWLBonusMember, 0, len(tags))
	for _, tag := range tags {
		member, found := byTag[tag]
		if !found {
			return nil, apptypes.Error(http.StatusBadRequest, "Every recipient must belong to the frozen CWL group roster")
		}
		members = append(members, member)
	}
	return members, nil
}

func validateCWLBonusRequest(request *modelsv2.SubmitCWLBonusAwards, idempotencyKey string) error {
	if request.ServerID == "" || request.CWLID == "" {
		return apptypes.Error(http.StatusBadRequest, "serverId and cwlId are required")
	}
	if request.ExpectedRevision < 0 {
		return apptypes.Error(http.StatusBadRequest, "expectedRevision cannot be negative")
	}
	if idempotencyKey == "" || len(idempotencyKey) > 200 {
		return apptypes.Error(http.StatusBadRequest, "Idempotency-Key is required and must be at most 200 characters")
	}
	seen := make(map[string]struct{}, len(request.RecipientTags))
	for index, raw := range request.RecipientTags {
		tag := warFixTag(raw)
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "recipientTags contains an invalid tag")
		}
		if _, duplicate := seen[tag]; duplicate {
			return apptypes.Error(http.StatusBadRequest, "recipientTags must not contain duplicates")
		}
		seen[tag] = struct{}{}
		request.RecipientTags[index] = tag
	}
	request.OverrideReason = trimmedCWLBonusReason(request.OverrideReason)
	request.CorrectionReason = trimmedCWLBonusReason(request.CorrectionReason)
	if request.AwardCountOverride != nil {
		if *request.AwardCountOverride < 0 {
			return apptypes.Error(http.StatusBadRequest, "awardCountOverride cannot be negative")
		}
		if request.OverrideReason == nil {
			return apptypes.Error(http.StatusBadRequest, "overrideReason is required with awardCountOverride")
		}
	} else if request.OverrideReason != nil {
		return apptypes.Error(http.StatusBadRequest, "overrideReason requires awardCountOverride")
	}
	return nil
}

func trimmedCWLBonusReason(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validCWLBonusLedgerSeason(value string) bool {
	if len(value) != 7 || value[4] != '-' {
		return false
	}
	parsed, err := time.Parse("2006-01", value)
	return err == nil && parsed.Format("2006-01") == value
}

func cwlBonusCalculationMode(overrideReason *string) string {
	if overrideReason != nil {
		return "override"
	}
	return "official"
}

func cwlLeagueName(id int) string {
	names := []string{
		"Unranked", "Bronze League III", "Bronze League II", "Bronze League I",
		"Silver League III", "Silver League II", "Silver League I",
		"Gold League III", "Gold League II", "Gold League I",
		"Crystal League III", "Crystal League II", "Crystal League I",
		"Master League III", "Master League II", "Master League I",
		"Champion League III", "Champion League II", "Champion League I",
		"Titan League III", "Titan League II", "Titan League I", "Legend League",
	}
	index := id - 48000000
	if index < 0 || index >= len(names) {
		return fmt.Sprintf("League %d", id)
	}
	return names[index]
}

func loadCurrentCWLBonusSubmission(ctx context.Context, db cwlBonusQuerier, serverID, season, clanTag string) (cwlBonusStoredSubmission, bool, error) {
	var stored cwlBonusStoredSubmission
	var overrideReason, correctionReason pgtype.Text
	var createdAt time.Time
	err := db.QueryRow(ctx, `
		SELECT id::text, server_id, season, clan_tag, revision, league_id, league_name,
		       war_size, final_placement, wars_won, award_slot_count, override_reason,
		       correction_reason, submitted_by_discord_user_id, submitted_at
		FROM cwl_bonus_award_submissions
		WHERE server_id = $1 AND season = $2 AND clan_tag = $3
		ORDER BY revision DESC LIMIT 1
	`, serverID, season, clanTag).Scan(
		&stored.Response.ID, &stored.ServerID, &stored.Season, &stored.ClanTag,
		&stored.Response.Revision, &stored.LeagueID, &stored.LeagueName, &stored.WarSize,
		&stored.FinalPlacement, &stored.WarsWon, &stored.AwardCount, &overrideReason,
		&correctionReason, &stored.Response.ActorDiscordID, &createdAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return stored, false, nil
	}
	if err != nil {
		return stored, false, err
	}
	stored.Response.OverrideReason = cwlBonusTextPointer(overrideReason)
	stored.Response.CorrectionReason = cwlBonusTextPointer(correctionReason)
	stored.Response.CalculationMode = cwlBonusCalculationMode(stored.Response.OverrideReason)
	stored.Response.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	recipients, err := loadCWLBonusStoredRecipients(ctx, db, stored.Response.ID)
	if err != nil {
		return stored, false, err
	}
	stored.Recipients = recipients
	stored.Response.RecipientTags = cwlBonusRecipientTags(recipients)
	return stored, true, nil
}

func loadCWLBonusSubmissionByIdempotency(ctx context.Context, db cwlBonusQuerier, serverID, key string) (cwlBonusStoredSubmission, bool, error) {
	var stored cwlBonusStoredSubmission
	var overrideReason, correctionReason pgtype.Text
	var createdAt time.Time
	err := db.QueryRow(ctx, `
		SELECT id::text, server_id, season, clan_tag, revision, league_id, league_name,
		       war_size, final_placement, wars_won, award_slot_count, override_reason,
		       correction_reason, submitted_by_discord_user_id, submitted_at
		FROM cwl_bonus_award_submissions
		WHERE server_id = $1 AND idempotency_key = $2
	`, serverID, key).Scan(
		&stored.Response.ID, &stored.ServerID, &stored.Season, &stored.ClanTag,
		&stored.Response.Revision, &stored.LeagueID, &stored.LeagueName, &stored.WarSize,
		&stored.FinalPlacement, &stored.WarsWon, &stored.AwardCount, &overrideReason,
		&correctionReason, &stored.Response.ActorDiscordID, &createdAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return stored, false, nil
	}
	if err != nil {
		return stored, false, err
	}
	stored.Response.OverrideReason = cwlBonusTextPointer(overrideReason)
	stored.Response.CorrectionReason = cwlBonusTextPointer(correctionReason)
	stored.Response.CalculationMode = cwlBonusCalculationMode(stored.Response.OverrideReason)
	stored.Response.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	recipients, err := loadCWLBonusStoredRecipients(ctx, db, stored.Response.ID)
	if err != nil {
		return stored, false, err
	}
	stored.Recipients = recipients
	stored.Response.RecipientTags = cwlBonusRecipientTags(recipients)
	return stored, true, nil
}

func loadCWLBonusStoredRecipients(ctx context.Context, db cwlBonusQuerier, submissionID string) ([]modelsv2.CWLBonusMember, error) {
	rows, err := db.Query(ctx, `
		SELECT player_tag, player_name
		FROM cwl_bonus_award_recipients
		WHERE submission_id = $1
		ORDER BY position
	`, submissionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	recipients := make([]modelsv2.CWLBonusMember, 0)
	for rows.Next() {
		var recipient modelsv2.CWLBonusMember
		if err := rows.Scan(&recipient.Tag, &recipient.Name); err != nil {
			return nil, err
		}
		recipients = append(recipients, recipient)
	}
	return recipients, rows.Err()
}

func cwlBonusIdempotencyMatches(stored cwlBonusStoredSubmission, request modelsv2.SubmitCWLBonusAwards, facts cwlBonusFacts) bool {
	if stored.ServerID != request.ServerID || stored.Season != facts.Season || stored.ClanTag != facts.ClanTag ||
		stored.Response.Revision-1 != request.ExpectedRevision ||
		!slices.Equal(stored.Response.RecipientTags, request.RecipientTags) ||
		!cwlBonusOptionalTextEqual(stored.Response.OverrideReason, request.OverrideReason) ||
		!cwlBonusOptionalTextEqual(stored.Response.CorrectionReason, request.CorrectionReason) {
		return false
	}
	if request.AwardCountOverride == nil {
		return stored.Response.OverrideReason == nil
	}
	return stored.Response.OverrideReason != nil && stored.AwardCount == *request.AwardCountOverride
}

func cwlBonusOptionalTextEqual(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func cwlBonusTextPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	text := value.String
	return &text
}

func cwlBonusRecipientTags(recipients []modelsv2.CWLBonusMember) []string {
	tags := make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		tags = append(tags, recipient.Tag)
	}
	return tags
}

const cwlBonusHistorySelect = `
	SELECT s.id::text, s.season, s.clan_tag, s.clan_name, s.revision,
	       s.league_id, s.league_name, s.war_size, s.final_placement, s.wars_won,
	       s.award_slot_count, s.override_reason, s.correction_reason,
	       s.submitted_by_discord_user_id, s.submitted_at,
	       EXISTS (
	           SELECT 1 FROM cwl_bonus_award_submissions AS correction
	           WHERE correction.supersedes_id = s.id
	       ) AS superseded,
	       recipient.player_tag, recipient.player_name, COALESCE(roster.town_hall, 0)
	FROM cwl_bonus_award_submissions AS s
	LEFT JOIN cwl_bonus_award_recipients AS recipient ON recipient.submission_id = s.id
	LEFT JOIN LATERAL (
		SELECT member.town_hall
		FROM cwl_groups AS group_snapshot
		JOIN cwl_group_members AS member ON member.cwl_id = group_snapshot.cwl_id
		WHERE group_snapshot.season = s.season
		  AND member.clan_tag = s.clan_tag
		  AND member.tag = recipient.player_tag
		ORDER BY group_snapshot.cwl_id DESC
		LIMIT 1
	) AS roster ON true
	WHERE s.server_id = $1
`

func loadCWLBonusHistory(ctx context.Context, db cwlBonusQuerier, serverID, filterTag string, filterByPlayer bool) ([]modelsv2.CWLBonusHistoryItem, error) {
	query := cwlBonusHistorySelect
	if filterByPlayer {
		query += ` AND EXISTS (
			SELECT 1 FROM cwl_bonus_award_recipients AS selected
			WHERE selected.submission_id = s.id AND selected.player_tag = $2
		)`
	} else {
		query += ` AND s.clan_tag = $2`
	}
	query += ` ORDER BY s.season DESC, s.clan_tag, s.revision DESC, recipient.position`
	rows, err := db.Query(ctx, query, serverID, filterTag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]modelsv2.CWLBonusHistoryItem, 0)
	byID := make(map[string]int)
	for rows.Next() {
		var id, season, clanTag, clanName, leagueName, actor string
		var revision, leagueID, warSize, finalPlacement, warsWon, awardCount int
		var overrideReason, correctionReason, recipientTag, recipientName pgtype.Text
		var recipientTownHall pgtype.Int4
		var submittedAt time.Time
		var superseded bool
		if err := rows.Scan(
			&id, &season, &clanTag, &clanName, &revision, &leagueID, &leagueName,
			&warSize, &finalPlacement, &warsWon, &awardCount, &overrideReason,
			&correctionReason, &actor, &submittedAt, &superseded,
			&recipientTag, &recipientName, &recipientTownHall,
		); err != nil {
			return nil, err
		}
		index, found := byID[id]
		if !found {
			item := modelsv2.CWLBonusHistoryItem{
				CWLBonusSubmission: modelsv2.CWLBonusSubmission{
					ID: id, Revision: revision, ActorDiscordID: actor,
					OverrideReason: cwlBonusTextPointer(overrideReason), CorrectionReason: cwlBonusTextPointer(correctionReason),
					CreatedAt: submittedAt.UTC().Format(time.RFC3339),
				},
				Clan: modelsv2.CWLBonusClan{Tag: clanTag, Name: clanName}, Season: season,
				League: modelsv2.CWLBonusLeague{ID: leagueID, Name: leagueName}, WarSize: warSize,
				FinalPlacement: finalPlacement, WarsWon: warsWon, AwardCount: awardCount,
				Superseded: superseded, Recipients: []modelsv2.CWLBonusMember{},
			}
			item.CalculationMode = cwlBonusCalculationMode(item.OverrideReason)
			items = append(items, item)
			index = len(items) - 1
			byID[id] = index
		}
		if recipientTag.Valid {
			member := modelsv2.CWLBonusMember{Tag: recipientTag.String, Name: recipientName.String}
			if recipientTownHall.Valid {
				member.TownHallLevel = int(recipientTownHall.Int32)
			}
			items[index].Recipients = append(items[index].Recipients, member)
			items[index].RecipientTags = append(items[index].RecipientTags, member.Tag)
		}
	}
	return items, rows.Err()
}
