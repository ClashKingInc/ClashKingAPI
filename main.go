package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/ClashKingInc/ClashKingAPI/internal/docs"
	"github.com/ClashKingInc/ClashKingAPI/internal/routes"
	"github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberrecover "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	fiberSwagger "github.com/swaggo/fiber-swagger"
	"github.com/swaggo/swag"
)

type App struct {
	utils.Deps
	StartedAt time.Time
	Server    *fiber.App
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	application, err := New(ctx)
	if err != nil {
		log.Fatal(err)
	}

	if err := application.Run(ctx); err != nil {
		log.Fatal(err)
	}
}

func New(ctx context.Context) (*App, error) {
	cfg, err := utils.Load()
	if err != nil {
		return nil, err
	}
	if err := utils.Init(cfg.SentryDSN); err != nil {
		return nil, err
	}
	stores, err := utils.NewStore(ctx, cfg)
	if err != nil {
		return nil, err
	}
	clashAdapter, err := utils.NewClashAdapter(ctx, cfg.COCEmail, cfg.COCPassword)
	if err != nil {
		_ = stores.Close(ctx)
		return nil, err
	}
	discordAdapter, err := utils.NewDiscordAdapter(cfg)
	if err != nil {
		_ = clashAdapter.Close()
		_ = stores.Close(ctx)
		return nil, err
	}
	application := &App{
		Deps: utils.Deps{
			Config:    cfg,
			Store:     stores,
			Clash:     clashAdapter,
			Discord:   discordAdapter,
			Auth:      utils.NewAuthenticator(cfg, stores),
			StartedAt: time.Now().UTC(),
		},
		StartedAt: time.Now().UTC(),
	}
	server, err := application.buildFiber()
	if err != nil {
		return nil, err
	}
	application.Server = server
	return application, nil
}

func (a *App) buildFiber() (*fiber.App, error) {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler:          utils.ErrorHandler,
	})
	app.Use(requestid.New())
	app.Use(fiberrecover.New())
	app.Use(utils.FiberMiddleware())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "*",
		AllowHeaders: "*",
	}))
	app.Use(compress.New())
	a.registerRoutes(app)
	swaggerHandler := fiberSwagger.FiberWrapHandler(fiberSwagger.URL("/openapi.json"))
	app.Get("/openapi.json", func(c *fiber.Ctx) error {
		doc, err := swag.ReadDoc()
		if err != nil {
			return err
		}
		c.Type("json")
		return c.SendString(doc)
	})
	app.Get("/docs", func(c *fiber.Ctx) error {
		return c.Redirect("/docs/index.html", fiber.StatusPermanentRedirect)
	})
	app.Get("/docs/*", swaggerHandler)
	app.Get("/redoc", func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusPermanentRedirect)
	})
	return app, nil
}

func (a *App) wrap(handler fiber.Handler) fiber.Handler {
	if a.Auth == nil {
		return handler
	}
	return a.Auth.Wrap(handler)
}

func (a *App) registerRoutes(app *fiber.App) {
	app.Post("/v2/users/coc-accounts", a.wrap(routes.AddStandardAccount(a.Deps)))
	app.Post("/v2/users/coc-accounts/verified", a.wrap(routes.AddVerifiedAccount(a.Deps)))
	app.Get("/v2/users/coc-accounts", a.wrap(routes.ListAccounts(a.Deps)))
	app.Delete("/v2/users/coc-accounts/:player_tag", a.wrap(routes.RemoveAccount(a.Deps)))
	app.Get("/v2/users/coc-accounts/:player_tag/status", a.wrap(routes.AccountStatus(a.Deps)))
	app.Put("/v2/users/coc-accounts/order", a.wrap(routes.ReorderAccounts(a.Deps)))
	app.Post("/v2/users/coc-accounts/:player_tag/verify", a.wrap(routes.VerifyAccount(a.Deps)))

	app.Get("/v2/activity/guild-summary", routes.GuildSummary(a.Deps))
	app.Get("/v2/activity/inactive-players", a.wrap(routes.InactivePlayers(a.Deps)))

	app.Post("/v2/auth/verify-email-code", routes.VerifyEmailCode(a.Deps))
	app.Get("/v2/auth/me", a.wrap(routes.CurrentUser(a.Deps)))
	app.Post("/v2/auth/discord", routes.DiscordAuth(a.Deps))
	app.Post("/v2/auth/refresh", routes.RefreshToken(a.Deps))
	app.Post("/v2/auth/register", routes.Register(a.Deps))
	app.Post("/v2/auth/resend-verification", routes.ResendVerification(a.Deps))
	app.Post("/v2/auth/email", routes.EmailLogin(a.Deps))
	app.Post("/v2/auth/link-discord", a.wrap(routes.NotImplementedDiscord()))
	app.Post("/v2/auth/link-email", a.wrap(routes.LinkEmail(a.Deps)))
	app.Post("/v2/auth/forgot-password", routes.ForgotPassword(a.Deps))
	app.Post("/v2/auth/reset-password", routes.ResetPassword(a.Deps))

	app.Get("/v2/capital/player-stats", a.wrap(routes.PlayerStats(a.Deps)))
	app.Get("/v2/capital/guild-leaderboard", a.wrap(routes.GuildLeaderboard(a.Deps)))

	app.Get("/v2/clan/:clan_tag/ranking", routes.ClanRanking(a.Deps))
	app.Get("/v2/clan/:clan_tag/board/totals", routes.BoardTotals(a.Deps))
	app.Get("/v2/clan/:clan_tag/donations/:season", routes.ClanDonationsSingle(a.Deps))
	app.Get("/v2/clan/compo", routes.ClanComposition(a.Deps))
	app.Get("/v2/clan/donations/:season", routes.ClanDonationsMany(a.Deps))
	app.Post("/v2/clans/details", routes.ClansDetails(a.Deps))
	app.Get("/v2/clan/:clan_tag/details", routes.ClanDetails(a.Deps))
	app.Get("/v2/clan/:clan_tag/members", routes.ClanMembers(a.Deps))
	app.Get("/v2/clan/:clan_tag/join-leave", routes.ClanJoinLeaveSingle(a.Deps))
	app.Post("/v2/clans/join-leave", routes.ClansJoinLeave(a.Deps))
	app.Post("/v2/clans/capital-raids", routes.ClansCapitalRaids(a.Deps))

	app.Get("/v2/config/public", routes.PublicConfig(a.Deps))

	app.Get("/v2/dates/seasons", routes.Seasons())
	app.Get("/v2/dates/raid-weekends", routes.RaidWeekends())
	app.Get("/v2/dates/current", routes.CurrentDates())
	app.Get("/v2/dates/season-start-end", routes.SeasonStartEnd())
	app.Get("/v2/dates/season-raid-dates", routes.SeasonRaidDates())

	app.Get("/v2/guilds", a.wrap(routes.GetUserGuilds(a.Deps)))
	app.Get("/v2/guild/:server_id", a.wrap(routes.GetGuildDetails(a.Deps)))

	app.Get("/v2/internal/bot/info", a.wrap(routes.BotInfo(a.Deps)))

	app.Post("/v2/tracking/players/add", a.wrap(routes.AddTrackingPlayers(a.Deps)))
	app.Post("/v2/tracking/players/remove", a.wrap(routes.RemoveTrackingPlayers(a.Deps)))

	app.Get("/v2/search/clan", routes.SearchClan(a.Deps))
	app.Get("/v2/search/:guild_id/banned-players", a.wrap(routes.SearchBannedPlayers(a.Deps)))
	app.Post("/v2/search/bookmark/:user_id/:search_type/:tag", a.wrap(routes.BookmarkSearch(a.Deps)))
	app.Post("/v2/search/recent/:user_id/:search_type/:tag", a.wrap(routes.RecentSearch(a.Deps)))
	app.Post("/v2/search/groups/create/:user_id/:name/:search_type", a.wrap(routes.GroupCreate(a.Deps)))
	app.Post("/v2/search/groups/:group_id/add/:tag", a.wrap(routes.GroupAdd(a.Deps)))
	app.Post("/v2/search/groups/:group_id/remove/:tag", a.wrap(routes.GroupRemove(a.Deps)))
	app.Get("/v2/search/groups/:group_id", a.wrap(routes.GroupGet(a.Deps)))
	app.Get("/v2/search/groups/:user_id/list", a.wrap(routes.GroupList(a.Deps)))
	app.Delete("/v2/search/groups/:group_id", a.wrap(routes.GroupDelete(a.Deps)))

	app.Get("/v2/link/server/:server_id/clan/list", a.wrap(routes.GetServerClansBasic(a.Deps)))

	app.Get("/v2/legends/players/day/:day", routes.LegendStatsDay(a.Deps))
	app.Get("/v2/legends/players/season/:season", routes.LegendStatsSeason(a.Deps))
	app.Get("/v2/legends/guild-stats", a.wrap(routes.GuildStats(a.Deps)))
	app.Get("/v2/legends/daily-tracking", a.wrap(routes.DailyTracking(a.Deps)))

	app.Get("/v2/mobile/public-config", routes.PublicMobileConfig(a.Deps))
	app.Post("/v2/mobile/initialization", a.wrap(routes.MobileInitialization(a.Deps)))

	app.Post("/v2/roster", a.wrap(routes.CreateRoster()))
	app.Get("/v2/roster/missing-members", a.wrap(routes.GetMissingMembers()))
	app.Patch("/v2/roster/:roster_id", a.wrap(routes.UpdateRoster()))
	app.Get("/v2/roster/:roster_id", a.wrap(routes.GetRoster()))
	app.Delete("/v2/roster/:roster_id", a.wrap(routes.DeleteRoster()))
	app.Delete("/v2/roster/:roster_id/members/:player_tag", a.wrap(routes.RemoveRosterMember()))
	app.Post("/v2/roster/refresh", a.wrap(routes.RefreshRosters()))
	app.Post("/v2/roster/:roster_id/clone", a.wrap(routes.CloneRoster()))
	app.Get("/v2/roster/:server_id/list", a.wrap(routes.ListRosters()))
	app.Post("/v2/roster-group", a.wrap(routes.CreateRosterGroup()))
	app.Get("/v2/roster-group/list", a.wrap(routes.ListRosterGroups()))
	app.Get("/v2/roster-group/:group_id", a.wrap(routes.GetRosterGroup()))
	app.Patch("/v2/roster-group/:group_id", a.wrap(routes.UpdateRosterGroup()))
	app.Delete("/v2/roster-group/:group_id", a.wrap(routes.DeleteRosterGroup()))
	app.Post("/v2/roster-signup-category", a.wrap(routes.CreateRosterSignupCategory()))
	app.Get("/v2/roster-signup-category/list", a.wrap(routes.ListRosterSignupCategories()))
	app.Patch("/v2/roster-signup-category/:custom_id", a.wrap(routes.UpdateRosterSignupCategory()))
	app.Delete("/v2/roster-signup-category/:custom_id", a.wrap(routes.DeleteRosterSignupCategory()))
	app.Post("/v2/roster/:roster_id/members", a.wrap(routes.ManageRosterMembers()))
	app.Patch("/v2/roster/:roster_id/members/:member_tag", a.wrap(routes.UpdateRosterMember()))
	app.Post("/v2/roster/:roster_id/members/:member_tag/refresh", a.wrap(routes.RefreshRosterMember()))
	app.Post("/v2/roster-automation", a.wrap(routes.CreateRosterAutomation()))
	app.Get("/v2/roster-automation/list", a.wrap(routes.ListRosterAutomation()))
	app.Patch("/v2/roster-automation/:automation_id", a.wrap(routes.UpdateRosterAutomation()))
	app.Delete("/v2/roster-automation/:automation_id", a.wrap(routes.DeleteRosterAutomation()))
	app.Get("/v2/roster/server/:server_id/members", a.wrap(routes.GetServerClanMembers()))
	app.Post("/v2/roster-token", a.wrap(routes.GenerateRosterToken()))
	app.Get("/v2/server/:server_id/discord-channels", a.wrap(routes.GetDiscordChannels()))
	app.Get("/v2/server/:server_id/discord-test", a.wrap(routes.TestDiscordAPI()))

	app.Get("/v2/server/:server_id/settings", a.wrap(routes.GetServerSettings(a.Deps)))
	app.Get("/v2/server/:server_id/clan/:clan_tag/settings", a.wrap(routes.GetServerClanSettings(a.Deps)))
	app.Put("/v2/server/:server_id/embed-color/:hex_code", a.wrap(routes.PutEmbedColor(a.Deps)))
	app.Patch("/v2/server/:server_id/settings", a.wrap(routes.PatchServerSettings(a.Deps)))
	app.Get("/v2/server/:server_id/logs", a.wrap(routes.GetServerLogs(a.Deps)))
	app.Put("/v2/server/:server_id/logs", a.wrap(routes.UpdateServerLogs(a.Deps)))
	app.Patch("/v2/server/:server_id/logs/:log_type", a.wrap(routes.PatchServerLogType(a.Deps)))
	app.Get("/v2/server/:server_id/clans-basic", a.wrap(routes.GetServerClansBasic(a.Deps)))
	app.Get("/v2/server/:server_id/channels", a.wrap(routes.ServerChannels()))
	app.Get("/v2/server/:server_id/threads", a.wrap(routes.ServerThreads()))
	app.Get("/v2/server/:server_id/clan-logs", a.wrap(routes.GetAllClanLogs(a.Deps)))
	app.Put("/v2/server/:server_id/clan/:clan_tag/logs", a.wrap(routes.PutClanLogs(a.Deps)))
	app.Delete("/v2/server/:server_id/clan/:clan_tag/logs", a.wrap(routes.DeleteClanLogs(a.Deps)))
	app.Get("/v2/server/:server_id/reminders", a.wrap(routes.GetServerReminders(a.Deps)))
	app.Post("/v2/server/:server_id/reminders", a.wrap(routes.CreateReminder(a.Deps)))
	app.Put("/v2/server/:server_id/reminders/:reminder_id", a.wrap(routes.UpdateReminder(a.Deps)))
	app.Delete("/v2/server/:server_id/reminders/:reminder_id", a.wrap(routes.DeleteReminder(a.Deps)))
	app.Get("/v2/server/:server_id/autoboards", a.wrap(routes.GetAutoboards(a.Deps)))
	app.Post("/v2/server/:server_id/autoboards", a.wrap(routes.CreateAutoboard(a.Deps)))
	app.Patch("/v2/server/:server_id/autoboards/:autoboard_id", a.wrap(routes.UpdateAutoboard(a.Deps)))
	app.Delete("/v2/server/:server_id/autoboards/:autoboard_id", a.wrap(routes.DeleteAutoboard(a.Deps)))
	app.Get("/v2/server/:server_id/links", a.wrap(routes.GetLinks(a.Deps)))
	app.Delete("/v2/server/:server_id/links/:user_discord_id/:player_tag", a.wrap(routes.DeleteLink(a.Deps)))
	app.Post("/v2/server/:server_id/links/bulk-unlink", a.wrap(routes.BulkUnlink(a.Deps)))
	app.Get("/v2/server/:server_id/clans", a.wrap(routes.GetServerClans(a.Deps)))
	app.Patch("/v2/server/:server_id/clan/:clan_tag/settings", a.wrap(routes.PatchClanSettings(a.Deps)))
	app.Post("/v2/server/:server_id/clans", a.wrap(routes.AddServerClan(a.Deps)))
	app.Delete("/v2/server/:server_id/clans/:clan_tag", a.wrap(routes.RemoveServerClan(a.Deps)))
	app.Get("/v2/server/:server_id/roles/:role_type", a.wrap(routes.ListRoles(a.Deps)))
	app.Post("/v2/server/:server_id/roles/:role_type", a.wrap(routes.CreateRole(a.Deps)))
	app.Delete("/v2/server/:server_id/roles/:role_type/:role_id", a.wrap(routes.DeleteRole(a.Deps)))
	app.Get("/v2/server/:server_id/discord-roles", a.wrap(routes.DiscordRoles()))
	app.Get("/v2/server/:server_id/role-settings", a.wrap(routes.GetRoleSettings(a.Deps)))
	app.Patch("/v2/server/:server_id/role-settings", a.wrap(routes.PatchRoleSettings(a.Deps)))
	app.Get("/v2/server/:server_id/all-roles", a.wrap(routes.GetAllRoles(a.Deps)))
	app.Get("/v2/server/:server_id/family-roles", a.wrap(routes.GetFamilyRoles(a.Deps)))
	app.Post("/v2/server/:server_id/family-roles", a.wrap(routes.AddFamilyRole(a.Deps)))
	app.Delete("/v2/server/:server_id/family-roles/:role_type/:role_id", a.wrap(routes.RemoveFamilyRole(a.Deps)))
	app.Get("/v2/server/:server_id/strikes", a.wrap(routes.GetStrikes(a.Deps)))
	app.Post("/v2/server/:server_id/strikes/:player_tag", a.wrap(routes.AddStrike(a.Deps)))
	app.Delete("/v2/server/:server_id/strikes/:strike_id", a.wrap(routes.DeleteStrike(a.Deps)))
	app.Get("/v2/server/:server_id/strikes/player/:player_tag/summary", a.wrap(routes.StrikeSummary(a.Deps)))
	app.Get("/v2/server/:server_id/bans", a.wrap(routes.GetBans(a.Deps)))
	app.Post("/v2/server/:server_id/bans/:player_tag", a.wrap(routes.AddBan(a.Deps)))
	app.Delete("/v2/server/:server_id/bans/:player_tag", a.wrap(routes.RemoveBan(a.Deps)))
	app.Get("/v2/server/:server_id/countdowns", a.wrap(routes.GetServerCountdowns(a.Deps)))

	app.Get("/v2/server/:server_id/panel", a.wrap(routes.GetServerPanel(a.Deps)))
	app.Put("/v2/server/:server_id/panel", a.wrap(routes.UpdateServerPanel(a.Deps)))

	app.Get("/v2/server/:server_id/giveaways", a.wrap(routes.GetServerGiveaways(a.Deps)))
	app.Get("/v2/server/:server_id/giveaways/:giveaway_id", a.wrap(routes.GetServerGiveaway(a.Deps)))
	app.Post("/v2/server/:server_id/giveaways", a.wrap(routes.CreateServerGiveaway(a.Deps)))
	app.Put("/v2/server/:server_id/giveaways/:giveaway_id", a.wrap(routes.UpdateServerGiveaway(a.Deps)))
	app.Delete("/v2/server/:server_id/giveaways/:giveaway_id", a.wrap(routes.DeleteServerGiveaway(a.Deps)))
	app.Post("/v2/server/:server_id/giveaways/:giveaway_id/reroll", a.wrap(routes.RerollGiveawayWinners(a.Deps)))

	app.Get("/v2/server/:server_id/leaderboards", a.wrap(routes.GetServerLeaderboards(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/war-performance", a.wrap(routes.GetServerWarLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/donations", a.wrap(routes.GetServerDonationsLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/capital-raids", a.wrap(routes.GetServerCapitalRaidsLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/legends", a.wrap(routes.GetServerLegendsLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/clan-games", a.wrap(routes.GetServerClanGamesLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/activity", a.wrap(routes.GetServerActivityLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/leaderboards/looting", a.wrap(routes.GetServerLootingLeaderboard(a.Deps)))
	app.Get("/v2/server/:server_id/clan/:clan_tag/countdowns", a.wrap(routes.GetClanCountdowns(a.Deps)))
	app.Post("/v2/server/:server_id/countdowns", a.wrap(routes.EnableCountdown(a.Deps)))
	app.Delete("/v2/server/:server_id/countdowns", a.wrap(routes.DisableCountdown(a.Deps)))

	app.Get("/v2/static/categories", routes.ListCategories(a.Deps))
	app.Get("/v2/static/:category", routes.CategoryItems(a.Deps))
	app.Get("/v2/static/:category/names", routes.CategoryNames(a.Deps))
	app.Get("/v2/static/:category/:item_id_or_name", routes.CategoryItem(a.Deps))
	app.Get("/v2/static/:category/:item_id_or_name/maxlevel", routes.MaxLevel(a.Deps))

	app.Get("/capital/stats/district", routes.DistrictStats(a.Deps))
	app.Get("/capital/stats/leagues", routes.LeagueStats(a.Deps))
	app.Get("/capital/:clan_tag", routes.CapitalLog(a.Deps))
	app.Post("/capital/bulk", routes.CapitalBulk(a.Deps))

	app.Get("/clan/:clan_tag/basic", routes.ClanBasic(a.Deps))
	app.Get("/clan/:clan_tag/join-leave", routes.V1ClanJoinLeave(a.Deps))
	app.Get("/clan/search", routes.ClanSearch(a.Deps))
	app.Get("/clan/:clan_tag/historical", routes.ClanHistorical(a.Deps))

	app.Get("/v2/war/:clan_tag/previous", routes.PreviousWars(a.Deps))
	app.Get("/v2/cwl/:clan_tag/ranking-history", routes.CwlRankingHistory(a.Deps))
	app.Get("/v2/cwl/league-thresholds", routes.CwlThresholds())
	app.Get("/v2/war/clan/stats", routes.ClanStats(a.Deps))
	app.Post("/v2/war/war-summary", routes.WarSummaryBulk(a.Deps))
	app.Get("/v2/war/:clan_tag/war-summary", routes.WarSummarySingle(a.Deps))
	app.Post("/v2/war/players/warhits", routes.PlayerWarhits(a.Deps))
	app.Post("/v2/war/clans/warhits", routes.ClanWarhits(a.Deps))
}

func (a *App) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		errCh <- a.Server.Listen(a.Config.Addr())
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = a.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}

func (a *App) Shutdown(ctx context.Context) error {
	if a.Server != nil {
		_ = a.Server.ShutdownWithContext(ctx)
	}
	if a.Discord != nil {
		_ = a.Discord.Close(ctx)
	}
	if a.Clash != nil {
		_ = a.Clash.Close()
	}
	if a.Store != nil {
		return a.Store.Close(ctx)
	}
	return nil
}
