package utils

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

const corsMaxAgeSeconds = "3600"

// CORSMiddleware keeps public read-only data browser-readable while restricting
// credentials, authorization headers, and browser session mutations to known clients.
func CORSMiddleware(cfg Config) fiber.Handler {
	allowed := make(map[string]struct{}, len(cfg.WebAllowedOrigins))
	for _, origin := range cfg.WebAllowedOrigins {
		allowed[strings.TrimSuffix(strings.TrimSpace(origin), "/")] = struct{}{}
	}
	return func(c *fiber.Ctx) error {
		origin := strings.TrimSuffix(strings.TrimSpace(c.Get(fiber.HeaderOrigin)), "/")
		if origin == "" {
			return c.Next()
		}

		_, credentialed := allowed[origin]
		public := isPublicCORSRequest(c)
		if !credentialed && !public {
			if c.Method() == fiber.MethodOptions {
				return Error(fiber.StatusForbidden, "Origin is not allowed")
			}
			return c.Next()
		}

		c.Vary(fiber.HeaderOrigin)
		c.Vary(fiber.HeaderAccessControlRequestMethod)
		c.Vary(fiber.HeaderAccessControlRequestHeaders)
		if credentialed {
			c.Set(fiber.HeaderAccessControlAllowOrigin, origin)
			c.Set(fiber.HeaderAccessControlAllowCredentials, "true")
			c.Set(fiber.HeaderAccessControlAllowHeaders, "Authorization, Content-Type, Accept, X-Requested-With")
		} else if public {
			c.Set(fiber.HeaderAccessControlAllowOrigin, "*")
			c.Set(fiber.HeaderAccessControlAllowHeaders, "Content-Type, Accept")
		} else {
			return c.Next()
		}
		c.Set(fiber.HeaderAccessControlAllowMethods, strings.Join(APIRequestMethods(), ","))
		c.Set(fiber.HeaderAccessControlMaxAge, corsMaxAgeSeconds)
		if c.Method() == fiber.MethodOptions {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return c.Next()
	}
}

func IsAllowedWebOrigin(cfg Config, origin string) bool {
	origin = strings.TrimSuffix(strings.TrimSpace(origin), "/")
	if origin == "" {
		return false
	}
	for _, allowed := range cfg.WebAllowedOrigins {
		if origin == strings.TrimSuffix(strings.TrimSpace(allowed), "/") {
			return true
		}
	}
	return false
}

func RequireWebOrigin(cfg Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !IsAllowedWebOrigin(cfg, c.Get(fiber.HeaderOrigin)) {
			return Error(fiber.StatusForbidden, "Origin is not allowed")
		}
		return c.Next()
	}
}

func isPublicCORSRequest(c *fiber.Ctx) bool {
	method := c.Method()
	requestedHeaders := strings.ToLower(c.Get(fiber.HeaderAccessControlRequestHeaders))
	if method == fiber.MethodOptions {
		method = strings.ToUpper(strings.TrimSpace(c.Get(fiber.HeaderAccessControlRequestMethod)))
	}
	if strings.Contains(requestedHeaders, "authorization") || strings.TrimSpace(c.Get(fiber.HeaderAuthorization)) != "" {
		return false
	}
	switch method {
	case fiber.MethodGet, fiber.MethodHead:
		return !strings.HasPrefix(c.Path(), "/v2/auth/") && !strings.HasPrefix(c.Path(), "/v2/privacy/")
	case "QUERY":
		return strings.HasPrefix(c.Path(), "/v2/stats/")
	default:
		return false
	}
}
