package routes

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/mail"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const defaultAvatarURL = "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png"

var errRefreshTokenConsumed = errors.New("refresh token was already consumed")

// verifyEmailCode verifies a pending email registration code and returns auth tokens.
//
// @Summary Verify email address with 6-digit code
// @Description Confirms a pending email registration by checking the verification code and creates the account session.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailCodeRequest true "Verification payload"
// @Success 200 {object} modelsv2.AuthResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/verify-email-code [post]
// @Router /v2/auth/verify-email-code [post]
func verifyEmailCode(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthEmailCodeRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Email) == "" || strings.TrimSpace(body.Code) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Email and verification code are required")
		}
		if len(body.Code) != 6 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid verification code format")
		}
		emailHash := hashEmail(a, body.Email)
		pending, err := consumeEmailVerification(c.UserContext(), a, emailHash, body.Code)
		if err != nil {
			_ = deleteExpiredEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid or expired verification code")
		}
		existing, _ := findUserByEmailHash(c.UserContext(), a, emailHash)
		user := existing
		if user == nil {
			user = &authUser{UserID: generateUserID(), Provider: authProviderEmail}
		}
		user.EmailHash = &emailHash
		user.Username = &pending.Username
		user.PasswordHash = &pending.PasswordHash
		if err := upsertAuthUser(c.UserContext(), a, user); err != nil {
			pending.VerificationCode = body.Code
			_ = insertEmailVerification(c.UserContext(), a, pending)
			return err
		}
		response, err := buildAuthResponse(a, emailAuthUserInfo(user), pending.DeviceID)
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, user.UserID, response.RefreshToken); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// currentUser returns the authenticated user's profile.
//
// @Summary Get current user information
// @Description Returns the authenticated user's current profile information.
// @Tags App Authentication
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} modelsv2.CurrentUserInfo
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/me [get]
// @Router /v2/auth/me [get]
func currentUser(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil || user == nil {
			return apptypes.Error(fiber.StatusUnauthorized, "User session is no longer valid")
		}
		if user.Provider == authProviderEmail {
			return respondCurrentUser(c, a, emailAuthUserInfo(user))
		}
		if user.Provider != authProviderDiscord {
			return apptypes.Error(fiber.StatusUnauthorized, "User identity is not configured")
		}
		if a.Discord == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Discord is not configured")
		}
		info, err := loadDiscordAuthUserInfo(
			c.UserContext(),
			user,
			apptypes.DeviceID(c.UserContext()),
			func(_ context.Context, userID, deviceID string) (string, error) {
				return getDiscordAccessTokenForDevice(c, a, userID, deviceID)
			},
			a.Discord,
		)
		if err != nil {
			return err
		}
		return respondCurrentUser(c, a, info)
	}
}

func respondCurrentUser(c *fiber.Ctx, a apptypes.Deps, info modelsv2.AuthUserInfo) error {
	accountSummary, err := loadUserAccountSummary(c.UserContext(), a.Store.SQL, info.UserID)
	if err != nil {
		return err
	}
	return apptypes.JSON(c, fiber.StatusOK, modelsv2.CurrentUserInfo{
		UserID:         info.UserID,
		Username:       info.Username,
		AvatarURL:      info.AvatarURL,
		AuthMethods:    info.AuthMethods,
		AccountSummary: accountSummary,
	})
}

type userAccountSummaryQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func loadUserAccountSummary(ctx context.Context, db userAccountSummaryQuerier, userID string) (modelsv2.UserAccountSummary, error) {
	var summary modelsv2.UserAccountSummary
	err := db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT bookmarks.user_id)
		FROM player_links AS links
		JOIN user_bookmarks AS bookmarks
			ON bookmarks.tag = links.tag
			AND bookmarks.entity_type = 'player'
		WHERE links.user_id = $1
			AND links.is_verified = true
	`, userID).Scan(&summary.FollowerCount)
	return summary, err
}

// discordAuth starts Discord login flow handling.
//
// @Summary Authenticate with Discord
// @Description Exchanges Discord OAuth credentials for a ClashKing session.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthDiscordOAuthRequest true "Discord OAuth payload"
// @Success 200 {object} modelsv2.AuthResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/discord [post]
// @Router /v2/auth/discord [post]
func discordAuth(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthDiscordOAuthRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Code) == "" || strings.TrimSpace(body.CodeVerifier) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Missing Discord code")
		}
		redirectURI := strings.TrimSpace(body.RedirectURI)
		if redirectURI == "" {
			redirectURI = a.Config.DiscordRedirectURI
		}

		token, err := a.Discord.ExchangeCode(c.UserContext(), body.Code, body.CodeVerifier, redirectURI)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, err.Error())
		}
		if token.RefreshToken == "" {
			return apptypes.Error(fiber.StatusInternalServerError, "Discord did not provide a refresh token")
		}

		discordUser, err := a.Discord.GetCurrentUser(c.UserContext(), token.AccessToken)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, "Failed to fetch Discord user")
		}

		userID, err := upsertDiscordUser(c.UserContext(), a, discordUser)
		if err != nil {
			return err
		}
		if err := storeDiscordTokens(c.UserContext(), a, userID, body.DeviceID, token); err != nil {
			return err
		}

		response, err := buildAuthResponse(a, discordAuthUserInfo(userID, discordUser), body.DeviceID)
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, userID, response.RefreshToken); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// refreshToken exchanges a refresh token for a new access token.
//
// @Summary Refresh the access token
// @Description Validates a refresh token and returns a new access token for the same user.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthRefreshTokenRequest true "Refresh token payload"
// @Success 200 {object} modelsv2.AuthRefreshTokenResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/refresh [post]
// @Router /v2/auth/refresh [post]
func refreshToken(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthRefreshTokenRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		claims, err := parseRefreshToken(a, body.RefreshToken)
		if err != nil {
			return err
		}
		stored, err := findRefreshToken(c.UserContext(), a, body.RefreshToken)
		if err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token.")
		}
		if time.Now().UTC().After(stored.ExpiresAt) {
			return apptypes.Error(fiber.StatusUnauthorized, "Expired refresh token. Please login again.")
		}
		if stored.UserID != claims.Sub {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token.")
		}
		deviceID := strings.TrimSpace(body.DeviceID)
		if deviceID == "" {
			deviceID = claims.Device
		}
		accessToken, err := apptypes.GenerateAccessToken(a.Config, claims.Sub, deviceID)
		if err != nil {
			return err
		}
		newRefreshToken, err := apptypes.GenerateRefreshToken(a.Config, claims.Sub, deviceID)
		if err != nil {
			return err
		}
		if err := rotateRefreshToken(c.UserContext(), a, body.RefreshToken, newRefreshToken, claims.Sub, deviceID); err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token.")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthRefreshTokenResponse{
			AccessToken:  accessToken,
			RefreshToken: newRefreshToken,
		})
	}
}

// register creates a new email-backed account and sends a verification code.
//
// @Summary Register with email
// @Description Creates a pending email registration and issues a verification code.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailRegisterRequest true "Registration payload"
// @Success 200 {object} modelsv2.AuthVerificationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/register [post]
// @Router /v2/auth/register [post]
func register(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthEmailRegisterRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRegistration(body.Email, body.Password, body.Username); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		existing, _ := findUserByEmailHash(c.UserContext(), a, emailHash)
		if existing != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Email already registered. Please try logging in instead.")
		}
		pending, _ := findEmailVerification(c.UserContext(), a, emailHash, "")
		if pending != nil {
			if expiresAt := pending.ExpiresAt; !expiresAt.IsZero() && time.Now().UTC().Before(expiresAt) {
				return apptypes.Error(fiber.StatusConflict, "A verification email was already sent to this address. Please check your email or request a resend.")
			}
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
		}
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		code, err := generateVerificationCode()
		if err != nil {
			return err
		}
		record := &emailVerification{
			EmailHash:        emailHash,
			VerificationCode: code,
			Username:         body.Username,
			PasswordHash:     string(passwordHash),
			DeviceID:         body.DeviceID,
			CreatedAt:        time.Now().UTC(),
			ExpiresAt:        time.Now().UTC().Add(15 * time.Minute),
		}
		if err := insertEmailVerification(c.UserContext(), a, record); err != nil {
			return err
		}
		locale := requestedAuthLocale(c, body.Locale, "")
		if err := sendVerificationEmail(c.UserContext(), a, body.Email, body.Username, code, locale); err != nil {
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusServiceUnavailable, "Verification email could not be sent. Please try again.")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthVerificationResponse{
			Message:          "Verification email sent. Please check your email and enter the 6-digit code.",
			VerificationCode: localCodePtr(a, code),
		})
	}
}

// resendVerification resends a pending email verification code.
//
// @Summary Resend verification email
// @Description Resends the verification code for a pending email registration.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthForgotPasswordRequest true "Email payload"
// @Success 200 {object} modelsv2.AuthVerificationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 410 {object} modelsv2.ErrorResponse
// @Router /v2/resend-verification [post]
// @Router /v2/auth/resend-verification [post]
func resendVerification(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthForgotPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateEmail(body.Email); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		pending, err := findEmailVerification(c.UserContext(), a, emailHash, "")
		if err != nil {
			existing, _ := findUserByEmailHash(c.UserContext(), a, emailHash)
			if existing != nil {
				return apptypes.Error(fiber.StatusBadRequest, "This email is already verified. Please try logging in instead.")
			}
			return apptypes.Error(fiber.StatusNotFound, "No pending verification found for this email. Please register first.")
		}
		if expiresAt := pending.ExpiresAt; !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusGone, "Verification expired. Please register again.")
		}
		code, err := generateVerificationCode()
		if err != nil {
			return err
		}
		pending.VerificationCode = code
		pending.CreatedAt = time.Now().UTC()
		pending.ExpiresAt = time.Now().UTC().Add(15 * time.Minute)
		if err := insertEmailVerification(c.UserContext(), a, pending); err != nil {
			return err
		}
		locale := requestedAuthLocale(c, body.Locale, "")
		if err := sendVerificationEmail(c.UserContext(), a, body.Email, pending.Username, code, locale); err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Verification email could not be sent. Please try again.")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthVerificationResponse{
			Message:          "Verification email resent successfully. Please check your email.",
			VerificationCode: localCodePtr(a, code),
		})
	}
}

// emailLogin authenticates an email/password account and returns tokens.
//
// @Summary Authenticate with email
// @Description Validates email/password credentials and returns access and refresh tokens.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailAuthRequest true "Login payload"
// @Success 200 {object} modelsv2.AuthResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 409 {object} modelsv2.ErrorResponse
// @Router /v2/email [post]
// @Router /v2/auth/email [post]
func emailLogin(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthEmailAuthRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		user, err := findUserByEmailHash(c.UserContext(), a, emailHash)
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
		response, err := buildAuthResponse(a, emailAuthUserInfo(user), body.DeviceID)
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, user.UserID, response.RefreshToken); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// forgotPassword requests a password reset code for an email account.
//
// @Summary Request password reset
// @Description Issues a password reset code for the matching email account.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthForgotPasswordRequest true "Forgot password payload"
// @Success 200 {object} modelsv2.AuthForgotPasswordResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/forgot-password [post]
// @Router /v2/auth/forgot-password [post]
func forgotPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthForgotPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateEmail(body.Email); err != nil {
			return err
		}
		response := modelsv2.AuthForgotPasswordResponse{Message: "If an account exists for this email, a password reset code has been sent."}
		emailHash := hashEmail(a, body.Email)
		user, err := findUserByEmailHash(c.UserContext(), a, emailHash)
		if err != nil {
			return apptypes.JSON(c, fiber.StatusOK, response)
		}
		code, err := generateVerificationCode()
		if err != nil {
			return err
		}
		err = insertPasswordReset(
			c.UserContext(),
			a,
			user.UserID,
			emailHash,
			code,
			time.Now().UTC().Add(time.Hour),
		)
		if err != nil {
			apptypes.Logger().Error("password_reset_record_failed", "error", err, "email_hash", emailHash)
			return apptypes.JSON(c, fiber.StatusOK, response)
		}
		storedLocale := storedAuthLocale(c.UserContext(), a, user.UserID)
		locale := requestedAuthLocale(c, body.Locale, storedLocale)
		if err := sendPasswordResetEmail(c.UserContext(), a, body.Email, authUserName(user), code, locale); err != nil {
			_ = deletePasswordReset(c.UserContext(), a, emailHash, code)
			apptypes.Logger().Error("password_reset_email_failed", "error", err, "email_hash", emailHash)
			return apptypes.JSON(c, fiber.StatusOK, response)
		}
		response.ResetCode = localCodePtr(a, code)
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// resetPassword completes a password reset and returns fresh session tokens.
//
// @Summary Reset password with token
// @Description Validates a password reset token and updates the account password.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthResetPasswordRequest true "Reset password payload"
// @Success 200 {object} modelsv2.AuthResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/reset-password [post]
// @Router /v2/auth/reset-password [post]
func resetPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthResetPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateEmail(body.Email); err != nil {
			return err
		}
		if len(body.ResetCode) != 6 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid password reset code format")
		}
		if err := validatePassword(body.NewPassword); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		userID, err := resetPasswordAndRevokeSessions(c.UserContext(), a, emailHash, body.ResetCode, string(passwordHash))
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
		response, err := buildAuthResponse(a, emailAuthUserInfo(user), body.DeviceID)
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, userID, response.RefreshToken); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

func validateRegistration(email, password, username string) error {
	if err := validateEmail(email); err != nil {
		return err
	}
	if len(username) < 3 || len(username) > 30 {
		return apptypes.Error(fiber.StatusBadRequest, "Username must be at least 3 characters long")
	}
	return validatePassword(password)
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return apptypes.Error(fiber.StatusBadRequest, "Password must be at least 8 characters long")
	}
	if !strings.ContainsAny(password, "0123456789") {
		return apptypes.Error(fiber.StatusBadRequest, "Password must contain at least one digit")
	}
	return nil
}

func validateEmail(email string) error {
	if strings.TrimSpace(email) == "" {
		return apptypes.Error(fiber.StatusBadRequest, "Email is required")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return apptypes.Error(fiber.StatusBadRequest, "Invalid email format")
	}
	return nil
}

func hashEmail(a apptypes.Deps, email string) string {
	normalized := strings.ToLower(strings.TrimSpace(email))
	sum := sha256.Sum256([]byte(normalized + a.Config.SecretKey))
	return hex.EncodeToString(sum[:])
}

func generateVerificationCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()+100000), nil
}

func generateUserID() string {
	return uuid.NewString()
}

func authCodeHash(a apptypes.Deps, emailHash, code string) string {
	hash := hmac.New(sha256.New, []byte(a.Config.SecretKey))
	_, _ = hash.Write([]byte(emailHash))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(hash.Sum(nil))
}

func localCodePtr(a apptypes.Deps, code string) *string {
	if a.Config.Local {
		return &code
	}
	return nil
}

func sendVerificationEmail(ctx context.Context, a apptypes.Deps, email, username, code, locale string) error {
	if a.Mailer == nil {
		if a.Config.Local {
			return nil
		}
		return fmt.Errorf("mailer is not configured")
	}
	return a.Mailer.SendVerification(ctx, strings.TrimSpace(email), username, code, locale)
}

func sendPasswordResetEmail(ctx context.Context, a apptypes.Deps, email, username, code, locale string) error {
	if a.Mailer == nil {
		if a.Config.Local {
			return nil
		}
		return fmt.Errorf("mailer is not configured")
	}
	return a.Mailer.SendPasswordReset(ctx, strings.TrimSpace(email), username, code, locale)
}

func requestedAuthLocale(c *fiber.Ctx, explicit, stored string) string {
	for _, candidate := range []string{explicit, c.Query("locale"), c.Get("X-Locale"), stored, c.Get("Accept-Language")} {
		candidate = strings.TrimSpace(strings.Split(strings.Split(candidate, ",")[0], ";")[0])
		if candidate != "" {
			return candidate
		}
	}
	return "en"
}

func storedAuthLocale(ctx context.Context, a apptypes.Deps, userID string) string {
	if a.Store.SQL == nil || strings.TrimSpace(userID) == "" {
		return ""
	}
	var locale string
	err := a.Store.SQL.QueryRow(ctx, `
		SELECT locale
		FROM mobile_push_devices
		WHERE user_id = $1 AND locale IS NOT NULL AND locale <> ''
		ORDER BY last_seen_at DESC
		LIMIT 1
	`, userID).Scan(&locale)
	if err != nil {
		return ""
	}
	return locale
}

func buildAuthResponse(a apptypes.Deps, user modelsv2.AuthUserInfo, deviceID string) (modelsv2.AuthResponse, error) {
	accessToken, err := apptypes.GenerateAccessToken(a.Config, user.UserID, deviceID)
	if err != nil {
		return modelsv2.AuthResponse{}, err
	}
	refreshToken, err := apptypes.GenerateRefreshToken(a.Config, user.UserID, deviceID)
	if err != nil {
		return modelsv2.AuthResponse{}, err
	}
	return modelsv2.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, nil
}

func storeRefreshToken(ctx context.Context, a apptypes.Deps, userID, refreshToken string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	claims, err := parseStoredRefreshToken(a, refreshToken)
	if err != nil {
		return err
	}
	expiresAt, err := claims.GetExpirationTime()
	if err != nil || expiresAt == nil {
		return fmt.Errorf("refresh token expiration is missing")
	}
	return persistRefreshToken(
		ctx,
		a.Store.SQL,
		tokenHash(refreshToken),
		userID,
		claims.Device,
		expiresAt.Time,
	)
}

type refreshTokenExecutor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func persistRefreshToken(
	ctx context.Context,
	store refreshTokenExecutor,
	refreshTokenHash, userID, deviceID string,
	expiresAt time.Time,
) error {
	_, err := store.Exec(ctx, `
		INSERT INTO auth_refresh_tokens (token_hash, user_id, device_id, expires_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (token_hash) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			device_id = EXCLUDED.device_id,
			expires_at = EXCLUDED.expires_at
	`, refreshTokenHash, userID, deviceID, expiresAt)
	return err
}

type refreshTokenTransactionStore interface {
	Begin(context.Context) (pgx.Tx, error)
}

func rotateRefreshToken(ctx context.Context, a apptypes.Deps, oldToken, newToken, userID, deviceID string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	claims, err := parseStoredRefreshToken(a, newToken)
	if err != nil {
		return err
	}
	expiresAt, err := claims.GetExpirationTime()
	if err != nil || expiresAt == nil {
		return fmt.Errorf("refresh token expiration is missing")
	}
	return rotateRefreshTokenInStore(ctx, a.Store.SQL, oldToken, newToken, userID, deviceID, expiresAt.Time)
}

func rotateRefreshTokenInStore(
	ctx context.Context,
	store refreshTokenTransactionStore,
	oldToken, newToken, userID, deviceID string,
	expiresAt time.Time,
) error {
	tx, err := store.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	cmd, err := tx.Exec(ctx, `
		DELETE FROM auth_refresh_tokens
		WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()
	`, tokenHash(oldToken), userID)
	if err != nil || cmd.RowsAffected() != 1 {
		if err != nil {
			return err
		}
		return errRefreshTokenConsumed
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO auth_refresh_tokens (token_hash, user_id, device_id, expires_at)
		VALUES ($1, $2, $3, $4)
	`, tokenHash(newToken), userID, deviceID, expiresAt)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type authUser struct {
	UserID       string
	Provider     string
	EmailHash    *string
	Username     *string
	PasswordHash *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

const (
	authProviderDiscord = "discord"
	authProviderEmail   = "email"
)

func (u *authUser) AuthMethods() []string {
	if u == nil {
		return nil
	}
	if u.Provider == authProviderDiscord || u.Provider == authProviderEmail {
		return []string{u.Provider}
	}
	return nil
}

func findUserByID(ctx context.Context, a apptypes.Deps, userID string) (*authUser, error) {
	return scanAuthUser(ctx, a, `WHERE user_id = $1`, userID)
}

func authUserName(user *authUser) string {
	if user != nil && user.Username != nil && strings.TrimSpace(*user.Username) != "" {
		return *user.Username
	}
	return "User"
}

func emailAuthUserInfo(user *authUser) modelsv2.AuthUserInfo {
	if user == nil {
		return modelsv2.AuthUserInfo{
			Username:    "User",
			AvatarURL:   defaultAvatarURL,
			AuthMethods: []string{"email"},
		}
	}
	return modelsv2.AuthUserInfo{
		UserID:      user.UserID,
		Username:    authUserName(user),
		AvatarURL:   defaultAvatarURL,
		AuthMethods: user.AuthMethods(),
	}
}

func discordAuthUserInfo(userID string, user *discord.OAuth2User) modelsv2.AuthUserInfo {
	return modelsv2.AuthUserInfo{
		UserID:      userID,
		Username:    user.EffectiveName(),
		AvatarURL:   user.EffectiveAvatarURL(),
		AuthMethods: []string{"discord"},
	}
}

type discordProfileProvider interface {
	GetCurrentUser(context.Context, string) (*discord.OAuth2User, error)
}

type discordAccessTokenLoader func(context.Context, string, string) (string, error)

func loadDiscordAuthUserInfo(
	ctx context.Context,
	user *authUser,
	deviceID string,
	loadAccessToken discordAccessTokenLoader,
	provider discordProfileProvider,
) (modelsv2.AuthUserInfo, error) {
	if user == nil || user.Provider != authProviderDiscord {
		return modelsv2.AuthUserInfo{}, apptypes.Error(fiber.StatusUnauthorized, "Discord identity is not configured")
	}
	if strings.TrimSpace(deviceID) == "" {
		return modelsv2.AuthUserInfo{}, apptypes.Error(fiber.StatusUnauthorized, "Missing device identity")
	}
	accessToken, err := loadAccessToken(ctx, user.UserID, deviceID)
	if err != nil {
		return modelsv2.AuthUserInfo{}, err
	}
	profile, err := provider.GetCurrentUser(ctx, accessToken)
	if err != nil {
		return modelsv2.AuthUserInfo{}, apptypes.Error(fiber.StatusBadGateway, "Failed to fetch Discord user")
	}
	if profile.ID.String() != user.UserID {
		return modelsv2.AuthUserInfo{}, apptypes.Error(fiber.StatusUnauthorized, "Discord session does not match the authenticated user")
	}
	return discordAuthUserInfo(user.UserID, profile), nil
}

func parseRefreshToken(a apptypes.Deps, token string) (*apptypes.Claims, error) {
	return parseRefreshTokenForAudience(a, token, nativeRefreshAudience(a.Config))
}

func parseWebRefreshToken(a apptypes.Deps, token string) (*apptypes.Claims, error) {
	return parseRefreshTokenForAudience(a, token, webRefreshAudience(a.Config))
}

func parseStoredRefreshToken(a apptypes.Deps, token string) (*apptypes.Claims, error) {
	claims, err := parseSignedRefreshToken(a, token)
	if err != nil {
		return nil, err
	}
	if !hasAudience(claims, nativeRefreshAudience(a.Config)) && !hasAudience(claims, webRefreshAudience(a.Config)) {
		return nil, apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token audience.")
	}
	return claims, nil
}

func parseRefreshTokenForAudience(a apptypes.Deps, token, audience string) (*apptypes.Claims, error) {
	claims, err := parseSignedRefreshToken(a, token)
	if err != nil {
		return nil, err
	}
	if !hasAudience(claims, audience) {
		return nil, apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token audience.")
	}
	return claims, nil
}

func parseSignedRefreshToken(a apptypes.Deps, token string) (*apptypes.Claims, error) {
	claims := &apptypes.Claims{}
	_, err := jwt.ParseWithClaims(
		token,
		claims,
		func(_ *jwt.Token) (any, error) {
			return []byte(a.Config.RefreshSecret), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)
	if err != nil {
		return nil, apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token signature.")
	}
	return claims, nil
}

func nativeRefreshAudience(cfg apptypes.Config) string {
	if value := strings.TrimSpace(cfg.NativeTokenAudience); value != "" {
		return value
	}
	return "clashking-native"
}

func webRefreshAudience(cfg apptypes.Config) string {
	if value := strings.TrimSpace(cfg.WebTokenAudience); value != "" {
		return value
	}
	return "clashking-web"
}

func hasAudience(claims *apptypes.Claims, audience string) bool {
	for _, value := range claims.Audience {
		if value == audience {
			return true
		}
	}
	return false
}

func revokeRefreshToken(ctx context.Context, a apptypes.Deps, token string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	_, err := a.Store.SQL.Exec(ctx, `DELETE FROM auth_refresh_tokens WHERE token_hash = $1`, tokenHash(token))
	return err
}

func upsertDiscordUser(ctx context.Context, a apptypes.Deps, discordUser *discord.OAuth2User) (string, error) {
	discordUserID := discordUser.ID.String()
	existingUser, _ := findUserByDiscordID(ctx, a, discordUserID)
	if existingUser != nil {
		return existingUser.UserID, nil
	}

	user := newDiscordAuthUser(discordUserID)
	if err := upsertAuthUser(ctx, a, user); err != nil {
		return "", err
	}
	return user.UserID, nil
}

func newDiscordAuthUser(discordUserID string) *authUser {
	return &authUser{UserID: discordUserID, Provider: authProviderDiscord}
}

func storeDiscordTokens(ctx context.Context, a apptypes.Deps, userID, deviceID string, token *discord.AccessTokenResponse) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	accessTokenCiphertext := apptypes.EncryptToString(token.AccessToken)
	refreshTokenCiphertext := apptypes.EncryptToString(token.RefreshToken)
	expiresAt := time.Now().UTC().Add(token.ExpiresIn)
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_discord_tokens (
			user_id, device_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT (user_id, device_id) DO UPDATE SET
			access_token_ciphertext = EXCLUDED.access_token_ciphertext,
			refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
			expires_at = EXCLUDED.expires_at,
			updated_at = now()
	`, userID, deviceID, accessTokenCiphertext, refreshTokenCiphertext, expiresAt)
	return err
}

func findUserByEmailHash(ctx context.Context, a apptypes.Deps, emailHash string) (*authUser, error) {
	return scanAuthUser(ctx, a, `WHERE email_hash = $1`, emailHash)
}

func findUserByDiscordID(ctx context.Context, a apptypes.Deps, discordUserID string) (*authUser, error) {
	return scanAuthUser(ctx, a, `WHERE user_id = $1 AND provider = 'discord'`, discordUserID)
}

func scanAuthUser(ctx context.Context, a apptypes.Deps, where string, args ...any) (*authUser, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT ` + authUserSelectColumns + `
		FROM auth_users ` + where + ` LIMIT 1`
	user := &authUser{}
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(
		&user.UserID,
		&user.Provider,
		&user.EmailHash,
		&user.Username,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return user, nil
}

const authUserSelectColumns = "user_id, provider, email_hash, username, password_hash, created_at, updated_at"

func upsertAuthUser(ctx context.Context, a apptypes.Deps, user *authUser) error {
	if err := validateAuthIdentity(user); err != nil {
		return err
	}
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	if user.UserID == "" {
		user.UserID = generateUserID()
	}
	return persistAuthUser(ctx, a.Store.SQL, user)
}

type authUserExecutor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func persistAuthUser(ctx context.Context, store authUserExecutor, user *authUser) error {
	_, err := store.Exec(ctx, `
		INSERT INTO auth_users (
			user_id, provider, email_hash, username, password_hash, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT (user_id) DO UPDATE SET
			provider = EXCLUDED.provider,
			email_hash = EXCLUDED.email_hash,
			username = EXCLUDED.username,
			password_hash = EXCLUDED.password_hash,
			updated_at = now()
	`, user.UserID, user.Provider, user.EmailHash, user.Username, user.PasswordHash)
	return err
}

func validateAuthIdentity(user *authUser) error {
	if user == nil {
		return fmt.Errorf("auth user is required")
	}
	switch user.Provider {
	case authProviderEmail:
		if user.EmailHash == nil || user.Username == nil || user.PasswordHash == nil {
			return fmt.Errorf("email auth user requires email, username, and password")
		}
	case authProviderDiscord:
		if user.EmailHash != nil || user.Username != nil || user.PasswordHash != nil {
			return fmt.Errorf("Discord auth user cannot persist email, username, or password")
		}
	default:
		return fmt.Errorf("unsupported auth provider %q", user.Provider)
	}
	return nil
}

type emailVerification struct {
	EmailHash        string
	VerificationCode string
	Username         string
	PasswordHash     string
	DeviceID         string
	ExpiresAt        time.Time
	CreatedAt        time.Time
}

func findEmailVerification(ctx context.Context, a apptypes.Deps, emailHash string, code string) (*emailVerification, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT email_hash, username, password_hash, device_id, expires_at, created_at
		FROM auth_email_verifications
		WHERE email_hash = $1`
	args := []any{emailHash}
	if strings.TrimSpace(code) != "" {
		query += ` AND verification_code_hash = $2`
		args = append(args, authCodeHash(a, emailHash, code))
	}
	query += ` LIMIT 1`
	record := &emailVerification{}
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(
		&record.EmailHash,
		&record.Username,
		&record.PasswordHash,
		&record.DeviceID,
		&record.ExpiresAt,
		&record.CreatedAt,
	); err != nil {
		return nil, err
	}
	return record, nil
}

func insertEmailVerification(ctx context.Context, a apptypes.Deps, record *emailVerification) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	codeHash := authCodeHash(a, record.EmailHash, record.VerificationCode)
	expiresAt := record.ExpiresAt
	if expiresAt.IsZero() {
		expiresAt = time.Now().UTC().Add(15 * time.Minute)
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_email_verifications (
			email_hash, verification_code_hash, username, password_hash, device_id, expires_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (email_hash) DO UPDATE SET
			verification_code_hash = EXCLUDED.verification_code_hash,
			username = EXCLUDED.username,
			password_hash = EXCLUDED.password_hash,
			device_id = EXCLUDED.device_id,
			expires_at = EXCLUDED.expires_at,
			created_at = now()
	`, record.EmailHash, codeHash, record.Username, record.PasswordHash, record.DeviceID, expiresAt)
	return err
}

func deleteEmailVerification(ctx context.Context, a apptypes.Deps, emailHash string) error {
	if a.Store.SQL == nil {
		return nil
	}
	_, err := a.Store.SQL.Exec(ctx, `DELETE FROM auth_email_verifications WHERE email_hash = $1`, emailHash)
	return err
}

func deleteExpiredEmailVerification(ctx context.Context, a apptypes.Deps, emailHash string) error {
	if a.Store.SQL == nil {
		return nil
	}
	_, err := a.Store.SQL.Exec(ctx, `
		DELETE FROM auth_email_verifications
		WHERE email_hash = $1 AND expires_at <= now()
	`, emailHash)
	return err
}

func consumeEmailVerification(ctx context.Context, a apptypes.Deps, emailHash, code string) (*emailVerification, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	record := &emailVerification{EmailHash: emailHash}
	if err := a.Store.SQL.QueryRow(ctx, `
		DELETE FROM auth_email_verifications
		WHERE email_hash = $1 AND verification_code_hash = $2 AND expires_at > now()
		RETURNING username, password_hash, device_id, expires_at, created_at
	`, emailHash, authCodeHash(a, emailHash, code)).Scan(
		&record.Username,
		&record.PasswordHash,
		&record.DeviceID,
		&record.ExpiresAt,
		&record.CreatedAt,
	); err != nil {
		return nil, err
	}
	return record, nil
}

type refreshTokenRecord struct {
	UserID    string
	DeviceID  string
	ExpiresAt time.Time
}

func findRefreshToken(ctx context.Context, a apptypes.Deps, refreshToken string) (*refreshTokenRecord, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	record := &refreshTokenRecord{}
	if err := a.Store.SQL.QueryRow(ctx, `
		SELECT user_id, device_id, expires_at
		FROM auth_refresh_tokens
		WHERE token_hash = $1
	`, tokenHash(refreshToken)).Scan(&record.UserID, &record.DeviceID, &record.ExpiresAt); err != nil {
		return nil, err
	}
	return record, nil
}

func insertPasswordReset(ctx context.Context, a apptypes.Deps, userID, emailHash, code string, expiresAt time.Time) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_password_reset_tokens (
			email_hash, reset_code_hash, user_id, expires_at, created_at
		) VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (email_hash) DO UPDATE SET
			reset_code_hash = EXCLUDED.reset_code_hash,
			user_id = EXCLUDED.user_id,
			expires_at = EXCLUDED.expires_at,
			created_at = EXCLUDED.created_at
	`, emailHash, authCodeHash(a, emailHash, code), userID, expiresAt)
	return err
}

func deletePasswordReset(ctx context.Context, a apptypes.Deps, emailHash, code string) error {
	if a.Store.SQL == nil {
		return nil
	}
	_, err := a.Store.SQL.Exec(ctx, `
		DELETE FROM auth_password_reset_tokens
		WHERE email_hash = $1 AND reset_code_hash = $2
	`, emailHash, authCodeHash(a, emailHash, code))
	return err
}

func resetPasswordAndRevokeSessions(ctx context.Context, a apptypes.Deps, emailHash, code, passwordHash string) (string, error) {
	if a.Store.SQL == nil {
		return "", apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	tx, err := a.Store.SQL.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var userID string
	if err := tx.QueryRow(ctx, `
		DELETE FROM auth_password_reset_tokens
		WHERE email_hash = $1
		  AND reset_code_hash = $2
		  AND expires_at > now()
		RETURNING user_id
	`, emailHash, authCodeHash(a, emailHash, code)).Scan(&userID); err != nil {
		return "", err
	}
	cmd, err := tx.Exec(ctx, `
		UPDATE auth_users
		SET password_hash = $2,
		    updated_at = now()
		WHERE user_id = $1
	`, userID, passwordHash)
	if err != nil {
		return "", err
	}
	if cmd.RowsAffected() != 1 {
		return "", fmt.Errorf("password reset user not found")
	}
	if _, err := tx.Exec(ctx, deleteUserRefreshTokensQuery, userID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return userID, nil
}

const deleteUserRefreshTokensQuery = `
	DELETE FROM auth_refresh_tokens
	WHERE user_id = $1
`

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func anyToInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return 0
		}
		return int(typed)
	case string:
		out, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0
		}
		return out
	default:
		return 0
	}
}
