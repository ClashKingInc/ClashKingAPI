package routes

import (
	"errors"
	"net/url"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const webRefreshCookieName = "ck_web_refresh"

// webDiscordAuth exchanges Discord OAuth credentials for a browser session.
//
// @Summary Authenticate a browser with Discord
// @Description Returns a short-lived access token and sets a rotating HttpOnly refresh cookie.
// @Tags Web Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthDiscordOAuthRequest true "Discord OAuth payload"
// @Success 200 {object} modelsv2.AuthWebResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/auth/web/discord [post]
func webDiscordAuth(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthDiscordOAuthRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Code) == "" || strings.TrimSpace(body.CodeVerifier) == "" || strings.TrimSpace(body.DeviceID) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Discord code, verifier, and device ID are required")
		}
		if err := validateWebRedirectURI(a.Config, c.Get(fiber.HeaderOrigin), body.RedirectURI); err != nil {
			return err
		}
		token, err := a.Discord.ExchangeCode(c.UserContext(), body.Code, body.CodeVerifier, body.RedirectURI)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Discord authentication failed")
		}
		if token.RefreshToken == "" {
			return apptypes.Error(fiber.StatusBadGateway, "Discord did not provide a refresh token")
		}
		discordUser, err := a.Discord.GetCurrentUser(c.UserContext(), token.AccessToken)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Failed to fetch Discord user")
		}
		userID, err := upsertDiscordUser(c.UserContext(), a, discordUser)
		if err != nil {
			return err
		}
		if err := storeDiscordTokens(c.UserContext(), a, userID, body.DeviceID, token); err != nil {
			return err
		}
		return issueWebSession(c, a, discordAuthUserInfo(userID, discordUser), body.DeviceID)
	}
}

// webEmailLogin authenticates an email account for a browser session.
//
// @Summary Authenticate a browser with email
// @Tags Web Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailAuthRequest true "Login payload"
// @Success 200 {object} modelsv2.AuthWebResponse
// @Router /v2/auth/web/email [post]
func webEmailLogin(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthEmailAuthRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.DeviceID) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Device ID is required")
		}
		user, err := findUserByEmailHash(c.UserContext(), a, hashEmail(a, body.Email))
		if err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid email or password")
		}
		passwordHash := ""
		if user.PasswordHash != nil {
			passwordHash = *user.PasswordHash
		}
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.Password)); err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid email or password")
		}
		return issueWebSession(c, a, emailAuthUserInfo(user), body.DeviceID)
	}
}

// webVerifyEmailCode completes browser registration and creates a cookie session.
//
// @Summary Verify browser email registration
// @Tags Web Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailCodeRequest true "Verification payload"
// @Success 200 {object} modelsv2.AuthWebResponse
// @Router /v2/auth/web/verify-email-code [post]
func webVerifyEmailCode(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthEmailCodeRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Email) == "" || len(strings.TrimSpace(body.Code)) != 6 {
			return apptypes.Error(fiber.StatusBadRequest, "Email and a valid verification code are required")
		}
		emailHash := hashEmail(a, body.Email)
		pending, err := consumeEmailVerification(c.UserContext(), a, emailHash, body.Code)
		if err != nil {
			_ = deleteExpiredEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid or expired verification code")
		}
		user, _ := findUserByEmailHash(c.UserContext(), a, emailHash)
		if user == nil {
			user = &authUser{UserID: generateUserID()}
		}
		user.EmailHash = &emailHash
		user.Username = &pending.Username
		user.PasswordHash = &pending.PasswordHash
		if err := upsertAuthUser(c.UserContext(), a, user); err != nil {
			pending.VerificationCode = body.Code
			_ = insertEmailVerification(c.UserContext(), a, pending)
			return err
		}
		if strings.TrimSpace(pending.DeviceID) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Device ID is required")
		}
		return issueWebSession(c, a, emailAuthUserInfo(user), pending.DeviceID)
	}
}

// webResetPassword completes a reset and creates a browser cookie session.
//
// @Summary Reset a browser account password
// @Tags Web Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthResetPasswordRequest true "Reset payload"
// @Success 200 {object} modelsv2.AuthWebResponse
// @Router /v2/auth/web/reset-password [post]
func webResetPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthResetPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateEmail(body.Email); err != nil {
			return err
		}
		if len(body.ResetCode) != 6 || strings.TrimSpace(body.DeviceID) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Reset code and device ID are required")
		}
		if err := validatePassword(body.NewPassword); err != nil {
			return err
		}
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		userID, err := resetPasswordAndRevokeSessions(c.UserContext(), a, hashEmail(a, body.Email), body.ResetCode, string(passwordHash))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.Error(fiber.StatusUnauthorized, "Invalid or expired password reset code.")
			}
			return err
		}
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil {
			return err
		}
		return issueWebSession(c, a, emailAuthUserInfo(user), body.DeviceID)
	}
}

// webRefreshToken rotates the one-time browser refresh cookie.
//
// @Summary Refresh a browser session
// @Tags Web Authentication
// @Produce json
// @Success 200 {object} modelsv2.AuthWebRefreshResponse
// @Router /v2/auth/web/refresh [post]
func webRefreshToken(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		oldToken := strings.TrimSpace(c.Cookies(webRefreshCookieName))
		if oldToken == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Browser session is missing")
		}
		claims, err := parseWebRefreshToken(a, oldToken)
		if err != nil {
			clearWebRefreshCookie(c)
			return err
		}
		stored, err := findRefreshToken(c.UserContext(), a, oldToken)
		if err != nil || stored.UserID != claims.Sub || time.Now().UTC().After(stored.ExpiresAt) {
			clearWebRefreshCookie(c)
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid browser session")
		}
		accessToken, err := apptypes.GenerateWebAccessToken(a.Config, claims.Sub, claims.Device)
		if err != nil {
			return err
		}
		newRefreshToken, err := apptypes.GenerateWebRefreshToken(a.Config, claims.Sub, claims.Device)
		if err != nil {
			return err
		}
		if err := rotateRefreshToken(c.UserContext(), a, oldToken, newRefreshToken, claims.Sub, claims.Device); err != nil {
			clearWebRefreshCookie(c)
			return apptypes.Error(fiber.StatusUnauthorized, "Browser session was already refreshed")
		}
		setWebRefreshCookie(c, newRefreshToken)
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthWebRefreshResponse{AccessToken: accessToken})
	}
}

// webLogout revokes and expires the browser refresh cookie.
//
// @Summary Log out a browser session
// @Tags Web Authentication
// @Success 204
// @Router /v2/auth/web/logout [post]
func webLogout(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := strings.TrimSpace(c.Cookies(webRefreshCookieName))
		clearWebRefreshCookie(c)
		if token != "" {
			if claims, err := parseWebRefreshToken(a, token); err == nil && claims.Sub != "" {
				if err := revokeRefreshToken(c.UserContext(), a, token); err != nil {
					return err
				}
			}
		}
		return c.SendStatus(fiber.StatusNoContent)
	}
}

func issueWebSession(c *fiber.Ctx, a apptypes.Deps, user modelsv2.AuthUserInfo, deviceID string) error {
	accessToken, err := apptypes.GenerateWebAccessToken(a.Config, user.UserID, deviceID)
	if err != nil {
		return err
	}
	refreshToken, err := apptypes.GenerateWebRefreshToken(a.Config, user.UserID, deviceID)
	if err != nil {
		return err
	}
	if err := storeRefreshToken(c.UserContext(), a, user.UserID, refreshToken); err != nil {
		return err
	}
	setWebRefreshCookie(c, refreshToken)
	return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthWebResponse{AccessToken: accessToken, User: user})
}

func setWebRefreshCookie(c *fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     webRefreshCookieName,
		Value:    token,
		Path:     "/v2/auth/web",
		Expires:  time.Now().UTC().Add(30 * 24 * time.Hour),
		MaxAge:   30 * 24 * 60 * 60,
		Secure:   true,
		HTTPOnly: true,
		SameSite: fiber.CookieSameSiteStrictMode,
	})
}

func clearWebRefreshCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     webRefreshCookieName,
		Value:    "",
		Path:     "/v2/auth/web",
		Expires:  time.Unix(0, 0).UTC(),
		MaxAge:   -1,
		Secure:   true,
		HTTPOnly: true,
		SameSite: fiber.CookieSameSiteStrictMode,
	})
}

func validateWebRedirectURI(cfg apptypes.Config, requestOrigin, rawRedirect string) error {
	redirect, err := url.Parse(strings.TrimSpace(rawRedirect))
	if err != nil || redirect.Scheme == "" || redirect.Host == "" {
		return apptypes.Error(fiber.StatusBadRequest, "Invalid Discord redirect URI")
	}
	redirectOrigin := redirect.Scheme + "://" + redirect.Host
	requestOrigin = strings.TrimSuffix(strings.TrimSpace(requestOrigin), "/")
	if redirectOrigin != requestOrigin || !apptypes.IsAllowedWebOrigin(cfg, redirectOrigin) {
		return apptypes.Error(fiber.StatusForbidden, "Discord redirect URI is not allowed")
	}
	return nil
}
