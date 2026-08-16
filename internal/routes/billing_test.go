package routes

import (
	"fmt"
	"testing"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/stripe/stripe-go/v85"
)

func TestParseStripeWebhookEvent(t *testing.T) {
	now := time.Now().UTC()
	payload := []byte(`{"id":"evt_1","object":"event","type":"customer.subscription.updated","data":{"object":{"id":"sub_1"}}}`)
	secret := "whsec_test"
	header := fmt.Sprintf("t=%d,v1=%x", now.Unix(), stripe.ComputeSignature(now, payload, secret))

	if _, err := parseStripeWebhookEvent(payload, header, secret); err != nil {
		t.Fatalf("valid Stripe signature rejected: %v", err)
	}
	if _, err := parseStripeWebhookEvent([]byte("changed"), header, secret); err == nil {
		t.Fatal("modified Stripe payload accepted")
	}
	expired := now.Add(-6 * time.Minute)
	expiredHeader := fmt.Sprintf("t=%d,v1=%x", expired.Unix(), stripe.ComputeSignature(expired, payload, secret))
	if _, err := parseStripeWebhookEvent(payload, expiredHeader, secret); err == nil {
		t.Fatal("expired Stripe signature accepted")
	}
}

func TestStripeCheckoutRequiresAllServerConfiguration(t *testing.T) {
	configured := apptypes.Config{
		StripeRestrictedKey:      "rk_test",
		StripeMonthlyPriceID:     "price_test",
		StripeCheckoutSuccessURL: "https://dashboard.clashk.ing/dashboard/settings?checkout=success",
		StripeCheckoutCancelURL:  "https://dashboard.clashk.ing/dashboard/settings?checkout=cancelled",
	}
	if err := stripeCheckoutConfigured(configured); err != nil {
		t.Fatalf("configured Stripe checkout rejected: %v", err)
	}
	configured.StripeMonthlyPriceID = ""
	if err := stripeCheckoutConfigured(configured); err == nil {
		t.Fatal("Stripe checkout accepted without a price id")
	}
}

func TestStripeSubscriptionActiveRequiresConfiguredPlan(t *testing.T) {
	if !stripeSubscriptionActive("active", "price_monthly", "price_monthly") {
		t.Fatal("expected the configured active subscription to grant entitlements")
	}
	if stripeSubscriptionActive("active", "price_other", "price_monthly") {
		t.Fatal("a different Stripe price must not grant ClashKing entitlements")
	}
	if stripeSubscriptionActive("past_due", "price_monthly", "price_monthly") {
		t.Fatal("a past-due subscription must suspend ClashKing entitlements")
	}
}

func TestNextUTCMonthStart(t *testing.T) {
	got := nextUTCMonthStart(time.Date(2026, time.December, 15, 23, 59, 59, 0, time.FixedZone("local", -6*60*60)))
	want := time.Date(2027, time.January, 1, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("next UTC month start = %s, want %s", got, want)
	}
}
