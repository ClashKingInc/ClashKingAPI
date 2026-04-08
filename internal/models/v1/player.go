package modelsv1

// PlayerLootedData holds resource looting stats for a player.
type PlayerLootedData struct {
	Gold      any `json:"gold"`
	Elixir    any `json:"elixir"`
	DarkElixir any `json:"dark_elixir"`
}

// PlayerStatsResponse is returned by GET /player/:player_tag/stats.
type PlayerStatsResponse struct {
	Name                    any              `json:"name"`
	Tag                     any              `json:"tag"`
	Townhall                any              `json:"townhall"`
	Legends                 any              `json:"legends"`
	LastOnline              any              `json:"last_online"`
	Looted                  PlayerLootedData `json:"looted"`
	Trophies                any              `json:"trophies"`
	WarStars                any              `json:"warStars"`
	ClanCapitalContributions any             `json:"clanCapitalContributions"`
	Donations               any              `json:"donations"`
	Capital                 any              `json:"capital"`
	ClanGames               any              `json:"clan_games"`
	SeasonPass              any              `json:"season_pass"`
	AttackWins              any              `json:"attack_wins"`
	Activity                any              `json:"activity"`
	ClanTag                 any              `json:"clan_tag"`
	League                  any              `json:"league"`
	Location                any              `json:"location,omitempty"`
}

// PlayerLegendsResponse is returned by GET /player/:player_tag/legends.
type PlayerLegendsResponse struct {
	Name     any `json:"name"`
	Tag      any `json:"tag"`
	Townhall any `json:"townhall"`
	Legends  any `json:"legends"`
	Rankings any `json:"rankings"`
	Streak   any `json:"streak"`
}
