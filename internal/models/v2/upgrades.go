package modelsv2

import "time"

type PlayerUpgradesReplaceRequest struct {
	Data map[string]any `json:"data" binding:"required"`
}

type PlayerUpgradesResponse struct {
	PlayerTag string         `json:"player_tag"`
	Data      map[string]any `json:"data"`
	UpdatedAt *time.Time     `json:"updated_at" extensions:"x-nullable"`
}

type PlayerUpgradePreferencesPatchRequest struct {
	Preferences map[string]any `json:"preferences" binding:"required"`
}

type PlayerUpgradePreferencesResponse struct {
	PlayerTag   string         `json:"player_tag"`
	Preferences map[string]any `json:"preferences"`
	UpdatedAt   *time.Time     `json:"updated_at" extensions:"x-nullable"`
}
