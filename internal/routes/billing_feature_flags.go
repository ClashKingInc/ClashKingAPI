package routes

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/jackc/pgx/v5"
)

const subscriptionSupportFeatureFlag = "subscription_support"

type subscriptionCheckoutFlag struct {
	Enabled           bool
	RolloutPercentage int
	Platforms         []string
	StartsAt          *time.Time
	EndsAt            *time.Time
}

func subscriptionCheckoutEnabled(ctx context.Context, a apptypes.Deps, userID string, now time.Time) (bool, error) {
	var flag subscriptionCheckoutFlag
	err := a.Store.SQL.QueryRow(ctx, `
		SELECT enabled, rollout_percentage, platforms, starts_at, ends_at
		FROM admin_feature_flags
		WHERE flag_key = $1 AND public_exposure = 'safe'
	`, subscriptionSupportFeatureFlag).Scan(
		&flag.Enabled,
		&flag.RolloutPercentage,
		&flag.Platforms,
		&flag.StartsAt,
		&flag.EndsAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	return resolvesSubscriptionCheckoutFlag(flag, userID, now), nil
}

func resolvesSubscriptionCheckoutFlag(flag subscriptionCheckoutFlag, userID string, now time.Time) bool {
	if !flag.Enabled || flag.RolloutPercentage <= 0 || strings.TrimSpace(userID) == "" {
		return false
	}
	if flag.StartsAt != nil && now.Before(*flag.StartsAt) {
		return false
	}
	if flag.EndsAt != nil && !now.Before(*flag.EndsAt) {
		return false
	}
	if !containsPlatform(flag.Platforms, "web") {
		return false
	}
	if flag.RolloutPercentage >= 100 {
		return true
	}

	hash := sha256.Sum256([]byte(subscriptionSupportFeatureFlag + ":" + userID))
	bucket := int(binary.BigEndian.Uint64(hash[:8]) % 100)
	return bucket < flag.RolloutPercentage
}

func containsPlatform(platforms []string, target string) bool {
	for _, platform := range platforms {
		if strings.EqualFold(strings.TrimSpace(platform), target) {
			return true
		}
	}
	return false
}
