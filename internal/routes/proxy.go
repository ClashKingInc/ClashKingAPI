package routes

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

var proxyHTTPClient = &http.Client{Timeout: 20 * time.Second}

func proxyForward(a apptypes.Deps, routePrefix string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		baseURL := strings.TrimRight(strings.TrimSpace(a.Config.ProxyBaseURL), "/")
		if baseURL == "" {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Proxy upstream is not configured")
		}

		originalURL := c.OriginalURL()
		pathAndQuery := strings.TrimPrefix(originalURL, routePrefix)
		if pathAndQuery == originalURL || pathAndQuery == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid proxy path")
		}

		req, err := http.NewRequestWithContext(c.UserContext(), c.Method(), baseURL+"/"+pathAndQuery, bytes.NewReader(c.BodyRaw()))
		if err != nil {
			return err
		}

		req.Header.Set("Accept", "application/json")
		if contentType := c.Get("Content-Type"); contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		if userAgent := c.Get("User-Agent"); userAgent != "" {
			req.Header.Set("User-Agent", userAgent)
		}

		resp, err := proxyHTTPClient.Do(req)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Proxy upstream request failed: "+err.Error())
		}
		defer func() {
			_ = resp.Body.Close()
		}()

		for _, headerName := range []string{"cache-control", "expires", "etag", "last-modified", "content-type"} {
			if value := resp.Header.Get(headerName); value != "" {
				c.Set(headerName, value)
			}
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		recordRecentSearchFromProxy(c, a, pathAndQuery, resp.StatusCode, body)
		return c.Status(resp.StatusCode).Send(body)
	}
}
