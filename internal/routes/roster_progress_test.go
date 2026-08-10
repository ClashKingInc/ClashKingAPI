package routes

import (
	"testing"

	clashy "github.com/clashkinginc/clashy.go"
)

func TestRosterHeroLevelSumUsesHomeVillageHeroes(t *testing.T) {
	value := []clashy.Hero{
		{Name: "Barbarian King", Level: 95, Village: "home"},
		{Name: "Archer Queen", Level: 96},
		{Name: "Battle Machine", Level: 35, Village: "builderBase"},
	}
	if got := rosterHeroLevelSum(value); got != 191 {
		t.Fatalf("rosterHeroLevelSum() = %d, want 191", got)
	}
}

func TestRosterMaxLevelAtTownHall(t *testing.T) {
	item := map[string]any{"levels": []any{
		map[string]any{"level": float64(1), "required_townhall": float64(3)},
		map[string]any{"level": float64(2), "required_townhall": float64(5)},
		map[string]any{"level": float64(3), "required_townhall": float64(7)},
	}}
	if got := rosterMaxLevelAtTownHall(item, 5); got != 2 {
		t.Fatalf("rosterMaxLevelAtTownHall() = %d, want 2", got)
	}
}

func TestCalculateRosterMaxPercentReturnsOneHundredForMaxedLevels(t *testing.T) {
	player := &clashy.Player{TownHall: 18}
	for _, name := range clashy.HomeTroopOrder {
		player.Troops = append(player.Troops, clashy.Troop{Name: name, Level: 999, Village: "home"})
	}
	for _, name := range clashy.SpellOrder {
		player.Spells = append(player.Spells, clashy.Spell{Name: name, Level: 999})
	}
	for _, name := range clashy.HeroOrder {
		player.Heroes = append(player.Heroes, clashy.Hero{Name: name, Level: 999, Village: "home"})
	}
	got, err := calculateRosterMaxPercent(player)
	if err != nil {
		t.Fatal(err)
	}
	if got != 100 {
		t.Fatalf("calculateRosterMaxPercent() = %v, want 100", got)
	}
}
