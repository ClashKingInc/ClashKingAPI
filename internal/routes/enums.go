package routes

import (
	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/gofiber/fiber/v2"
)

// enumCatalog godoc
// @Summary Get all API enums
// @Description Returns stable IDs, values, scopes, and descriptions for settings enums.
// @Tags Enums
// @Produce json
// @Success 200 {object} modelsv2.EnumCatalogResponse
// @Router /v2/enums [get]
func enumCatalog(c *fiber.Ctx) error {
	return c.JSON(modelsv2.EnumCatalogResponse{
		RoleTypes: modelsv2.RoleTypeEnums, RoleModes: modelsv2.RoleModeEnums,
		LogTypes: modelsv2.LogTypeEnums, CountdownTypes: modelsv2.CountdownTypeEnums,
	})
}

func enumValuesResponse(values []modelsv2.EnumValue) modelsv2.EnumValuesResponse {
	return modelsv2.EnumValuesResponse{Values: values, Count: len(values)}
}

// enumRoleTypes godoc
// @Summary Get role types
// @Tags Enums
// @Produce json
// @Success 200 {object} modelsv2.EnumValuesResponse
// @Router /v2/enums/role-types [get]
func enumRoleTypes(c *fiber.Ctx) error {
	return c.JSON(enumValuesResponse(modelsv2.RoleTypeEnums))
}

// enumRoleModes godoc
// @Summary Get role modes
// @Tags Enums
// @Produce json
// @Success 200 {object} modelsv2.EnumValuesResponse
// @Router /v2/enums/role-modes [get]
func enumRoleModes(c *fiber.Ctx) error {
	return c.JSON(enumValuesResponse(modelsv2.RoleModeEnums))
}

// enumLogTypes godoc
// @Summary Get log types
// @Tags Enums
// @Produce json
// @Success 200 {object} modelsv2.EnumValuesResponse
// @Router /v2/enums/log-types [get]
func enumLogTypes(c *fiber.Ctx) error {
	return c.JSON(enumValuesResponse(modelsv2.LogTypeEnums))
}

// enumCountdownTypes godoc
// @Summary Get countdown types
// @Tags Enums
// @Produce json
// @Success 200 {object} modelsv2.EnumValuesResponse
// @Router /v2/enums/countdown-types [get]
func enumCountdownTypes(c *fiber.Ctx) error {
	return c.JSON(enumValuesResponse(modelsv2.CountdownTypeEnums))
}
