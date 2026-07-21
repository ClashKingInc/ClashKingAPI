package modelsv2

import "time"

type HomeActivityPlayerMapping struct {
	PlayerTag string  `json:"player_tag" binding:"required"`
	ClanTag   *string `json:"clan_tag" extensions:"x-nullable"`
}

type HomeActivityRequest struct {
	AccountID string                      `json:"account_id" binding:"required"`
	Mappings  []HomeActivityPlayerMapping `json:"mappings" binding:"required"`
	Limit     int                         `json:"limit"`
}

type HomeActivityItem struct {
	Type          string         `json:"type" enums:"join_leave,player_history"`
	Timestamp     time.Time      `json:"timestamp"`
	EventType     string         `json:"event_type"`
	PlayerTag     string         `json:"player_tag"`
	ClanTag       *string        `json:"clan_tag" extensions:"x-nullable"`
	PlayerName    *string        `json:"player_name,omitempty"`
	ClanName      *string        `json:"clan_name,omitempty"`
	TownHallLevel *int16         `json:"townhall_level,omitempty"`
	Season        *string        `json:"season,omitempty"`
	Value         *int32         `json:"value,omitempty"`
	Data          map[string]any `json:"data"`
}

type HomeActivityResponse struct {
	Items []HomeActivityItem `json:"items"`
}
