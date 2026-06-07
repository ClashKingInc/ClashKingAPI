package v2

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
)

type MobileWarHitsFilterForTest = mobileWarHitsFilter
type MobileWarQueryForTest = mobileWarQuery

func PublicMobileConfigForTest(a apptypes.Deps) fiber.Handler {
	return publicMobileConfig(a)
}

func MobileInitializationResponseForTest(
	playerTags []string,
	clanTags []string,
	playersExtended []map[string]any,
	playersBasic []map[string]any,
	clanBundle map[string]any,
	playerWarStats []any,
	userID string,
	fetchTime time.Time,
) map[string]any {
	return mobileInitializationResponse(
		playerTags,
		clanTags,
		playersExtended,
		playersBasic,
		clanBundle,
		playerWarStats,
		userID,
		fetchTime,
	)
}

func MobilePlayerExtendedContractForTest(item map[string]any) map[string]any {
	return mobilePlayerExtendedContract(item)
}

func MobileClanBundleContractForTest(bundle map[string]any) map[string]any {
	return mobileClanBundleContract(bundle)
}

func MobileInitializationWarHitsFilterForTest() MobileWarHitsFilterForTest {
	return mobileInitializationWarHitsFilter()
}

func MobileDefaultPlayerWarHitsFilterForTest(playerTags []string) MobileWarHitsFilterForTest {
	return mobileDefaultPlayerWarHitsFilter(playerTags)
}

func MobileDefaultClanWarHitsFilterForTest(clanTags []string) MobileWarHitsFilterForTest {
	return mobileDefaultClanWarHitsFilter(clanTags)
}

func MobileDecodeWarHitsFilterBodyForTest(body map[string]any) (MobileWarHitsFilterForTest, error) {
	app := fiber.New()
	var (
		filter mobileWarHitsFilter
		errOut error
	)
	app.Post("/", func(c *fiber.Ctx) error {
		filter, errOut = mobileDecodeWarHitsFilter(c)
		if errOut != nil {
			return errOut
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	payload, err := json.Marshal(body)
	if err != nil {
		return mobileWarHitsFilter{}, err
	}
	req := httptest.NewRequest("POST", "/", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	_, err = app.Test(req)
	if err != nil {
		return mobileWarHitsFilter{}, err
	}
	return filter, errOut
}

func MobileBuildInitializationWarStatsFromDocsForTest(wars []map[string]any, playerFilter MobileWarHitsFilterForTest, clanFilter MobileWarHitsFilterForTest) ([]any, []any) {
	return mobileBuildInitializationWarStatsFromDocs(wars, playerFilter, clanFilter)
}

func MobileBuildPlayerWarStatsFromDocsForTest(playerTags []string, wars []map[string]any, filter MobileWarHitsFilterForTest) []any {
	return mobileBuildPlayerWarStatsFromDocs(playerTags, wars, filter)
}

func MobileBuildClanWarStatsFromDocsForTest(clanTags []string, wars []map[string]any, filter MobileWarHitsFilterForTest) []any {
	return mobileBuildClanWarStatsFromDocs(clanTags, wars, filter)
}

func MobileMergeWarDocBatchesForTest(batches [][]map[string]any) []map[string]any {
	return mobileMergeWarDocBatches(batches)
}

func MobilePlayerWarDocsPipelineForTest(playerTag string, startUnix int64, endUnix int64, limit int) MobileWarQueryForTest {
	return mobilePlayerWarDocsPipeline(playerTag, startUnix, endUnix, limit)
}

func MobileClanWarDocsPipelineForTest(clanTag string, startUnix int64, endUnix int64, limit int) MobileWarQueryForTest {
	return mobileClanWarDocsPipeline(clanTag, startUnix, endUnix, limit)
}

func MobileLegendRankingsByTagFromRowsForTest[T ~map[string]any](playerTags []string, rows []T, limit int64) map[string][]any {
	return mobileLegendRankingsByTagFromRows(playerTags, mobileRowsForTest(rows), limit)
}

func MobileCurrentRankingsByTagFromRowsForTest[T ~map[string]any, U ~map[string]any](playerTags []string, leaderboardRows []T, fallbackRows []U) map[string]map[string]any {
	return mobileCurrentRankingsByTagFromRows(playerTags, mobileRowsForTest(leaderboardRows), mobileRowsForTest(fallbackRows))
}

func MobilePlayerWarContextTargetClanForTest(clans []string, currentClanTag string) string {
	return mobilePlayerWarContextTargetClan(clans, currentClanTag)
}

func MobilePlayerRaidDataByClanFromRowsForTest[T ~map[string]any](clanTags []string, rows []T) map[string]map[string]map[string]any {
	return mobilePlayerRaidDataByClanFromRows(clanTags, mobileRowsForTest(rows))
}

func MobileIsRaidsWindowAtForTest(now time.Time) bool {
	return mobileIsRaidsWindowAt(now)
}

func MobileWarTypeForTest(war map[string]any) string {
	return mobileWarType(war)
}

func WarSummaryResponseForTest(tag string, isInWar bool, isInCwl bool, warInfo any, leagueInfo any, warLeagueInfos []any) map[string]any {
	return warSummaryResponse(tag, isInWar, isInCwl, warInfo, leagueInfo, warLeagueInfos)
}

func WarSummaryInfoMapForTest(warInfo any) map[string]any {
	return warSummaryInfoMap(warInfo)
}

func ExtractLeagueWarTagsForTest(leagueInfo map[string]any) []string {
	return extractLeagueWarTags(leagueInfo)
}

func EnrichLeagueInfoForTest(leagueInfo map[string]any, wars []map[string]any) map[string]any {
	return enrichLeagueInfo(leagueInfo, wars)
}

func BuildLeagueIconLookupForTest(warLeagues []map[string]any, leagueTiers []map[string]any) map[string]*clashy.Icon {
	return buildLeagueIconLookup(warLeagues, leagueTiers)
}

func EnrichClanLeagueIconsForTest(clan *clashy.Clan, icons map[string]*clashy.Icon) *clashy.Clan {
	return enrichClanLeagueIcons(clan, icons)
}

func EnrichClanPayloadLeagueIconsForTest(clan map[string]any, icons map[string]*clashy.Icon) map[string]any {
	return enrichClanPayloadLeagueIcons(clan, icons)
}

func EnrichLeagueInfoIconsForTest(leagueInfo map[string]any, icons map[string]*clashy.Icon) map[string]any {
	return enrichLeagueInfoIcons(leagueInfo, icons)
}

func mobileRowsForTest[T ~map[string]any](rows []T) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, mobileAnyForTest(map[string]any(row)).(map[string]any))
	}
	return out
}

func mobileAnyForTest(value any) any {
	if value == nil {
		return nil
	}
	rv := reflect.ValueOf(value)
	switch rv.Kind() {
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return value
		}
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = mobileAnyForTest(iter.Value().Interface())
		}
		return out
	case reflect.Slice, reflect.Array:
		out := make([]any, 0, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			out = append(out, mobileAnyForTest(rv.Index(i).Interface()))
		}
		return out
	default:
		return value
	}
}
