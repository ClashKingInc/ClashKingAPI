package routes

import (
	"testing"
	"time"
)

func TestSubscriptionCheckoutFlagDefaultsClosed(t *testing.T) {
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name string
		flag subscriptionCheckoutFlag
	}{
		{name: "disabled", flag: subscriptionCheckoutFlag{RolloutPercentage: 100, Platforms: []string{"web"}}},
		{name: "zero rollout", flag: subscriptionCheckoutFlag{Enabled: true, Platforms: []string{"web"}}},
		{name: "wrong platform", flag: subscriptionCheckoutFlag{Enabled: true, RolloutPercentage: 100, Platforms: []string{"ios", "android"}}},
		{name: "missing user", flag: subscriptionCheckoutFlag{Enabled: true, RolloutPercentage: 100, Platforms: []string{"web"}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			userID := "user-1"
			if test.name == "missing user" {
				userID = ""
			}
			if resolvesSubscriptionCheckoutFlag(test.flag, userID, now) {
				t.Fatal("checkout flag resolved enabled")
			}
		})
	}
}

func TestSubscriptionCheckoutFlagHonorsWindowAndWebRollout(t *testing.T) {
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)
	startsAt := now.Add(-time.Minute)
	endsAt := now.Add(time.Minute)
	flag := subscriptionCheckoutFlag{
		Enabled:           true,
		RolloutPercentage: 100,
		Platforms:         []string{"web"},
		StartsAt:          &startsAt,
		EndsAt:            &endsAt,
	}
	if !resolvesSubscriptionCheckoutFlag(flag, "user-1", now) {
		t.Fatal("active web flag did not enable checkout")
	}
	if resolvesSubscriptionCheckoutFlag(flag, "user-1", endsAt) {
		t.Fatal("ended flag still enabled checkout")
	}
}

func TestSubscriptionCheckoutRolloutIsStable(t *testing.T) {
	flag := subscriptionCheckoutFlag{Enabled: true, RolloutPercentage: 50, Platforms: []string{"web"}}
	now := time.Date(2026, time.August, 10, 12, 0, 0, 0, time.UTC)
	first := resolvesSubscriptionCheckoutFlag(flag, "user-42", now)
	for range 10 {
		if got := resolvesSubscriptionCheckoutFlag(flag, "user-42", now); got != first {
			t.Fatal("rollout assignment changed for the same user")
		}
	}
}
