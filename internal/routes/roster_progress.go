package routes

import (
	"math"

	clashy "github.com/clashkinginc/clashy.go"
)

func rosterHeroLevelSum(heroes []clashy.Hero) int {
	total := 0
	for _, hero := range heroes {
		if hero.Village != "" && hero.Village != "home" {
			continue
		}
		total += hero.Level
	}
	return total
}

func calculateRosterMaxPercent(player *clashy.Player) (float64, error) {
	staticData, err := clashy.LoadStaticData()
	if err != nil {
		return 0, err
	}

	troopLevels := make(map[string]int, len(player.Troops))
	for _, troop := range player.HomeTroops() {
		troopLevels[troop.Name] = troop.Level
	}
	spellLevels := make(map[string]int, len(player.Spells))
	for _, spell := range player.Spells {
		spellLevels[spell.Name] = spell.Level
	}
	heroLevels := make(map[string]int, len(player.Heroes))
	for _, hero := range player.Heroes {
		if hero.Village == "" || hero.Village == "home" {
			heroLevels[hero.Name] = hero.Level
		}
	}

	currentLevels, maximumLevels := 0, 0
	addUnits := func(names []string, section, village string, levels map[string]int) {
		for _, name := range names {
			maximum := rosterMaxLevelAtTownHall(staticData.LookupByName(name, section, village), player.TownHall)
			if maximum == 0 {
				continue
			}
			current := levels[name]
			if current == 0 {
				current = 1
			}
			currentLevels += min(current, maximum)
			maximumLevels += maximum
		}
	}

	addUnits(clashy.HomeTroopOrder, "troops", "home", troopLevels)
	addUnits(clashy.SpellOrder, "spells", "", spellLevels)
	addUnits(clashy.HeroOrder, "heroes", "home", heroLevels)
	if maximumLevels == 0 {
		return 0, nil
	}
	return math.Round(float64(currentLevels)/float64(maximumLevels)*10_000) / 100, nil
}

func rosterMaxLevelAtTownHall(item map[string]any, townHall int) int {
	levels, ok := item["levels"].([]any)
	if !ok {
		return 0
	}
	maximum := 0
	for _, raw := range levels {
		level, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		requiredTownHall, requiredOK := rosterProgressInt(level["required_townhall"])
		levelNumber, levelOK := rosterProgressInt(level["level"])
		if requiredOK && levelOK && requiredTownHall <= townHall && levelNumber > maximum {
			maximum = levelNumber
		}
	}
	return maximum
}

func rosterProgressInt(value any) (int, bool) {
	switch value := value.(type) {
	case int:
		return value, true
	case int32:
		return int(value), true
	case int64:
		return int(value), true
	case float32:
		return int(value), true
	case float64:
		return int(value), true
	default:
		return 0, false
	}
}
