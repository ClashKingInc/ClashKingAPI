package utils

import (
	"fmt"
	"math/rand"
	"os"
	"sync"
	"time"

	sentrysdk "github.com/getsentry/sentry-go"
	sentryfiber "github.com/getsentry/sentry-go/fiber"
	"github.com/gofiber/fiber/v2"
)

const repeatedSentryErrorSampleRate = 0.10

var seenSentryErrors sync.Map

// Init initializes Sentry error tracking with environment/release tracking.
// No-op if the DSN is empty.
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
		Dsn:         cfg.SentryDSN,
		Environment: env,
		Release:     release,
		BeforeSend:  sampleRepeatedSentryErrors,
	})
}

// FiberMiddleware installs the official Sentry Fiber integration.
func FiberMiddleware() fiber.Handler {
	return sentryfiber.New(sentryfiber.Options{
		Repanic:         true,
		WaitForDelivery: false,
		Timeout:         2 * time.Second,
	})
}

func SentryScopeMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if hub := sentryfiber.GetHubFromContext(c); hub != nil {
			hub.Scope().SetTag("request_id", RequestID(c))
			hub.Scope().SetTag("method", c.Method())
			hub.Scope().SetTag("path", c.Path())
			hub.Scope().SetExtra("ip", c.IP())
		}
		if span := sentryfiber.GetSpanFromContext(c); span != nil {
			span.SetTag("request_id", RequestID(c))
		}
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
	if status < fiber.StatusInternalServerError {
		return
	}
	hub := sentryfiber.GetHubFromContext(c)
	if hub == nil {
		hub = sentrysdk.GetHubFromContext(c.UserContext())
	}
	if hub == nil {
		hub = sentrysdk.CurrentHub()
	}
	hub.WithScope(func(scope *sentrysdk.Scope) {
		scope.SetExtra("url", c.OriginalURL())
		scope.SetTag("request_id", RequestID(c))
		if userID := UserID(c.UserContext()); userID != "" {
			scope.SetUser(sentrysdk.User{ID: userID})
		}
		hub.CaptureException(err)
	})
}

func sampleRepeatedSentryErrors(event *sentrysdk.Event, hint *sentrysdk.EventHint) *sentrysdk.Event {
	key := sentryErrorKey(event, hint)
	if key == "" {
		return event
	}
	if _, loaded := seenSentryErrors.LoadOrStore(key, struct{}{}); !loaded {
		setSentrySampleTag(event, "first")
		return event
	}
	if rand.Float64() >= repeatedSentryErrorSampleRate {
		return nil
	}
	setSentrySampleTag(event, "repeat")
	return event
}

func sentryErrorKey(event *sentrysdk.Event, hint *sentrysdk.EventHint) string {
	if hint != nil {
		if hint.OriginalException != nil {
			return fmt.Sprintf("%T:%v", hint.OriginalException, hint.OriginalException)
		}
		if hint.RecoveredException != nil {
			return fmt.Sprintf("%T:%v", hint.RecoveredException, hint.RecoveredException)
		}
	}
	if event == nil {
		return ""
	}
	if len(event.Exception) > 0 {
		exception := event.Exception[len(event.Exception)-1]
		return exception.Type + ":" + exception.Value
	}
	return event.Message
}

func setSentrySampleTag(event *sentrysdk.Event, value string) {
	if event.Tags == nil {
		event.Tags = map[string]string{}
	}
	event.Tags["error_sample"] = value
}
