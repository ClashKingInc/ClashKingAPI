package modelsv2

import "time"

type PlayerStatType string

const (
	PlayerStatTypeDonated            PlayerStatType = "donated"
	PlayerStatTypeReceived           PlayerStatType = "received"
	PlayerStatTypeClanGames          PlayerStatType = "clan_games"
	PlayerStatTypeCapitalGoldDonated PlayerStatType = "capital_gold_donated"
)

type PlayerStatChange struct {
	EventTime     time.Time      `json:"eventTime" format:"date-time"`
	ClanTag       *string        `json:"clanTag" extensions:"x-nullable"`
	StatType      PlayerStatType `json:"statType"`
	PreviousValue int64          `json:"previousValue"`
	CurrentValue  int64          `json:"currentValue"`
	Delta         int64          `json:"delta"`
}

type PlayerStatHistoryResponse struct {
	Items []PlayerStatChange `json:"items"`
}
