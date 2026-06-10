package modelsv2

// JoinLeaveEvent is a single tracked clan join or leave event.
type JoinLeaveEvent struct {
	Time       string `json:"time"`
	Type       string `json:"type"`
	Clan       string `json:"clan"`
	ClanName   string `json:"clan_name,omitempty"`
	Tag        string `json:"tag"`
	Name       string `json:"name,omitempty"`
	Townhall   int16  `json:"th,omitempty"`
	Role       string `json:"role,omitempty"`
	Previous   any    `json:"previous,omitempty"`
	Current    any    `json:"current,omitempty"`
	ClanTag    string `json:"clan_tag,omitempty"`
	PlayerTag  string `json:"player_tag,omitempty"`
	PlayerName string `json:"player_name,omitempty"`
}

// JoinLeaveStats summarizes the events in a join-leave response.
type JoinLeaveStats struct {
	TotalEvents             int                     `json:"total_events"`
	TotalJoins              int                     `json:"total_joins"`
	TotalLeaves             int                     `json:"total_leaves"`
	UniquePlayers           int                     `json:"unique_players"`
	MovingPlayers           int                     `json:"moving_players"`
	RejoinedPlayers         int                     `json:"rejoined_players"`
	FirstEvent              any                     `json:"first_event"`
	LastEvent               any                     `json:"last_event"`
	MostMovingHour          any                     `json:"most_moving_hour"`
	AvgTimeBetweenJoinLeave any                     `json:"avg_time_between_join_leave"`
	PlayersStillInClan      int                     `json:"players_still_in_clan"`
	PlayersLeftForever      int                     `json:"players_left_forever"`
	MostMovingPlayers       []JoinLeaveMovingPlayer `json:"most_moving_players"`
}

// JoinLeaveMovingPlayer is a player with repeated join-leave activity.
type JoinLeaveMovingPlayer struct {
	Tag   string `json:"tag"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// JoinLeaveResponse is returned by both clan and player v2 join-leave endpoints.
type JoinLeaveResponse struct {
	ClanTag        string           `json:"clan_tag,omitempty"`
	PlayerTag      string           `json:"player_tag,omitempty"`
	TimestampStart int64            `json:"timestamp_start"`
	TimestampEnd   int64            `json:"timestamp_end"`
	Items          []JoinLeaveEvent `json:"items"`
	Pagination     PaginationMeta   `json:"pagination"`
}

// JoinLeaveStatsResponse is returned by the clan join-leave stats endpoint.
type JoinLeaveStatsResponse struct {
	ClanTag        string         `json:"clan_tag"`
	TimestampStart int64          `json:"timestamp_start"`
	TimestampEnd   int64          `json:"timestamp_end"`
	Stats          JoinLeaveStats `json:"stats"`
}
