package modelsv2

import "time"

type NotificationDeviceRequest struct {
	Token               string `json:"token"`
	DeviceID            string `json:"device_id,omitempty"`
	Provider            string `json:"provider,omitempty" enums:"fcm,apns"`
	Platform            string `json:"platform" enums:"android,ios"`
	Environment         string `json:"environment,omitempty" enums:"sandbox,production"`
	AppVersion          string `json:"app_version,omitempty"`
	BuildNumber         string `json:"build_number,omitempty"`
	OSVersion           string `json:"os_version,omitempty"`
	DeviceModel         string `json:"device_model,omitempty"`
	AuthorizationStatus string `json:"authorization_status,omitempty" enums:"authorized,provisional,denied,not_determined"`
	Locale              string `json:"locale,omitempty"`
	Timezone            string `json:"timezone,omitempty"`
}

type NotificationDeviceResponse struct {
	DeviceID            string    `json:"device_id"`
	Provider            string    `json:"provider"`
	Platform            string    `json:"platform"`
	Environment         string    `json:"environment"`
	AuthorizationStatus string    `json:"authorization_status"`
	Enabled             bool      `json:"enabled"`
	LastSeenAt          time.Time `json:"last_seen_at"`
}

type NotificationPreferencesRequest struct {
	DeviceID          string                     `json:"device_id,omitempty"`
	Environment       string                     `json:"environment,omitempty" enums:"sandbox,production"`
	Enabled           bool                       `json:"enabled"`
	Locale            string                     `json:"locale,omitempty"`
	Timezone          string                     `json:"timezone,omitempty"`
	EnabledTypes      []string                   `json:"enabled_types"`
	WarAttackModes    []string                   `json:"war_attack_modes"`
	EventTypes        []string                   `json:"event_types"`
	ReminderTimings   []string                   `json:"reminder_timings"`
	AccountScope      string                     `json:"account_scope" enums:"all,selected"`
	SelectedAccounts  []string                   `json:"selected_accounts"`
	SelectedTownHalls []int                      `json:"selected_town_halls"`
	SelectedClanTags  []string                   `json:"selected_clan_tags"`
	Subscriptions     []NotificationSubscription `json:"subscriptions"`
}

type NotificationSubscription struct {
	Type      string         `json:"type"`
	PlayerTag string         `json:"player_tag,omitempty"`
	Enabled   bool           `json:"enabled"`
	Settings  map[string]any `json:"settings,omitempty"`
}

type NotificationPreferencesResponse struct {
	NotificationPreferencesRequest
	UpdatedAt time.Time `json:"updated_at"`
}

type NotificationMessageResponse struct {
	Message string `json:"message"`
}
