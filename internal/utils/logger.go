package utils

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

var appLogger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

func InitLogger(cfg Config) *slog.Logger {
	level := parseLogLevel(os.Getenv("LOG_LEVEL"))

	var handler slog.Handler
	if cfg.Local {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level:     level,
			AddSource: false,
		})
	} else {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level:     level,
			AddSource: false,
		})
	}

	appLogger = slog.New(handler).With(
		"service", "clashking-api",
		"env", envName(cfg),
	)
	slog.SetDefault(appLogger)
	return appLogger
}

func Logger() *slog.Logger {
	return appLogger
}

func RequestID(c *fiber.Ctx) string {
	if value := c.Locals("requestid"); value != nil {
		if requestID, ok := value.(string); ok {
			return requestID
		}
	}
	return ""
}

func HTTPLoggerMiddleware(cfg Config) fiber.Handler {
	slowRequestThreshold := time.Second
	return func(c *fiber.Ctx) error {
		startedAt := time.Now()
		err := c.Next()
		duration := time.Since(startedAt)
		status := c.Response().StatusCode()

		logAll := cfg.Local
		logThisRequest := logAll || status >= 400 || duration >= slowRequestThreshold
		if logThisRequest {
			level := slog.LevelInfo
			if status >= 500 {
				level = slog.LevelError
			} else if status >= 400 {
				level = slog.LevelWarn
			}

			Logger().Log(context.Background(), level, "http_request",
				"request_id", RequestID(c),
				"method", c.Method(),
				"path", c.Path(),
				"query", c.Context().QueryArgs().String(),
				"status", status,
				"duration_ms", duration.Milliseconds(),
				"ip", c.IP(),
				"user_id", UserID(c.UserContext()),
			)
		}

		return err
	}
}

func envName(cfg Config) string {
	if cfg.Local {
		return "local"
	}
	return "production"
}

func parseLogLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
