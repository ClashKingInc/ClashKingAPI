package modelsv2

type EnumValue struct {
	ID          int    `json:"id"`
	Value       string `json:"value"`
	Description string `json:"description"`
	Scope       string `json:"scope"`
}

type EnumCatalogResponse struct {
	RoleTypes      []EnumValue `json:"role_types"`
	RoleModes      []EnumValue `json:"role_modes"`
	LogTypes       []EnumValue `json:"log_types"`
	CountdownTypes []EnumValue `json:"countdown_types"`
}

type EnumValuesResponse struct {
	Values []EnumValue `json:"values"`
	Count  int         `json:"count"`
}

var RoleTypeEnums = []EnumValue{
	{ID: 1, Value: "townhall", Description: "Match a Town Hall level.", Scope: "server"},
	{ID: 2, Value: "builderhall", Description: "Match a Builder Hall level.", Scope: "server"},
	{ID: 3, Value: "league", Description: "Match a Home Village league.", Scope: "server"},
	{ID: 4, Value: "builder_league", Description: "Match a Builder Base league.", Scope: "server"},
	{ID: 5, Value: "clan_role", Description: "Match a clan member position.", Scope: "server_or_clan"},
	{ID: 6, Value: "clan_category", Description: "Match a configured clan category.", Scope: "server"},
	{ID: 7, Value: "family", Description: "Match family membership.", Scope: "server"},
	{ID: 8, Value: "achievement", Description: "Match an achievement value.", Scope: "server"},
	{ID: 9, Value: "status", Description: "Match a Discord or account status.", Scope: "server"},
}

var RoleModeEnums = []EnumValue{
	{ID: 1, Value: "both", Description: "Add the role on a match and remove it when the match ends.", Scope: "role"},
	{ID: 2, Value: "add", Description: "Add the role on a match and do not remove it.", Scope: "role"},
	{ID: 3, Value: "remove", Description: "Do not add the role. Remove it when the match ends.", Scope: "role"},
}

var CountdownTypeEnums = []EnumValue{
	{ID: 1, Value: "clan_games_timer", Description: "Show the Clan Games time.", Scope: "server"},
	{ID: 2, Value: "cwl_timer", Description: "Show the Clan War League time.", Scope: "server"},
	{ID: 3, Value: "raid_weekend_timer", Description: "Show the Raid Weekend time.", Scope: "server"},
	{ID: 4, Value: "season_end_timer", Description: "Show the season end time.", Scope: "server"},
	{ID: 5, Value: "season_day_timer", Description: "Show the current season day.", Scope: "server"},
	{ID: 6, Value: "war_score", Description: "Show the current clan war score.", Scope: "clan"},
	{ID: 7, Value: "war_timer", Description: "Show the current clan war time.", Scope: "clan"},
}

var LogTypeEnums = []EnumValue{
	{ID: 1, Value: "join_log", Description: "Record members who join a clan.", Scope: "clan"},
	{ID: 2, Value: "leave_log", Description: "Record members who leave a clan.", Scope: "clan"},
	{ID: 3, Value: "donation_log", Description: "Record troop donations.", Scope: "clan"},
	{ID: 4, Value: "clan_achievement_log", Description: "Record clan achievement changes.", Scope: "clan"},
	{ID: 5, Value: "clan_requirements_log", Description: "Record clan requirement changes.", Scope: "clan"},
	{ID: 6, Value: "clan_description_log", Description: "Record clan description changes.", Scope: "clan"},
	{ID: 7, Value: "war_log", Description: "Record clan war events.", Scope: "clan"},
	{ID: 8, Value: "war_panel", Description: "Publish the clan war panel.", Scope: "clan"},
	{ID: 9, Value: "cwl_lineup_change_log", Description: "Record CWL lineup changes.", Scope: "clan"},
	{ID: 10, Value: "capital_donations", Description: "Record Clan Capital donations.", Scope: "clan"},
	{ID: 11, Value: "capital_attacks", Description: "Record Clan Capital attacks.", Scope: "clan"},
	{ID: 12, Value: "raid_panel", Description: "Publish the Raid Weekend panel.", Scope: "clan"},
	{ID: 13, Value: "capital_weekly_summary", Description: "Publish the weekly capital summary.", Scope: "clan"},
	{ID: 14, Value: "role_change", Description: "Record clan role changes.", Scope: "clan"},
	{ID: 15, Value: "troop_upgrade", Description: "Record troop upgrades.", Scope: "clan"},
	{ID: 16, Value: "super_troop_boost", Description: "Record Super Troop boosts.", Scope: "clan"},
	{ID: 17, Value: "th_upgrade", Description: "Record Town Hall upgrades.", Scope: "clan"},
	{ID: 18, Value: "league_change", Description: "Record league changes.", Scope: "clan"},
	{ID: 19, Value: "spell_upgrade", Description: "Record spell upgrades.", Scope: "clan"},
	{ID: 20, Value: "hero_upgrade", Description: "Record hero upgrades.", Scope: "clan"},
	{ID: 21, Value: "hero_equipment_upgrade", Description: "Record hero equipment upgrades.", Scope: "clan"},
	{ID: 22, Value: "name_change", Description: "Record player name changes.", Scope: "clan"},
	{ID: 23, Value: "legend_log_attacks", Description: "Record Legend League attacks.", Scope: "clan"},
	{ID: 24, Value: "legend_log_defenses", Description: "Record Legend League defenses.", Scope: "clan"},
}

func HasEnumValue(values []EnumValue, candidate string) bool {
	for _, value := range values {
		if value.Value == candidate {
			return true
		}
	}
	return false
}

func EnumScope(values []EnumValue, candidate string) string {
	for _, value := range values {
		if value.Value == candidate {
			return value.Scope
		}
	}
	return ""
}
