package utils

import (
	"net/http"

	sentrysdk "github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

func Init(dsn string) error {
	if dsn == "" {
		return nil
	}
	return sentrysdk.Init(sentrysdk.ClientOptions{Dsn: dsn})
}

func Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer sentrysdk.Flush(2)
			next.ServeHTTP(w, r)
		})
	}
}

func FiberMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer sentrysdk.Flush(2)
		return c.Next()
	}
}
