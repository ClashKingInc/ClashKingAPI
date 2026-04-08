package utils

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type HandlerFunc = fiber.Handler

type AppError struct {
	Status int    `json:"-"`
	Detail string `json:"detail"`
}

func (e *AppError) Error() string {
	return e.Detail
}

func Error(status int, detail string) error {
	return &AppError{Status: status, Detail: detail}
}

func ErrorHandler(c *fiber.Ctx, err error) error {
	var appErr *AppError
	if errors.As(err, &appErr) {
		if appErr.Status >= fiber.StatusInternalServerError {
			Logger().Error("request_failed",
				"request_id", RequestID(c),
				"method", c.Method(),
				"path", c.Path(),
				"status", appErr.Status,
				"error", appErr.Detail,
				"user_id", UserID(c.UserContext()),
			)
		}
		return JSON(c, appErr.Status, map[string]any{"detail": appErr.Detail})
	}

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		if fiberErr.Code >= fiber.StatusInternalServerError {
			Logger().Error("request_failed",
				"request_id", RequestID(c),
				"method", c.Method(),
				"path", c.Path(),
				"status", fiberErr.Code,
				"error", fiberErr.Message,
				"user_id", UserID(c.UserContext()),
			)
		}
		return JSON(c, fiberErr.Code, map[string]any{"detail": fiberErr.Message})
	}

	Logger().Log(context.Background(), slog.LevelError, "unhandled_error",
		"request_id", RequestID(c),
		"method", c.Method(),
		"path", c.Path(),
		"status", fiber.StatusInternalServerError,
		"error", err.Error(),
		"user_id", UserID(c.UserContext()),
	)
	return JSON(c, fiber.StatusInternalServerError, map[string]any{"detail": err.Error()})
}

func JSON(c *fiber.Ctx, status int, body any) error {
	return c.Status(status).JSON(body)
}

func DecodeJSON(c *fiber.Ctx, out any) error {
	if len(c.Body()) == 0 {
		return Error(fiber.StatusBadRequest, "Request body is required")
	}
	if err := json.Unmarshal(c.Body(), out); err != nil {
		return Error(fiber.StatusBadRequest, "Invalid JSON body")
	}
	return nil
}

func QueryValues(c *fiber.Ctx, key string) []string {
	values := c.Queries()
	raw, ok := values[key]
	if !ok || strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func QueryBool(c *fiber.Ctx, key string, defaultValue bool) (bool, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return defaultValue, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, Error(fiber.StatusBadRequest, "Invalid boolean query parameter: "+key)
	}
	return value, nil
}

func WithUserContext(c *fiber.Ctx, ctx context.Context) {
	c.SetUserContext(ctx)
}

var NotImplemented fiber.Handler = func(c *fiber.Ctx) error {
	return JSON(c, fiber.StatusNotImplemented, map[string]string{"detail": "Not implemented"})
}
