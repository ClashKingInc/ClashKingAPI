package modelsv2

import "time"

type NotificationDeviceRequest struct {
	Token               string `json:"token"`
	DeviceID            string `json:"device_id,omitempty"`
	Provider            string `json:"provider,omitempty" enums:"fcm,apns"`
	Platform            string `json:"platform" enums:"android,ios"`
	Environment         string `json:"environment,omitempty" enums:"sandbox,production"`
	AppVersion          string `json:"app_version,omitempty"`
	AuthorizationStatus string `json:"authorization_status,omitempty" enums:"authorized,provisional,denied,not_determined"`
	Locale              string `json:"locale,omitempty"`
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
	DeviceID               string   `json:"deviceId,omitempty"`
	Environment            string   `json:"environment,omitempty" enums:"sandbox,production"`
	DeviceEnabled          bool     `json:"deviceEnabled"`
	LeagueBattlesEnabled   bool     `json:"leagueBattlesEnabled"`
	WarAttacksEnabled      bool     `json:"warAttacksEnabled"`
	WarStateEnabled        bool     `json:"warStateEnabled"`
	WarRemindersEnabled    bool     `json:"warRemindersEnabled"`
	EventsEnabled          bool     `json:"eventsEnabled"`
	AnnouncementsEnabled   bool     `json:"announcementsEnabled"`
	UpgradeFinishesEnabled bool     `json:"upgradeFinishesEnabled"`
	MonthlySupportEnabled  bool     `json:"monthlySupportEnabled"`
	ReminderTimings        []int    `json:"reminderTimings"`
	AccountTags            []string `json:"accountTags"`
}

type NotificationAccount struct {
	PlayerTag string `json:"playerTag"`
	Source    string `json:"source" enums:"verified,bookmarked"`
}

type NotificationPreferencesResponse struct {
	DeviceID               string                `json:"deviceId"`
	Environment            string                `json:"environment"`
	DeviceEnabled          bool                  `json:"deviceEnabled"`
	LeagueBattlesEnabled   bool                  `json:"leagueBattlesEnabled"`
	WarAttacksEnabled      bool                  `json:"warAttacksEnabled"`
	WarStateEnabled        bool                  `json:"warStateEnabled"`
	WarRemindersEnabled    bool                  `json:"warRemindersEnabled"`
	EventsEnabled          bool                  `json:"eventsEnabled"`
	AnnouncementsEnabled   bool                  `json:"announcementsEnabled"`
	UpgradeFinishesEnabled bool                  `json:"upgradeFinishesEnabled"`
	MonthlySupportEnabled  bool                  `json:"monthlySupportEnabled"`
	ReminderTimings        []int                 `json:"reminderTimings"`
	Accounts               []NotificationAccount `json:"accounts"`
}

type NotificationMessageResponse struct {
	Message string `json:"message"`
}
