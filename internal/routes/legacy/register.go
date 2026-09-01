package legacy

import (
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// Register mounts the intentionally isolated, removable legacy API surface.
func Register(app *fiber.App, deps apptypes.Deps) {
	app.Get("/player/:player_tag/warhits", playerWarHits(deps))
	app.Get("/player/:player_tag/join-leave", playerJoinLeave(deps))
	app.Get("/clan/:clan_tag/join-leave", clanJoinLeave(deps))
	app.Get("/war/:clan_tag/previous", previousWars(deps))
	app.Get("/war/:clan_tag/previous/:end_time", previousWarAtTime(deps))
	app.Get("/cwl/:clan_tag/group", currentCWLGroup(deps))
	app.Get("/cwl/:clan_tag/:season", cwlSeason(deps))
}
