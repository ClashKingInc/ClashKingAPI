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

	routesv1 "github.com/ClashKingInc/ClashKingAPI/internal/routes/v1"
	routesv2 "github.com/ClashKingInc/ClashKingAPI/internal/routes/v2"
	"github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	fiberrecover "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// @title ClashKing API
// @version 1.0
// @description ClashKing Go API documentation. Public Swagger lists only unauthenticated endpoints; private Swagger includes the full API and supports Authorization headers for secured endpoints. This API is still under active construction, so use it with caution because endpoints and payloads may still change.
// @BasePath /
// @securityDefinitions.apikey ApiKeyAuth
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
	if err := utils.Init(cfg); err != nil {
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
			Cache:     utils.NewCacheAdapter(cfg),
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
		UnescapePath:          true,
	})
	app.Use(requestid.New())
	app.Use(utils.HTTPLoggerMiddleware(a.Config))
	app.Use(utils.FiberMiddleware())
	app.Use(fiberrecover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "*",
		AllowHeaders: "*",
	}))
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
	routesv2.Register(app, a.Deps, a.wrap)
	routesv1.Register(app, a.Deps)
}

func (a *App) Run(ctx context.Context) error {
	utils.Logger().Info("server_starting",
		"addr", a.Config.Addr(),
		"docs_url", docsURL(a.Config),
	)
	errCh := make(chan error, 1)
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
	return "http://" + host + ":" + strconv.Itoa(cfg.ListenPort) + "/docs"
}
