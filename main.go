package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	routes "github.com/ClashKingInc/ClashKingAPI/internal/routes"
	"github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	fiberrecover "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// @title ClashKing API
// @version 1.0
// @description ### Clash of Clans Based API 👑
// @description - No Auth Required, Free to Use
// @description - Please credit if using these stats in your project, Creator Code: ClashKing
// @description - Ratelimit is largely 30 req/sec, 5 req/sec on post & large requests
// @description - Largely 300 second cache
// @description - Not perfect, stats are collected by polling the Official API
// @description - [ClashKing Discord](https://discord.gg/mCQkUBpUta) | [API Developers](https://discord.gg/clashapi)
// @description
// @description This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it.
// @description For more information see [Supercell's Fan Content Policy](https://supercell.com/fan-content-policy)
// @BasePath /
// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization
// @securityDefinitions.apikey DeveloperToken
// @in header
// @name Authorization
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
		slog.Error("failed_to_initialize_app", "error", err)
		os.Exit(1)
	}

	if err := application.Run(ctx); err != nil {
		slog.Error("app_stopped_with_error", "error", err)
		os.Exit(1)
	}
}

func New(ctx context.Context) (*App, error) {
	cfg, err := utils.Load()
	if err != nil {
		return nil, err
	}
	logger := utils.InitLogger(cfg)
	logger.Info("initializing_app")
	if err := utils.InitEncryption(cfg.DataEncryptionKey); err != nil {
		return nil, errors.New("invalid DATA_ENCRYPTION_KEY: " + err.Error())
	}
	if err := utils.Init(cfg); err != nil {
		return nil, err
	}
	stores, err := utils.NewStore(ctx, cfg)
	if err != nil {
		return nil, err
	}
	searchAdapter, err := utils.NewElasticsearchAdapter(cfg)
	if err != nil {
		_ = stores.Close(ctx)
		return nil, err
	}
	clashAdapter, err := utils.NewClashAdapter(ctx, cfg.ProxyOrigin)
	if err != nil {
		searchAdapter.Close()
		_ = stores.Close(ctx)
		return nil, err
	}
	discordAdapter, err := utils.NewDiscordAdapter(cfg)
	if err != nil {
		_ = clashAdapter.Close()
		searchAdapter.Close()
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
			Cache:     utils.NewCacheAdapter(cfg),
			Search:    searchAdapter,
			Mailer:    utils.NewMailer(cfg),
			StartedAt: time.Now().UTC(),
		},
		StartedAt: time.Now().UTC(),
	}
	server, err := application.buildFiber()
	if err != nil {
		_ = application.Shutdown(ctx)
		return nil, err
	}
	application.Server = server
	return application, nil
}

func (a *App) buildFiber() (*fiber.App, error) {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler:          utils.ErrorHandler,
		BodyLimit:             30 * 1024 * 1024,
		RequestMethods:        utils.APIRequestMethods(),
	})
	app.Use(requestid.New())
	app.Use(utils.HTTPLoggerMiddleware(a.Config))
	app.Use(utils.FiberMiddleware())
	app.Use(utils.SentryScopeMiddleware())
	app.Use(fiberrecover.New())
	app.Use(utils.CORSMiddleware(a.Config))
	app.Use(compress.New())
	a.registerRoutes(app)
	if err := a.registerSwaggerRoutes(app); err != nil {
		return nil, err
	}
	return app, nil
}

func (a *App) wrap(handler fiber.Handler) fiber.Handler {
	if a.Auth == nil {
		return handler
	}
	return a.Auth.Wrap(handler)
}

func (a *App) registerRoutes(app *fiber.App) {
	routes.Register(app, a.Deps, a.wrap)
}

func (a *App) Run(ctx context.Context) error {
	utils.Logger().Info("server_starting",
		"addr", a.Config.Addr(),
		"docs_url", docsURL(a.Config),
	)
	errCh := make(chan error, 1)
	go a.refreshMaterializedViews(ctx)
	go func() {
		errCh <- a.Server.Listen(a.Config.Addr())
	}()
	select {
	case <-ctx.Done():
		utils.Logger().Info("shutdown_signal_received")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = a.Shutdown(shutdownCtx)
		utils.Logger().Info("server_stopped")
		return nil
	case err := <-errCh:
		if err != nil && !errors.Is(err, context.Canceled) {
			utils.Logger().Error("server_listen_failed", "error", err)
		}
		return err
	}
}

func (a *App) refreshMaterializedViews(ctx context.Context) {
	const refreshInterval = 5 * time.Minute
	ticker := time.NewTicker(refreshInterval)
	defer ticker.Stop()
	for {
		refreshCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
		err := a.Store.RefreshAPIMaterializedViews(refreshCtx)
		cancel()
		if err != nil && !errors.Is(err, context.Canceled) {
			utils.Logger().Error("materialized_view_refresh_failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (a *App) Shutdown(ctx context.Context) error {
	utils.Logger().Info("shutdown_started")
	if a.Server != nil {
		_ = a.Server.ShutdownWithContext(ctx)
	}
	if a.Discord != nil {
		_ = a.Discord.Close(ctx)
	}
	if a.Clash != nil {
		_ = a.Clash.Close()
	}
	if a.Cache != nil {
		a.Cache.Close()
	}
	if a.Search != nil {
		a.Search.Close()
	}
	utils.FlushSentry(2 * time.Second)
	if a.Store != nil {
		err := a.Store.Close(ctx)
		if err == nil {
			utils.Logger().Info("shutdown_completed")
		}
		return err
	}
	utils.Logger().Info("shutdown_completed")
	return nil
}

func docsURL(cfg utils.Config) string {
	host := cfg.ListenHost
	if host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	return "http://" + host + ":" + strconv.Itoa(cfg.ListenPort) + "/"
}
