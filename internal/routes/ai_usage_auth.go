package routes

import (
	"crypto/subtle"
	"net/http"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

const aiUsageMeteringHeader = "X-ClashKing-AI-Metering"

func authorizeAIUsageSettlement(c *fiber.Ctx, a apptypes.Deps) error {
	expected := strings.TrimSpace(a.Config.AIUsageSecret)
	actual := strings.TrimSpace(c.Get(aiUsageMeteringHeader))
	if expected == "" || actual == "" || subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		return apptypes.Error(http.StatusUnauthorized, "Invalid AI metering credentials")
	}
	return nil
}
