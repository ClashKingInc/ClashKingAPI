package modelsv2

// JoinLeaveEvent is a single tracked clan join or leave event.
type JoinLeaveEvent struct {
	Time          string         `json:"time"`
	Type          string         `json:"type"`
	Tag           string         `json:"tag"`
	Name          string         `json:"name,omitempty"`
	TownHallLevel int16          `json:"townHallLevel,omitempty"`
	Clan          *JoinLeaveClan `json:"clan,omitempty"`
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

// JoinLeaveResponse is returned by both clan and player v2 join-leave endpoints.
// UniquePlayers is included for clan history; all summary counts are all-time.
type JoinLeaveResponse struct {
	Items         []JoinLeaveEvent `json:"items"`
	Available     int              `json:"available"`
	UniquePlayers int              `json:"uniquePlayers,omitempty"`
}

// JoinLeaveTotalsResponse is returned by player join-leave totals endpoints.
type JoinLeaveTotalsResponse struct {
	Items []JoinLeaveClanTotal `json:"items"`
}

// JoinLeaveSharedResponse is returned by player join-leave shared endpoints.
type JoinLeaveSharedResponse struct {
	Items []JoinLeaveSharedClanTotal `json:"items"`
}
