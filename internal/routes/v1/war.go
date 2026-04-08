package v1

import (
	"net/http"
	"sort"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// warPrevious godoc
// @Summary Previous wars for a clan
// @Tags War Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param timestamp_end query int false "End timestamp"
// @Param limit query int false "Limit (default 50)"
// @Success 200 {object} []map[string]interface{}
// @Router /war/{clan_tag}/previous [get]
func warPrevious(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		tsStart := queryInt64(c, "timestamp_start", 0)
		tsEnd := queryInt64(c, "timestamp_end", 9999999999)
		limit := queryInt(c, "limit", 50)
		ctx := c.UserContext()

		start := time.Unix(tsStart, 0).UTC().Format("20060102T150405.000Z")
		end := time.Unix(tsEnd, 0).UTC().Format("20060102T150405.000Z")

		cur, err := a.Store.C.ClanWars.Find(ctx, bson.M{"$and": bson.A{
			bson.M{"$or": bson.A{
				bson.M{"data.clan.tag": tag},
				bson.M{"data.opponent.tag": tag},
			}},
			bson.M{"data.preparationStartTime": bson.M{"$gte": start}},
			bson.M{"data.preparationStartTime": bson.M{"$lte": end}},
		}})
		if err != nil {
			return err
		}
		var wars []bson.M
		if err := cur.All(ctx, &wars); err != nil {
			return err
		}

		foundIDs := map[string]bool{}
		var result []bson.M
		for _, w := range wars {
			data, _ := w["data"].(bson.M)
			if data == nil {
				continue
			}
			prepTime, _ := data["preparationStartTime"].(string)
			if foundIDs[prepTime] {
				continue
			}
			foundIDs[prepTime] = true
			result = append(result, data)
		}

		sort.SliceStable(result, func(i, j int) bool {
			ei, _ := result[i]["endTime"].(string)
			ej, _ := result[j]["endTime"].(string)
			return ei > ej
		})
		if len(result) > limit {
			result = result[:limit]
		}
		if result == nil {
			result = []bson.M{}
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// warPreviousAtTime godoc
// @Summary Previous war at a specific end time for a clan
// @Tags War Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param end_time path string true "End time (CoC timestamp format)"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /war/{clan_tag}/previous/{end_time} [get]
func warPreviousAtTime(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		endTimeStr := c.Params("end_time")
		ctx := c.UserContext()

		// Parse CoC timestamp format (e.g. "20240101T000000.000Z")
		t, err := time.Parse("20060102T150405.000Z", endTimeStr)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid end_time format")
		}
		lower := t.Add(-5 * time.Minute).UTC().Format("20060102T150405.000Z")
		upper := t.Add(5 * time.Minute).UTC().Format("20060102T150405.000Z")

		var war bson.M
		err = a.Store.C.ClanWars.FindOne(ctx, bson.M{"$and": bson.A{
			bson.M{"$or": bson.A{
				bson.M{"data.clan.tag": tag},
				bson.M{"data.opponent.tag": tag},
			}},
			bson.M{"data.endTime": bson.M{"$gte": lower}},
			bson.M{"data.endTime": bson.M{"$lte": upper}},
		}}).Decode(&war)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "War Not Found")
		}
		data, _ := war["data"]
		return apptypes.JSON(c, http.StatusOK, data)
	}
}

// warBasic godoc
// @Summary Basic war info, bypasses private war log if possible
// @Tags War Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Router /war/{clan_tag}/basic [get]
func warBasic(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		ctx := c.UserContext()

		// 183600 seconds = ~51 hours
		cutoff := float64(time.Now().UTC().Unix() - 183600)
		cur, err := a.Store.C.ClanWars.Find(ctx, bson.M{"$and": bson.A{
			bson.M{"clans": tag},
			bson.M{"custom_id": nil},
			bson.M{"endTime": bson.M{"$gte": cutoff}},
		}}, options.Find().SetSort(bson.M{"endTime": -1}).SetLimit(1))
		if err != nil {
			return err
		}
		var wars []bson.M
		if err := cur.All(ctx, &wars); err != nil {
			return err
		}
		if len(wars) == 0 {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		result := wars[0]
		delete(result, "_id")
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// cwlGroup godoc
// @Summary CWL group info for a clan for current season
// @Tags War Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Router /cwl/{clan_tag}/group [get]
func cwlGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		season := currentSeason()
		ctx := c.UserContext()

		var result bson.M
		err := a.Store.C.CWLGroups.FindOne(ctx, bson.M{
			"$and": bson.A{
				bson.M{"data.clans.tag": tag},
				bson.M{"data.season": season},
			},
		}, options.FindOne().SetProjection(bson.M{"_id": 0})).Decode(&result)
		if err != nil {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// cwlSeason godoc
// @Summary CWL info for a clan in a season
// @Tags War Endpoints
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param season path string true "Season (YYYY-MM)"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /cwl/{clan_tag}/{season} [get]
func cwlSeason(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("clan_tag"))
		season := c.Params("season")
		ctx := c.UserContext()

		var cwlResult bson.M
		err := a.Store.C.CWLGroups.FindOne(ctx, bson.M{
			"$and": bson.A{
				bson.M{"data.clans.tag": tag},
				bson.M{"data.season": season},
			},
		}).Decode(&cwlResult)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "No CWL Data Found")
		}

		data, _ := cwlResult["data"].(bson.M)
		if data == nil {
			return apptypes.Error(http.StatusNotFound, "No CWL Data Found")
		}
		rounds, _ := data["rounds"].(bson.A)

		// Collect war tags
		var warTags []string
		for _, r := range rounds {
			round, _ := r.(bson.M)
			if round == nil {
				continue
			}
			wt, _ := round["warTags"].(bson.A)
			for _, wTag := range wt {
				if s, ok := wTag.(string); ok {
					warTags = append(warTags, s)
				}
			}
		}

		// Fetch matching wars
		warCur, err := a.Store.C.ClanWars.Find(ctx, bson.M{"$and": bson.A{
			bson.M{"data.tag": bson.M{"$in": warTags}},
			bson.M{"data.season": season},
		}})
		if err != nil {
			return err
		}
		var matchingWars []bson.M
		if err := warCur.All(ctx, &matchingWars); err != nil {
			return err
		}
		warMap := map[string]bson.M{}
		for _, w := range matchingWars {
			d, _ := w["data"].(bson.M)
			if d != nil {
				if wTag, ok := d["tag"].(string); ok {
					warMap[wTag] = d
				}
			}
		}

		// Replace warTags with war data
		for ri, r := range rounds {
			round, _ := r.(bson.M)
			if round == nil {
				continue
			}
			wt, _ := round["warTags"].(bson.A)
			newWTs := make(bson.A, len(wt))
			for i, wTag := range wt {
				if s, ok := wTag.(string); ok {
					if warData, exists := warMap[s]; exists {
						newWTs[i] = warData
					} else {
						newWTs[i] = nil
					}
				}
			}
			round["warTags"] = newWTs
			rounds[ri] = round
		}
		data["rounds"] = rounds
		data["clan_rankings"] = cwlRankings(rounds)

		return apptypes.JSON(c, http.StatusOK, data)
	}
}

func cwlRankings(rounds bson.A) []modelsv1.CWLRankingEntry {
	starDict := map[string]int64{}
	destDict := map[string]float64{}
	tagToName := map[string]string{}
	roundsWon := map[string]int{}
	roundsLost := map[string]int{}
	roundsTied := map[string]int{}

	for _, r := range rounds {
		round, _ := r.(bson.M)
		if round == nil {
			continue
		}
		wt, _ := round["warTags"].(bson.A)
		for _, wTag := range wt {
			war, ok := wTag.(bson.M)
			if !ok {
				continue
			}
			clanData, _ := war["clan"].(bson.M)
			oppData, _ := war["opponent"].(bson.M)
			if clanData == nil || oppData == nil {
				continue
			}
			clanTagStr, _ := clanData["tag"].(string)
			oppTagStr, _ := oppData["tag"].(string)
			tagToName[clanTagStr], _ = clanData["name"].(string)
			tagToName[oppTagStr], _ = oppData["name"].(string)

			// Determine winner
			clanStars := totalWarStars(clanData)
			oppStars := totalWarStars(oppData)
			clanDestr := totalWarDestruction(clanData)
			oppDestr := totalWarDestruction(oppData)

			if clanStars > oppStars || (clanStars == oppStars && clanDestr > oppDestr) {
				roundsWon[clanTagStr]++
				roundsLost[oppTagStr]++
				starDict[clanTagStr] += 10
			} else if oppStars > clanStars || (oppStars == clanStars && oppDestr > clanDestr) {
				roundsWon[oppTagStr]++
				roundsLost[clanTagStr]++
				starDict[oppTagStr] += 10
			} else {
				roundsTied[clanTagStr]++
				roundsTied[oppTagStr]++
			}

			// Count best attacks per defender
			bestAttacks := map[string]struct {
				stars int64
				destr float64
				clan  string
			}{}
			for _, sideData := range []bson.M{clanData, oppData} {
				sTag, _ := sideData["tag"].(string)
				members, _ := sideData["members"].(bson.A)
				for _, m := range members {
					mem, ok := m.(bson.M)
					if !ok {
						continue
					}
					attacks, _ := mem["attacks"].(bson.A)
					for _, a2 := range attacks {
						atk, ok := a2.(bson.M)
						if !ok {
							continue
						}
						defTag, _ := atk["defenderTag"].(string)
						stars := asBMInt64(atk["stars"])
						destr := asBMFloat64(atk["destructionPercentage"])
						prev, exists := bestAttacks[defTag]
						if !exists || stars > prev.stars || (stars == prev.stars && destr > prev.destr) {
							bestAttacks[defTag] = struct {
								stars int64
								destr float64
								clan  string
							}{stars, destr, sTag}
						}
					}
				}
			}
			for _, best := range bestAttacks {
				starDict[best.clan] += best.stars
				destDict[best.clan] += best.destr
			}
		}
	}

	type entry struct {
		name  string
		tag   string
		stars int64
		destr float64
	}
	entries := make([]entry, 0, len(starDict))
	for tag, stars := range starDict {
		entries = append(entries, entry{
			name:  tagToName[tag],
			tag:   tag,
			stars: stars,
			destr: destDict[tag],
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].stars != entries[j].stars {
			return entries[i].stars > entries[j].stars
		}
		return entries[i].destr > entries[j].destr
	})

	result := make([]modelsv1.CWLRankingEntry, len(entries))
	for i, e := range entries {
		result[i] = modelsv1.CWLRankingEntry{
			Name:        e.name,
			Tag:         e.tag,
			Stars:       e.stars,
			Destruction: e.destr,
			Rounds: modelsv1.CWLRankingRounds{
				Won:  roundsWon[e.tag],
				Tied: roundsTied[e.tag],
				Lost: roundsLost[e.tag],
			},
		}
	}
	return result
}

func totalWarStars(sideData bson.M) int64 {
	members, _ := sideData["members"].(bson.A)
	var total int64
	for _, m := range members {
		mem, ok := m.(bson.M)
		if !ok {
			continue
		}
		attacks, _ := mem["attacks"].(bson.A)
		for _, a2 := range attacks {
			atk, ok := a2.(bson.M)
			if !ok {
				continue
			}
			total += asBMInt64(atk["stars"])
		}
	}
	return total
}

func totalWarDestruction(sideData bson.M) float64 {
	members, _ := sideData["members"].(bson.A)
	var total float64
	for _, m := range members {
		mem, ok := m.(bson.M)
		if !ok {
			continue
		}
		attacks, _ := mem["attacks"].(bson.A)
		for _, a2 := range attacks {
			atk, ok := a2.(bson.M)
			if !ok {
				continue
			}
			total += asBMFloat64(atk["destructionPercentage"])
		}
	}
	return total
}

func asBMInt64(v any) int64 {
	switch x := v.(type) {
	case int:
		return int64(x)
	case int32:
		return int64(x)
	case int64:
		return x
	case float64:
		return int64(x)
	}
	return 0
}

func asBMFloat64(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}

func currentSeason() string {
	now := time.Now().UTC()
	return now.Format("2006-01")
}
