package modelsv2

// JoinLeaveEvent is a single tracked clan join or leave event.
type JoinLeaveEvent struct {
	Time          string        `json:"time"`
	Type          string        `json:"type"`
	Tag           string        `json:"tag"`
	Name          string        `json:"name,omitempty"`
	TownHallLevel int16         `json:"townHallLevel,omitempty"`
	Clan          JoinLeaveClan `json:"clan"`
}

// JoinLeaveClan describes a clan attached to a join-leave event or total.
type JoinLeaveClan struct {
	Name  string `json:"name"`
	Tag   string `json:"tag"`
	Badge string `json:"badge"`
}

// JoinLeaveClanTotal is the total time a player spent in a clan.
type JoinLeaveClanTotal struct {
	Clan    JoinLeaveClan `json:"clan"`
	Visits  int           `json:"visits"`
	Minutes int64         `json:"minutes"`
}

// JoinLeaveSharedClanTotal is shared clan time between two players.
type JoinLeaveSharedClanTotal struct {
	Clan    JoinLeaveClan `json:"clan"`
	Minutes int64         `json:"minutes"`
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
	Items     []JoinLeaveEvent `json:"items"`
	Available int              `json:"available"`
}

// JoinLeaveTotalsResponse is returned by player join-leave totals endpoints.
type JoinLeaveTotalsResponse struct {
	Items []JoinLeaveClanTotal `json:"items"`
}

// JoinLeaveSharedResponse is returned by player join-leave shared endpoints.
type JoinLeaveSharedResponse struct {
	Items []JoinLeaveSharedClanTotal `json:"items"`
}

// JoinLeaveStatsResponse is returned by the clan join-leave stats endpoint.
type JoinLeaveStatsResponse struct {
	ClanTag        string         `json:"clan_tag"`
	TimestampStart int64          `json:"timestamp_start"`
	TimestampEnd   int64          `json:"timestamp_end"`
	Stats          JoinLeaveStats `json:"stats"`
}
