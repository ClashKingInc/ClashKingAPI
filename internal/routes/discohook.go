package routes

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

const maxDiscohookResponseBytes = 1 << 20

var discohookShareID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

var discohookClient = &http.Client{
	Timeout: 8 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 4 || req.URL.Scheme != "https" || !allowedDiscohookHost(req.URL.Hostname()) {
			return http.ErrUseLastResponse
		}
		return nil
	},
}

// resolveDiscohook resolves a Discohook share URL without exposing an open proxy.
//
// @Summary Resolve a Discohook share URL
// @Tags Dashboard
// @Produce json
// @Security ApiKeyAuth
// @Param url query string true "Discohook share URL"
// @Success 200 {object} modelsv2.DiscohookResolveResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 422 {object} modelsv2.ErrorResponse
// @Router /v2/app/discohook-resolve [get]
func resolveDiscohook(_ apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		shareURL, err := normalizeDiscohookURL(c.Query("url"))
		if err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(c.UserContext(), http.MethodGet, shareURL.String(), nil)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid Discohook URL")
		}
		req.Header.Set("User-Agent", "ClashKingAPI/2")
		response, err := discohookClient.Do(req)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Failed to resolve Discohook share link")
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return apptypes.Error(fiber.StatusUnprocessableEntity, "Discohook share not found")
		}
		if resolved := response.Request.URL.String(); strings.Contains(resolved, "?data=") || strings.Contains(resolved, "&data=") {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.DiscohookResolveResponse{ResolvedURL: resolved})
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, maxDiscohookResponseBytes+1))
		if err != nil || len(body) > maxDiscohookResponseBytes {
			return apptypes.Error(fiber.StatusBadGateway, "Discohook response was too large")
		}
		var envelope struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(body, &envelope); err != nil {
			return apptypes.Error(fiber.StatusUnprocessableEntity, "Discohook share did not return JSON")
		}
		payload := json.RawMessage(body)
		if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
			payload = envelope.Data
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.DiscohookResolveResponse{Payload: payload})
	}
}

func normalizeDiscohookURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || !allowedDiscohookHost(parsed.Hostname()) {
		return nil, apptypes.Error(fiber.StatusBadRequest, "Invalid or disallowed Discohook URL")
	}
	if parsed.Hostname() == "discohook.app" {
		shareID := parsed.Query().Get("share")
		if !discohookShareID.MatchString(shareID) {
			return nil, apptypes.Error(fiber.StatusBadRequest, "Invalid Discohook share ID")
		}
		parsed, _ = url.Parse(fmt.Sprintf("https://discohook.app/api/v1/share/%s", shareID))
	}
	return parsed, nil
}

func allowedDiscohookHost(host string) bool {
	return host == "discohook.app" || host == "share.discohook.app"
}
