package modelsv2

type ReminderConfig struct {
	ID              string   `json:"id"`
	Type            string   `json:"type"`
	ClanTag         *string  `json:"clan_tag,omitempty"`
	ChannelID       *string  `json:"channel_id,omitempty"`
	Time            string   `json:"time"`
	CustomText      *string  `json:"custom_text,omitempty"`
	TownhallFilter  []int    `json:"townhall_filter,omitempty"`
	Roles           []string `json:"roles,omitempty"`
	WarTypes        []string `json:"war_types,omitempty"`
	PointThreshold  any      `json:"point_threshold,omitempty"`
	AttackThreshold any      `json:"attack_threshold,omitempty"`
	RosterID        *string  `json:"roster_id,omitempty"`
	PingType        *string  `json:"ping_type,omitempty"`
}

type ServerRemindersResponse struct {
	WarReminders        []ReminderConfig `json:"war_reminders"`
	CapitalReminders    []ReminderConfig `json:"capital_reminders"`
	ClanGamesReminders  []ReminderConfig `json:"clan_games_reminders"`
	InactivityReminders []ReminderConfig `json:"inactivity_reminders"`
	RosterReminders     []ReminderConfig `json:"roster_reminders"`
}

type CreateReminderRequest struct {
	Type            string   `json:"type"`
	ClanTag         string   `json:"clan_tag"`
	ChannelID       string   `json:"channel_id"`
	Time            string   `json:"time"`
	CustomText      string   `json:"custom_text"`
	TownhallFilter  []int    `json:"townhall_filter"`
	Roles           []string `json:"roles"`
	WarTypes        []string `json:"war_types"`
	PointThreshold  any      `json:"point_threshold"`
	AttackThreshold any      `json:"attack_threshold"`
	RosterID        string   `json:"roster_id"`
	PingType        string   `json:"ping_type"`
}

type UpdateReminderRequest struct {
	ChannelID       *string  `json:"channel_id,omitempty"`
	Time            *string  `json:"time,omitempty"`
	CustomText      *string  `json:"custom_text,omitempty"`
	TownhallFilter  []int    `json:"townhall_filter,omitempty"`
	Roles           []string `json:"roles,omitempty"`
	WarTypes        []string `json:"war_types,omitempty"`
	PointThreshold  any      `json:"point_threshold,omitempty"`
	AttackThreshold any      `json:"attack_threshold,omitempty"`
	PingType        *string  `json:"ping_type,omitempty"`
}

type ReminderOperationResponse struct {
	Message    string `json:"message"`
	ReminderID string `json:"reminder_id"`
	ServerID   int    `json:"server_id"`
}
