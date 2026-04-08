package v2

import (
	"fmt"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// seasons returns season identifiers for the requested number of seasons.
//
// @Summary Get season dates
// @Description Returns the current season or a list of previous seasons.
// @Tags Dates
// @Produce json
// @Param number_of_seasons query int false "Number of seasons to return"
// @Param as_text query bool false "Return seasons as text"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Router /v2/dates/seasons [get]
func seasons(c *fiber.Ctx) error {
	count, _ := strconv.Atoi(c.Query("number_of_seasons"))
	asText, err := apptypes.QueryBool(c, "as_text", false)
	if err != nil {
		return err
	}
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": genSeasonDate(count, asText)})
}

// raidWeekends returns raid weekend start dates.
//
// @Summary Get raid weekend dates
// @Description Returns the current raid weekend or a list of recent raid weekend dates.
// @Tags Dates
// @Produce json
// @Param number_of_weeks query int false "Number of raid weekends to return"
// @Success 200 {object} map[string]interface{}
// @Router /v2/dates/raid-weekends [get]
func raidWeekends(c *fiber.Ctx) error {
	count, _ := strconv.Atoi(c.Query("number_of_weeks"))
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": genRaidDate(count)})
}

// currentDates returns the current season, raid, legend, and clan games dates.
//
// @Summary Get current dates
// @Description Returns current season and event date identifiers.
// @Tags Dates
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/dates/current [get]
func currentDates(c *fiber.Ctx) error {
	return apptypes.JSON(c, fiber.StatusOK, modelsv2.CurrentDatesResponse{
		Season:    genSeasonDate(0, false),
		Raid:      genRaidDate(0),
		Legend:    genLegendDate(),
		ClanGames: genGamesSeason(),
	})
}

// seasonStartEnd resolves season bounds for the requested season.
//
// @Summary Get season start/end
// @Description Returns RFC3339 season boundaries for the requested season identifier.
// @Tags Dates
// @Produce json
// @Param season query string false "Season in YYYY-MM format"
// @Param gold_pass_season query bool false "Use gold pass season boundaries"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Router /v2/dates/season-start-end [get]
func seasonStartEnd(c *fiber.Ctx) error {
	season := c.Query("season")
	if season == "" {
		season = genSeasonDate(0, false).(string)
	}
	goldPass, err := apptypes.QueryBool(c, "gold_pass_season", false)
	if err != nil {
		return err
	}
	start, end, err := resolveSeasonBounds(season, goldPass)
	if err != nil {
		return err
	}
	return apptypes.JSON(c, fiber.StatusOK, modelsv2.SeasonBoundsResponse{
		SeasonStart: start,
		SeasonEnd:   end,
	})
}

// seasonRaidDates returns raid weeks for a given season.
//
// @Summary Get season raid dates
// @Description Returns raid weekend dates for the requested season.
// @Tags Dates
// @Produce json
// @Param season query string false "Season in YYYY-MM format"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Router /v2/dates/season-raid-dates [get]
func seasonRaidDates(c *fiber.Ctx) error {
	season := c.Query("season")
	if season == "" {
		season = genSeasonDate(0, false).(string)
	}
	items, err := seasonRaidWeeks(season)
	if err != nil {
		return err
	}
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
}

func genSeasonDate(numSeasons int, asText bool) any {
	now := time.Now().UTC()
	seasonMonth := now.Month()
	seasonYear := now.Year()
	if numSeasons == 0 {
		return formatSeason(seasonYear, seasonMonth, asText)
	}
	out := make([]string, 0, numSeasons)
	for i := 0; i < numSeasons; i++ {
		date := now.AddDate(0, -i, 0)
		out = append(out, formatSeason(date.Year(), date.Month(), asText))
	}
	return out
}

func formatSeason(year int, month time.Month, asText bool) string {
	if asText {
		return fmt.Sprintf("%s %d", month.String(), year)
	}
	return fmt.Sprintf("%04d-%02d", year, int(month))
}

func genRaidDate(numWeeks int) any {
	now := time.Now().UTC()
	getRaidStart := func(ts time.Time) string {
		weekday := int(ts.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		startOfWeek := time.Date(ts.Year(), ts.Month(), ts.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(weekday - 1))
		friday := startOfWeek.AddDate(0, 0, 4).Add(7 * time.Hour)
		if ts.Before(friday) {
			friday = friday.AddDate(0, 0, -7)
		}
		return friday.Format("2006-01-02")
	}
	if numWeeks == 0 {
		return getRaidStart(now)
	}
	out := make([]string, 0, numWeeks+1)
	for i := 0; i <= numWeeks; i++ {
		out = append(out, getRaidStart(now.AddDate(0, 0, -7*i)))
	}
	return out
}

func genLegendDate() string {
	now := time.Now().UTC()
	if now.Hour() < 5 {
		now = now.AddDate(0, 0, -1)
	}
	return now.Format("2006-01-02")
}

func genGamesSeason() string {
	now := time.Now().UTC()
	return fmt.Sprintf("%04d-%02d", now.Year(), int(now.Month()))
}

func resolveSeasonBounds(season string, goldPass bool) (string, string, error) {
	if len(season) != 7 {
		return "", "", apptypes.Error(fiber.StatusBadRequest, "invalid season")
	}
	year, err := strconv.Atoi(season[:4])
	if err != nil {
		return "", "", apptypes.Error(fiber.StatusBadRequest, "invalid season")
	}
	month, err := strconv.Atoi(season[5:])
	if err != nil {
		return "", "", apptypes.Error(fiber.StatusBadRequest, "invalid season")
	}
	if goldPass {
		start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 1, 0)
		return start.Format(time.RFC3339), end.Format(time.RFC3339), nil
	}
	start := time.Date(year, time.Month(month), 1, 5, 0, 0, 0, time.UTC).AddDate(0, -1, 0)
	end := start.AddDate(0, 1, 0)
	return start.Format(time.RFC3339), end.Format(time.RFC3339), nil
}

func seasonRaidWeeks(season string) ([]string, error) {
	startRaw, endRaw, err := resolveSeasonBounds(season, false)
	if err != nil {
		return nil, err
	}
	start, _ := time.Parse(time.RFC3339, startRaw)
	end, _ := time.Parse(time.RFC3339, endRaw)
	out := make([]string, 0, 7)
	for i := 0; i < 7; i++ {
		week := start.AddDate(0, 0, i*7+4)
		if week.After(end) {
			break
		}
		out = append(out, week.Format("2006-01-02"))
	}
	return out, nil
}
