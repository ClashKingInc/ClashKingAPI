//go:build ignore

// Run from the authoritative clashking_schemas/database module:
// go run /absolute/path/to/generate-war-producer.go
package main

import (
  "fmt"
  "time"
  "github.com/ClashKingInc/DevKit/database/wararchive"
)

func main() {
  start := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
  payload, err := wararchive.Marshal(wararchive.War{
    ID: 42, WarTag: "#WAR", State: "warEnded", TeamSize: 15, AttacksPerMember: 1,
    PreparationStartTime: start.Add(-24 * time.Hour), StartTime: start, EndTime: start.Add(24 * time.Hour),
    BattleModifier: "none",
    Clan: wararchive.Clan{Tag: "#AAA", Name: "Clan A", ClanLevel: 10, Members: []wararchive.Member{{Tag: "#PYY", Name: "Player", TownhallLevel: 18, MapPosition: 1, Attacks: []wararchive.Attack{}}}},
    Opponent: wararchive.Clan{Tag: "#BBB", Name: "Clan B", ClanLevel: 10, Members: []wararchive.Member{{Tag: "#QYY", Name: "Opponent", TownhallLevel: 18, MapPosition: 1, Attacks: []wararchive.Attack{}}}},
  })
  if err != nil { panic(err) }
  fmt.Println(string(payload))
}
