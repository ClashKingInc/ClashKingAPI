package modelsv2

type LogConfig struct {
	Enabled        bool     `json:"enabled"`
	Channel        *string  `json:"channel,omitempty"`
	Thread         *string  `json:"thread,omitempty"`
	Webhook        *string  `json:"webhook,omitempty"`
	IncludeButtons *bool    `json:"include_buttons,omitempty"`
	PingRole       *string  `json:"ping_role,omitempty"`
	Clans          []string `json:"clans,omitempty"`
}

type ClanLogTypeConfig struct {
	Webhook *string `json:"webhook,omitempty"`
	Channel *string `json:"channel,omitempty"`
	Thread  *string `json:"thread,omitempty"`
}

type ClanLogsConfig struct {
	Tag                  string             `json:"tag"`
	Name                 string             `json:"name"`
	JoinLog              *ClanLogTypeConfig `json:"join_log,omitempty"`
	LeaveLog             *ClanLogTypeConfig `json:"leave_log,omitempty"`
	DonationLog          *ClanLogTypeConfig `json:"donation_log,omitempty"`
	ClanAchievementLog   *ClanLogTypeConfig `json:"clan_achievement_log,omitempty"`
	ClanRequirementsLog  *ClanLogTypeConfig `json:"clan_requirements_log,omitempty"`
	ClanDescriptionLog   *ClanLogTypeConfig `json:"clan_description_log,omitempty"`
	WarLog               *ClanLogTypeConfig `json:"war_log,omitempty"`
	WarPanel             *ClanLogTypeConfig `json:"war_panel,omitempty"`
	CWLLineupChangeLog   *ClanLogTypeConfig `json:"cwl_lineup_change_log,omitempty"`
	CapitalDonations     *ClanLogTypeConfig `json:"capital_donations,omitempty"`
	CapitalAttacks       *ClanLogTypeConfig `json:"capital_attacks,omitempty"`
	RaidPanel            *ClanLogTypeConfig `json:"raid_panel,omitempty"`
	CapitalWeeklySummary *ClanLogTypeConfig `json:"capital_weekly_summary,omitempty"`
	RoleChange           *ClanLogTypeConfig `json:"role_change,omitempty"`
	TroopUpgrade         *ClanLogTypeConfig `json:"troop_upgrade,omitempty"`
	SuperTroopBoostLog   *ClanLogTypeConfig `json:"super_troop_boost_log,omitempty"`
	THUpgrade            *ClanLogTypeConfig `json:"th_upgrade,omitempty"`
	LeagueChange         *ClanLogTypeConfig `json:"league_change,omitempty"`
	SpellUpgrade         *ClanLogTypeConfig `json:"spell_upgrade,omitempty"`
	HeroUpgrade          *ClanLogTypeConfig `json:"hero_upgrade,omitempty"`
	HeroEquipmentUpgrade *ClanLogTypeConfig `json:"hero_equipment_upgrade,omitempty"`
	NameChange           *ClanLogTypeConfig `json:"name_change,omitempty"`
	LegendLogAttacks     *ClanLogTypeConfig `json:"legend_log_attacks,omitempty"`
	LegendLogDefenses    *ClanLogTypeConfig `json:"legend_log_defenses,omitempty"`
}

type UpdateClanLogRequest struct {
	ChannelID *string  `json:"channel_id,omitempty"`
	ThreadID  *string  `json:"thread_id,omitempty"`
	LogTypes  []string `json:"log_types"`
}

type ClanLogsOperationResponse struct {
	Message         string   `json:"message"`
	ClanTag         string   `json:"clan_tag"`
	UpdatedLogTypes []string `json:"updated_log_types,omitempty"`
	DeletedLogTypes []string `json:"deleted_log_types,omitempty"`
	WebhookID       *string  `json:"webhook_id,omitempty"`
	ThreadID        *string  `json:"thread_id,omitempty"`
}
