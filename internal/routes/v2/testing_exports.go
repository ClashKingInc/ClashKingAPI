package v2

import (
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type MobileWarHitsFilterForTest = mobileWarHitsFilter

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

func MobilePlayerWarDocsPipelineForTest(playerTag string, startUnix int64, endUnix int64, limit int) bson.A {
	return mobilePlayerWarDocsPipeline(playerTag, startUnix, endUnix, limit)
}

func MobileClanWarDocsPipelineForTest(clanTag string, startUnix int64, endUnix int64, limit int) bson.A {
	return mobileClanWarDocsPipeline(clanTag, startUnix, endUnix, limit)
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
