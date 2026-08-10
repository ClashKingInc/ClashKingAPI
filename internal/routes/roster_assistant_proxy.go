package routes

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type aiTokenUsage struct {
	InputTokens       int64 `json:"inputTokens"`
	CachedInputTokens int64 `json:"cachedInputTokens"`
	CacheWriteTokens  int64 `json:"cacheWriteTokens"`
	OutputTokens      int64 `json:"outputTokens"`
	ReasoningTokens   int64 `json:"reasoningTokens"`
}

type rosterAssistantUsageUpdate struct {
	RequestID string         `json:"requestId"`
	Model     string         `json:"model"`
	Usage     aiTokenUsage   `json:"usage"`
	Steps     []aiTokenUsage `json:"steps"`
}

type rosterAISponsor struct {
	UserID       string
	MonthlyLimit float64
	Spent        float64
	Remaining    float64
}

const (
	rosterAssistantModel                  = "gpt-5.6-luna"
	rosterAIServerMonthlyLimitCostUnits   = int64(5_000_000)     // $0.05 at 1e-8 USD precision.
	rosterAIGlobalMonthlyLimitCostUnits   = int64(1_000_000_000) // $10.00 at 1e-8 USD precision.
	rosterAILongContextInputTokenBoundary = int64(272_000)
)

// prepareRosterAIContext godoc
// @Summary Prepare trusted AI roster context
// @Description Authenticates and meters an AI request, then returns trusted roster context to the Assistant Worker.
// @Tags Roster Builder
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.RosterAIRequest true "Conversation and roster attachments"
// @Success 200 {object} map[string]any
// @Router /v2/roster/ai/context [post]
// prepareRosterAIContext is called by the Assistant Worker with the browser's
// short-lived access token. It keeps authorization, rate limits, and context
// construction in the API without relaying the long-lived response stream.
func prepareRosterAIContext(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.RosterAIRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRosterAIRequest(body, a.Config); err != nil {
			return err
		}
		if err := authorizeDashboardAccess(c, a, body.ServerID, "rosters", true, true, false); err != nil {
			return err
		}
		discordUserID, err := rosterDashboardDiscordUserID(c, a)
		if err != nil {
			return err
		}
		attachments, err := loadRosterAIAttachments(c, a, body.ServerID, body.RosterIDs)
		if err != nil {
			return err
		}
		var currentView *modelsv2.RosterView
		var usageViewID *uuid.UUID
		if strings.TrimSpace(body.ViewID) != "" {
			parsed, parseErr := uuid.Parse(body.ViewID)
			if parseErr != nil {
				return apptypes.Error(http.StatusBadRequest, "Invalid viewId")
			}
			loaded, loadErr := loadRosterView(c, a, body.ServerID, body.ViewID)
			if loadErr != nil {
				return loadErr
			}
			currentView, usageViewID = &loaded, &parsed
		}
		var rosterUUID uuid.UUID
		if err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT id FROM rosters WHERE id = $1 AND server_id = $2`, body.RosterIDs[0], body.ServerID).Scan(&rosterUUID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(http.StatusNotFound, "Roster not found")
			}
			return err
		}
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		if _, err := tx.Exec(c.UserContext(), `SELECT pg_advisory_xact_lock(hashtext('roster_ai_free_monthly_budget'))`); err != nil {
			return err
		}
		var serverSpent, globalSpent, userSpent float64
		if err := tx.QueryRow(c.UserContext(), `
			WITH monthly AS (
				SELECT usage.*,
					COALESCE((SELECT sum(amount_usd) FROM roster_ai_usage_credits credit WHERE credit.usage_id = usage.id), 0) AS credited
				FROM roster_ai_usage usage
				WHERE usage.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			)
			SELECT
				COALESCE(sum(total_cost_usd) FILTER (WHERE server_id = $1), 0),
				COALESCE(sum(GREATEST(total_cost_usd - credited, 0)), 0),
				COALESCE(sum(total_cost_usd) FILTER (WHERE discord_user_id = $2), 0)
			FROM monthly
		`, body.ServerID, discordUserID).Scan(&serverSpent, &globalSpent, &userSpent); err != nil {
			return err
		}
		sponsorRows, err := tx.Query(c.UserContext(), `
			SELECT assignment.user_id,
				entitlement.roster_assistant_monthly_credit_usd,
				COALESCE(spend.spent, 0),
				GREATEST(entitlement.roster_assistant_monthly_credit_usd - COALESCE(spend.spent, 0), 0)
			FROM subscription_roster_assignments assignment
			JOIN subscription_entitlements entitlement
			  ON entitlement.user_id = assignment.user_id AND entitlement.active = true
			LEFT JOIN LATERAL (
				SELECT sum(amount_usd) AS spent
				FROM roster_ai_usage_credits
				WHERE user_id = assignment.user_id
				  AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			) spend ON true
			WHERE assignment.server_id = $1
			ORDER BY assignment.user_id
		`, body.ServerID)
		if err != nil {
			return err
		}
		sponsors, err := pgx.CollectRows(sponsorRows, pgx.RowToStructByPos[rosterAISponsor])
		if err != nil {
			return err
		}
		paidLimit, paidSpent, paidRemaining := 0.0, 0.0, 0.0
		for _, sponsor := range sponsors {
			paidLimit += sponsor.MonthlyLimit
			paidSpent += min(sponsor.Spent, sponsor.MonthlyLimit)
			paidRemaining += sponsor.Remaining
		}
		usesPaidPool := len(sponsors) > 0
		if usesPaidPool {
			if paidRemaining <= 0 {
				return apptypes.Error(http.StatusTooManyRequests, "This server's monthly roster assistant credit has been used")
			}
		} else {
			if serverSpent >= float64(rosterAIServerMonthlyLimitCostUnits)/1e8 {
				return apptypes.Error(http.StatusTooManyRequests, "This server has used its monthly roster AI budget")
			}
			if globalSpent >= float64(rosterAIGlobalMonthlyLimitCostUnits)/1e8 {
				return apptypes.Error(http.StatusTooManyRequests, "The monthly free roster AI budget has been used")
			}
		}
		requestID := uuid.New()
		if _, err := tx.Exec(c.UserContext(), `
			INSERT INTO roster_ai_usage (id, server_id, roster_id, view_id, discord_user_id, operation, provider, model)
			VALUES ($1, $2, $3, $4, $5, 'view_or_membership_proposal', 'openai', $6)
		`, requestID, body.ServerID, rosterUUID, usageViewID, discordUserID, rosterAssistantModel); err != nil {
			return err
		}
		for position, sponsor := range sponsors {
			if sponsor.Remaining <= 0 {
				continue
			}
			if _, err := tx.Exec(c.UserContext(), `
				INSERT INTO roster_ai_usage_sponsors (usage_id, user_id, position) VALUES ($1, $2, $3)
			`, requestID, sponsor.UserID, position); err != nil {
				return err
			}
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}

		return c.JSON(fiber.Map{
			"requestId": requestID.String(),
			"model":     rosterAssistantModel,
			"budget": fiber.Map{
				"serverSpentUsd": serverSpent, "serverLimitUsd": 0.05,
				"globalSpentUsd": globalSpent, "globalLimitUsd": 10.00,
				"userSpentUsd": userSpent, "userLimitUsd": 0,
				"paidSpentUsd": paidSpent, "paidLimitUsd": paidLimit,
				"paidRemainingUsd": paidRemaining, "usesPaidPool": usesPaidPool,
				"resetsAt": "first day of the next month at 00:00 UTC",
			},
			"context": fiber.Map{
				"attachments": attachments,
				"metrics":     rosterMetrics,
				"currentView": currentView,
			},
		})
	}
}

func updateRosterAIUsage(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if err := authorizeAIUsageSettlement(c, a); err != nil {
			return err
		}
		var body rosterAssistantUsageUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		requestID, err := uuid.Parse(body.RequestID)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid requestId")
		}
		if body.Model != rosterAssistantModel {
			return apptypes.Error(http.StatusBadRequest, "Unsupported roster AI model")
		}
		usage := body.Usage
		if !validAIUsageSteps(usage, body.Steps) {
			return apptypes.Error(http.StatusBadRequest, "Invalid roster AI token usage")
		}
		inputCost, outputCost, totalCost := rosterAIUsageCostForSteps(body.Steps)
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		if _, err := tx.Exec(c.UserContext(), `SELECT pg_advisory_xact_lock(hashtext('roster_ai_paid_monthly_budget'))`); err != nil {
			return err
		}
		result, err := tx.Exec(c.UserContext(), `
			UPDATE roster_ai_usage SET
				input_tokens = $2::bigint, cached_input_tokens = $3::bigint, cache_write_tokens = $4::bigint,
				output_tokens = $5::bigint, reasoning_tokens = $6::bigint,
				total_tokens = $2::bigint + $5::bigint,
				input_cost_usd = $7::numeric, output_cost_usd = $8::numeric,
				total_cost_usd = $9::numeric
			WHERE id = $1 AND model = $10 AND input_tokens = 0 AND output_tokens = 0
		`, requestID, usage.InputTokens, usage.CachedInputTokens, usage.CacheWriteTokens,
			usage.OutputTokens, usage.ReasoningTokens, inputCost, outputCost, totalCost, body.Model)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(http.StatusNotFound, "Roster AI usage request not found")
		}
		if _, err := tx.Exec(c.UserContext(), `DELETE FROM roster_ai_usage_credits WHERE usage_id = $1`, requestID); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `
			WITH sponsor_balances AS (
				SELECT sponsor.user_id, sponsor.position,
					GREATEST(entitlement.roster_assistant_monthly_credit_usd - COALESCE(spend.spent, 0), 0) AS remaining
				FROM roster_ai_usage_sponsors sponsor
				JOIN subscription_entitlements entitlement ON entitlement.user_id = sponsor.user_id AND entitlement.active = true
				LEFT JOIN LATERAL (
					SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits
					WHERE user_id = sponsor.user_id
					  AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
				) spend ON true
				WHERE sponsor.usage_id = $1
			), allocations AS (
				SELECT user_id,
					GREATEST(LEAST(remaining, $2::numeric - COALESCE(sum(remaining) OVER (
						ORDER BY position ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
					), 0)), 0) AS amount
				FROM sponsor_balances
			)
			INSERT INTO roster_ai_usage_credits (usage_id, user_id, amount_usd)
			SELECT $1, user_id, amount FROM allocations WHERE amount > 0
			ON CONFLICT (usage_id, user_id) DO UPDATE SET amount_usd = EXCLUDED.amount_usd
		`, requestID, totalCost); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return c.SendStatus(http.StatusNoContent)
	}
}

// rosterAIUsageCost uses 1e-8 USD units so every published Luna token rate is
// represented exactly without floating-point accounting drift.
func rosterAIUsageCost(inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens int64) (string, string, string) {
	uncachedInputTokens := inputTokens - cachedInputTokens - cacheWriteTokens
	inputRate, cachedRate, cacheWriteRate, outputRate := int64(20), int64(2), int64(25), int64(120)
	if inputTokens > rosterAILongContextInputTokenBoundary {
		inputRate, cachedRate, cacheWriteRate, outputRate = 40, 4, 50, 180
	}
	inputUnits := uncachedInputTokens*inputRate + cachedInputTokens*cachedRate + cacheWriteTokens*cacheWriteRate
	outputUnits := outputTokens * outputRate
	return rosterAIFormatCost(inputUnits), rosterAIFormatCost(outputUnits), rosterAIFormatCost(inputUnits + outputUnits)
}

func rosterAIUsageCostForSteps(steps []aiTokenUsage) (string, string, string) {
	var inputUnits, outputUnits int64
	for _, step := range steps {
		uncachedInputTokens := step.InputTokens - step.CachedInputTokens - step.CacheWriteTokens
		inputRate, cachedRate, cacheWriteRate, outputRate := int64(20), int64(2), int64(25), int64(120)
		if step.InputTokens > rosterAILongContextInputTokenBoundary {
			inputRate, cachedRate, cacheWriteRate, outputRate = 40, 4, 50, 180
		}
		inputUnits += uncachedInputTokens*inputRate + step.CachedInputTokens*cachedRate + step.CacheWriteTokens*cacheWriteRate
		outputUnits += step.OutputTokens * outputRate
	}
	return rosterAIFormatCost(inputUnits), rosterAIFormatCost(outputUnits), rosterAIFormatCost(inputUnits + outputUnits)
}

func validAIUsageSteps(total aiTokenUsage, steps []aiTokenUsage) bool {
	if len(steps) < 1 || len(steps) > 8 || total.InputTokens+total.OutputTokens <= 0 {
		return false
	}
	var sum aiTokenUsage
	for _, usage := range steps {
		if usage.InputTokens < 0 || usage.OutputTokens < 0 || usage.CachedInputTokens < 0 || usage.CacheWriteTokens < 0 || usage.ReasoningTokens < 0 ||
			usage.CachedInputTokens+usage.CacheWriteTokens > usage.InputTokens || usage.ReasoningTokens > usage.OutputTokens ||
			usage.InputTokens > 10_000_000 || usage.OutputTokens > 10_000_000 {
			return false
		}
		sum.InputTokens += usage.InputTokens
		sum.CachedInputTokens += usage.CachedInputTokens
		sum.CacheWriteTokens += usage.CacheWriteTokens
		sum.OutputTokens += usage.OutputTokens
		sum.ReasoningTokens += usage.ReasoningTokens
	}
	return sum == total
}

func rosterAIFormatCost(units int64) string {
	return fmt.Sprintf("%d.%08d", units/100_000_000, units%100_000_000)
}
