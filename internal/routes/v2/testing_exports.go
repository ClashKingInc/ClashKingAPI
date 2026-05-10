package v2

import (
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
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
