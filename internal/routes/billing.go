package routes

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/stripe/stripe-go/v85"
)

type stripeWebhookEvent struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

type stripeCheckoutObject struct {
	Customer          string `json:"customer"`
	Subscription      string `json:"subscription"`
	ClientReferenceID string `json:"client_reference_id"`
}

type stripeSubscriptionObject struct {
	ID                string            `json:"id"`
	Customer          string            `json:"customer"`
	Status            string            `json:"status"`
	CurrentPeriodEnd  int64             `json:"current_period_end"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	Metadata          map[string]string `json:"metadata"`
	Items             struct {
		Data []struct {
			Price struct {
				ID string `json:"id"`
			} `json:"price"`
		} `json:"data"`
	} `json:"items"`
}

// billingSubscription returns the locally projected Stripe entitlement.
//
// @Summary Get subscription entitlement
// @Tags Billing
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.BillingSubscriptionResponse
// @Router /v2/billing/subscription [get]
func billingSubscription(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		checkoutEnabled, err := subscriptionCheckoutEnabled(c.UserContext(), a, userID, time.Now())
		if err != nil {
			return err
		}
		response := modelsv2.BillingSubscriptionResponse{
			Provider:        "stripe",
			Status:          "none",
			CheckoutEnabled: checkoutEnabled,
		}
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT COALESCE(subscription.status, 'none'), entitlement.active,
				entitlement.bookmark_notifications_limit,
				entitlement.roster_assistant_monthly_credit_usd,
				assignment.server_id,
				COALESCE(usage.spent, 0)
			FROM subscription_entitlements entitlement
			LEFT JOIN billing_subscriptions subscription ON subscription.user_id = entitlement.user_id
			LEFT JOIN subscription_roster_assignments assignment ON assignment.user_id = entitlement.user_id
			LEFT JOIN LATERAL (
				SELECT sum(amount_usd) AS spent
				FROM roster_ai_usage_credits
				WHERE user_id = entitlement.user_id
				  AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			) usage ON true
			WHERE entitlement.user_id = $1
		`, userID).Scan(
			&response.Status,
			&response.Active,
			&response.BookmarkNotificationsLimit,
			&response.RosterAssistantMonthlyCreditUSD,
			&response.AssignedServerID,
			&response.RosterAssistantSpentUSD,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			return apptypes.JSON(c, fiber.StatusOK, response)
		}
		if err != nil {
			return err
		}
		response.RosterAssistantRemainingUSD = math.Max(0, response.RosterAssistantMonthlyCreditUSD-response.RosterAssistantSpentUSD)
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// updateBillingAssignment moves this account's monthly roster-assistant credit to one server.
//
// @Summary Assign subscription roster assistant credit
// @Tags Billing
// @Accept json
// @Security ApiKeyAuth
// @Param body body modelsv2.BillingAssignmentRequest true "Server assignment"
// @Success 204
// @Router /v2/billing/subscription/assignment [put]
func updateBillingAssignment(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		var body modelsv2.BillingAssignmentRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.ServerID == nil || strings.TrimSpace(*body.ServerID) == "" {
			_, err := a.Store.SQL.Exec(c.UserContext(), `DELETE FROM subscription_roster_assignments WHERE user_id = $1`, userID)
			if err != nil {
				return err
			}
			return c.SendStatus(fiber.StatusNoContent)
		}
		serverID := strings.TrimSpace(*body.ServerID)
		if err := authorizeDashboardAccess(c, a, serverID, "", false, false, false); err != nil {
			return err
		}
		result, err := a.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO subscription_roster_assignments (user_id, server_id, updated_at)
			SELECT user_id, $2, now() FROM subscription_entitlements
			WHERE user_id = $1 AND active = true
			ON CONFLICT (user_id) DO UPDATE SET server_id = EXCLUDED.server_id, updated_at = now()
		`, userID, serverID)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return apptypes.Error(fiber.StatusConflict, "An active subscription is required")
		}
		return c.SendStatus(fiber.StatusNoContent)
	}
}

// billingUsage returns the current roster-assistant spend for account settings.
//
// @Summary Get monthly roster assistant usage
// @Tags Billing
// @Produce json
// @Security ApiKeyAuth
// @Param serverId query string true "Discord server ID"
// @Success 200 {object} modelsv2.BillingUsageResponse
// @Router /v2/billing/usage [get]
func billingUsage(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Query("serverId"))
		if serverID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "serverId is required")
		}
		if err := authorizeDashboardAccess(c, a, serverID, "", false, false, false); err != nil {
			return err
		}
		authUserID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		discordUserID, err := rosterDashboardDiscordUserID(c, a)
		if err != nil {
			return err
		}

		response := modelsv2.BillingUsageResponse{
			ServerID:       serverID,
			ServerLimitUSD: float64(rosterAIServerMonthlyLimitCostUnits) / 1e8,
			ResetsAt:       nextUTCMonthStart(time.Now()),
		}
		var globalSpent float64
		if err := a.Store.SQL.QueryRow(c.UserContext(), `
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
		`, serverID, discordUserID).Scan(&response.ServerSpentUSD, &globalSpent, &response.UserSpentUSD); err != nil {
			return err
		}
		err = a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT active, roster_assistant_monthly_credit_usd
			FROM subscription_entitlements
			WHERE user_id = $1
		`, authUserID).Scan(&response.SubscriptionActive, &response.UserLimitUSD)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		response.GlobalFreeAvailable = globalSpent < float64(rosterAIGlobalMonthlyLimitCostUnits)/1e8
		if err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT count(*), COALESCE(sum(entitlement.roster_assistant_monthly_credit_usd), 0),
				COALESCE(sum(LEAST(entitlement.roster_assistant_monthly_credit_usd, COALESCE(spend.spent, 0))), 0)
			FROM subscription_roster_assignments assignment
			JOIN subscription_entitlements entitlement ON entitlement.user_id = assignment.user_id AND entitlement.active = true
			LEFT JOIN LATERAL (
				SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits
				WHERE user_id = assignment.user_id
				  AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			) spend ON true
			WHERE assignment.server_id = $1
		`, serverID).Scan(&response.AssignedSubscriberCount, &response.PaidLimitUSD, &response.PaidSpentUSD); err != nil {
			return err
		}
		response.PaidRemainingUSD = math.Max(0, response.PaidLimitUSD-response.PaidSpentUSD)
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

func nextUTCMonthStart(now time.Time) time.Time {
	utc := now.UTC()
	return time.Date(utc.Year(), utc.Month()+1, 1, 0, 0, 0, 0, time.UTC)
}

// createStripeCheckout creates a web Checkout session for the single ClashKing plan.
//
// @Summary Create Stripe Checkout session
// @Tags Billing
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.BillingCheckoutRequest true "Initial server assignment"
// @Success 200 {object} modelsv2.BillingSessionResponse
// @Router /v2/billing/stripe/checkout [post]
func createStripeCheckout(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.BillingCheckoutRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body.ServerID = strings.TrimSpace(body.ServerID)
		if body.ServerID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "serverId is required")
		}
		if err := authorizeDashboardAccess(c, a, body.ServerID, "", false, false, false); err != nil {
			return err
		}
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		checkoutEnabled, err := subscriptionCheckoutEnabled(c.UserContext(), a, userID, time.Now())
		if err != nil {
			return err
		}
		if !checkoutEnabled {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Subscriptions are not available right now")
		}
		if err := stripeCheckoutConfigured(a.Config); err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, err.Error())
		}
		customerID, err := stripeCustomer(c.UserContext(), a, userID)
		if err != nil {
			return err
		}
		client := stripe.NewClient(a.Config.StripeRestrictedKey)
		response, err := client.V1CheckoutSessions.Create(c.UserContext(), &stripe.CheckoutSessionCreateParams{
			Mode:                stripe.String("subscription"),
			Customer:            stripe.String(customerID),
			ClientReferenceID:   stripe.String(userID),
			LineItems:           []*stripe.CheckoutSessionCreateLineItemParams{{Price: stripe.String(a.Config.StripeMonthlyPriceID), Quantity: stripe.Int64(1)}},
			SuccessURL:          stripe.String(a.Config.StripeCheckoutSuccessURL),
			CancelURL:           stripe.String(a.Config.StripeCheckoutCancelURL),
			AllowPromotionCodes: stripe.Bool(true),
			SubscriptionData: &stripe.CheckoutSessionCreateSubscriptionDataParams{
				Metadata: map[string]string{"clashking_server_id": body.ServerID},
			},
		})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BillingSessionResponse{URL: response.URL})
	}
}

// createStripePortal creates a Stripe customer portal session.
//
// @Summary Create Stripe customer portal session
// @Tags Billing
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.BillingSessionResponse
// @Router /v2/billing/stripe/portal [post]
func createStripePortal(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := authenticatedNotificationUser(c)
		if err != nil {
			return err
		}
		if strings.TrimSpace(a.Config.StripeRestrictedKey) == "" || strings.TrimSpace(a.Config.StripePortalReturnURL) == "" {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Stripe customer portal is not configured")
		}
		var customerID string
		if err := a.Store.SQL.QueryRow(c.UserContext(), `
			SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1
		`, userID).Scan(&customerID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusNotFound, "No Stripe customer exists for this account")
			}
			return err
		}
		client := stripe.NewClient(a.Config.StripeRestrictedKey)
		response, err := client.V1BillingPortalSessions.Create(c.UserContext(), &stripe.BillingPortalSessionCreateParams{
			Customer:  stripe.String(customerID),
			ReturnURL: stripe.String(a.Config.StripePortalReturnURL),
		})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BillingSessionResponse{URL: response.URL})
	}
}

// stripeWebhook projects Stripe subscription events into local entitlements.
//
// @Summary Receive Stripe subscription events
// @Tags Billing
// @Param Stripe-Signature header string true "Stripe webhook signature"
// @Success 200
// @Router /v2/billing/stripe/webhook [post]
func stripeWebhook(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		payload := append([]byte(nil), c.Body()...)
		event, err := parseStripeWebhookEvent(payload, c.Get("Stripe-Signature"), a.Config.StripeWebhookSecret)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, err.Error())
		}
		if strings.TrimSpace(a.Config.StripeMonthlyPriceID) == "" {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Stripe subscription price is not configured")
		}
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		result, err := tx.Exec(c.UserContext(), `
			INSERT INTO billing_webhook_events (provider, event_id, event_type, payload)
			VALUES ('stripe', $1, $2, $3::jsonb)
			ON CONFLICT (provider, event_id) DO NOTHING
		`, event.ID, event.Type, string(payload))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return c.SendStatus(fiber.StatusOK)
		}
		if err := applyStripeEvent(c.UserContext(), tx, event, a.Config.StripeMonthlyPriceID); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	}
}

func applyStripeEvent(ctx context.Context, tx pgx.Tx, event stripeWebhookEvent, expectedPriceID string) error {
	switch event.Type {
	case "checkout.session.completed":
		var checkout stripeCheckoutObject
		if err := json.Unmarshal(event.Data.Object, &checkout); err != nil {
			return err
		}
		if checkout.ClientReferenceID == "" || checkout.Customer == "" {
			return errors.New("Stripe checkout event is missing ClashKing identity")
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO billing_customers (user_id, stripe_customer_id, updated_at)
			VALUES ($1, $2, now())
			ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()
		`, checkout.ClientReferenceID, checkout.Customer)
		return err
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		var subscription stripeSubscriptionObject
		if err := json.Unmarshal(event.Data.Object, &subscription); err != nil {
			return err
		}
		return projectStripeSubscription(ctx, tx, subscription, event.Data.Object, expectedPriceID)
	default:
		return nil
	}
}

func projectStripeSubscription(ctx context.Context, tx pgx.Tx, subscription stripeSubscriptionObject, raw []byte, expectedPriceID string) error {
	var userID string
	if err := tx.QueryRow(ctx, `
		SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1 FOR UPDATE
	`, subscription.Customer).Scan(&userID); err != nil {
		return err
	}
	priceID := ""
	if len(subscription.Items.Data) > 0 {
		priceID = subscription.Items.Data[0].Price.ID
	}
	var periodEnd any
	if subscription.CurrentPeriodEnd > 0 {
		periodEnd = time.Unix(subscription.CurrentPeriodEnd, 0).UTC()
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_subscriptions (
			user_id, provider, provider_subscription_id, provider_price_id, status,
			current_period_end, cancel_at_period_end, raw, updated_at
		) VALUES ($1, 'stripe', $2, NULLIF($3, ''), $4, $5, $6, $7::jsonb, now())
		ON CONFLICT (user_id) DO UPDATE SET
			provider_subscription_id = EXCLUDED.provider_subscription_id,
			provider_price_id = EXCLUDED.provider_price_id,
			status = EXCLUDED.status,
			current_period_end = EXCLUDED.current_period_end,
			cancel_at_period_end = EXCLUDED.cancel_at_period_end,
			raw = EXCLUDED.raw,
			updated_at = now()
	`, userID, subscription.ID, priceID, subscription.Status, periodEnd, subscription.CancelAtPeriodEnd, string(raw)); err != nil {
		return err
	}
	active := stripeSubscriptionActive(subscription.Status, priceID, expectedPriceID)
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscription_entitlements (
			user_id, active, bookmark_notifications_limit,
			roster_assistant_monthly_credit_usd, updated_at
		) VALUES ($1, $2, 10, 5.00, now())
		ON CONFLICT (user_id) DO UPDATE SET
			active = EXCLUDED.active,
			bookmark_notifications_limit = 10,
			roster_assistant_monthly_credit_usd = 5.00,
			updated_at = now()
	`, userID, active); err != nil {
		return err
	}
	if active && strings.TrimSpace(subscription.Metadata["clashking_server_id"]) != "" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subscription_roster_assignments (user_id, server_id, updated_at)
			VALUES ($1, $2, now())
			ON CONFLICT (user_id) DO UPDATE SET server_id = EXCLUDED.server_id, updated_at = now()
		`, userID, strings.TrimSpace(subscription.Metadata["clashking_server_id"])); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `
		WITH ranked AS (
			SELECT player_tag, row_number() OVER (ORDER BY created_at, player_tag) AS position
			FROM mobile_notification_accounts
			WHERE user_id = $1 AND source = 'bookmarked'
		)
		UPDATE mobile_notification_accounts account
		SET active = $2 AND ranked.position <= 10, updated_at = now()
		FROM ranked
		WHERE account.user_id = $1
		  AND account.player_tag = ranked.player_tag
	`, userID, active)
	return err
}

func stripeCustomer(ctx context.Context, a apptypes.Deps, userID string) (string, error) {
	tx, err := a.Store.SQL.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "stripe-customer:"+userID); err != nil {
		return "", err
	}
	var customerID string
	err = tx.QueryRow(ctx, `SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1`, userID).Scan(&customerID)
	if err == nil {
		return customerID, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	client := stripe.NewClient(a.Config.StripeRestrictedKey)
	created, err := client.V1Customers.Create(ctx, &stripe.CustomerCreateParams{
		Metadata: map[string]string{"clashking_user_id": userID},
	})
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_customers (user_id, stripe_customer_id)
		VALUES ($1, $2)
	`, userID, created.ID); err != nil {
		return "", err
	}
	return created.ID, tx.Commit(ctx)
}

func stripeCheckoutConfigured(cfg apptypes.Config) error {
	if strings.TrimSpace(cfg.StripeRestrictedKey) == "" || strings.TrimSpace(cfg.StripeMonthlyPriceID) == "" ||
		strings.TrimSpace(cfg.StripeCheckoutSuccessURL) == "" || strings.TrimSpace(cfg.StripeCheckoutCancelURL) == "" {
		return errors.New("Stripe Checkout is not configured")
	}
	return nil
}

func stripeSubscriptionActive(status, priceID, expectedPriceID string) bool {
	return (status == "active" || status == "trialing") &&
		priceID != "" && priceID == strings.TrimSpace(expectedPriceID)
}

func parseStripeWebhookEvent(payload []byte, header, secret string) (stripeWebhookEvent, error) {
	if strings.TrimSpace(secret) == "" {
		return stripeWebhookEvent{}, errors.New("Stripe webhook is not configured")
	}
	event, err := stripe.ConstructEvent(payload, header, secret, stripe.WithIgnoreAPIVersionMismatch())
	if err != nil {
		return stripeWebhookEvent{}, err
	}
	return stripeWebhookEvent{
		ID:   event.ID,
		Type: string(event.Type),
		Data: struct {
			Object json.RawMessage `json:"object"`
		}{Object: event.Data.Raw},
	}, nil
}
