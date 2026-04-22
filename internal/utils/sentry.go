package utils

import (
	"net/http"
	"os"
	"time"

	sentrysdk "github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

// Init initializes Sentry with performance monitoring, profiling, and
// environment/release tracking. No-op if the DSN is empty.
func Init(cfg Config) error {
	if cfg.SentryDSN == "" {
		return nil
	}
	env := "production"
	if cfg.Local {
		env = "local"
	}
	release := os.Getenv("SENTRY_RELEASE") // optional; set by CI/CD

	return sentrysdk.Init(sentrysdk.ClientOptions{
		Dsn:              cfg.SentryDSN,
		Environment:      env,
		Release:          release,
		TracesSampleRate: 1.0, // lower in production if traffic is high
	})
}

// FiberMiddleware clones the Sentry hub per request, starts a performance
// transaction, propagates distributed tracing headers, and stores everything
// in the user context for downstream handlers.
func FiberMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		hub := sentrysdk.CurrentHub().Clone()
		hub.Scope().SetTag("request_id", RequestID(c))
		hub.Scope().SetTag("method", c.Method())
		hub.Scope().SetTag("path", c.Path())
		hub.Scope().SetExtra("ip", c.IP())

		ctx := sentrysdk.SetHubOnContext(c.UserContext(), hub)

		// Start a transaction for performance monitoring.
		// ContinueFromHeaders enables distributed tracing when callers
		// (e.g. Next.js proxy) forward the sentry-trace/baggage headers.
		transaction := sentrysdk.StartTransaction(
			ctx,
			c.Method()+" "+c.Path(),
			sentrysdk.WithOpName("http.server"),
			sentrysdk.ContinueFromHeaders(
				c.Get("sentry-trace"),
				c.Get("baggage"),
			),
		)
		transaction.SetTag("request_id", RequestID(c))

		c.SetUserContext(transaction.Context())

		defer func() {
			transaction.Status = httpStatusToSpanStatus(c.Response().StatusCode())
			transaction.Finish()
		}()

		return c.Next()
	}
}

func FlushSentry(timeout time.Duration) {
	sentrysdk.Flush(timeout)
}

// CaptureFiberError reports err to Sentry when status >= 500.
// It uses the per-request hub stored in the Fiber context when available,
// falling back to the global hub.
func CaptureFiberError(c *fiber.Ctx, err error, status int) {
	if status < http.StatusInternalServerError {
		return
	}
	hub := sentrysdk.GetHubFromContext(c.UserContext())
	if hub == nil {
		hub = sentrysdk.CurrentHub()
	}
	hub.WithScope(func(scope *sentrysdk.Scope) {
		scope.SetExtra("url", c.OriginalURL())
		if userID := UserID(c.UserContext()); userID != "" {
			scope.SetUser(sentrysdk.User{ID: userID})
		}
		hub.CaptureException(err)
	})
}

// httpStatusToSpanStatus maps an HTTP status code to a Sentry SpanStatus,
// enabling correct performance data grouping in the Sentry dashboard.
func httpStatusToSpanStatus(code int) sentrysdk.SpanStatus {
	switch {
	case code < 400:
		return sentrysdk.SpanStatusOK
	case code == 400:
		return sentrysdk.SpanStatusInvalidArgument
	case code == 401:
		return sentrysdk.SpanStatusUnauthenticated
	case code == 403:
		return sentrysdk.SpanStatusPermissionDenied
	case code == 404:
		return sentrysdk.SpanStatusNotFound
	case code == 409:
		return sentrysdk.SpanStatusAlreadyExists
	case code == 429:
		return sentrysdk.SpanStatusResourceExhausted
	case code >= 500:
		return sentrysdk.SpanStatusInternalError
	default:
		return sentrysdk.SpanStatusUnknown
	}
}
