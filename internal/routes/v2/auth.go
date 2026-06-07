package v2

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/mail"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const defaultAvatarURL = "https://clashkingfiles.b-cdn.net/stickers/Troop_HV_Goblin.png"

// verifyEmailCode verifies a pending email registration code and returns auth tokens.
//
// @Summary Verify email address with 6-digit code
// @Description Confirms a pending email registration by checking the verification code and creates the account session.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Param body body modelsv2.AuthEmailCodeRequest true "Verification payload"
// @Success 200 {object} modelsv2.AuthResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
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
		pending, err := findEmailVerification(c.UserContext(), a, emailHash, body.Code)
		if err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid verification code")
		}
		expiresAt := asTime(pending["expires_at"])
		if !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusUnauthorized, "Verification code expired. Please request a new one.")
		}
		userData, _ := pending["user_data"].(map[string]any)
		if userData == nil {
			return apptypes.Error(fiber.StatusInternalServerError, "Invalid verification record")
		}
		existing, _ := findUserByEmailHash(c.UserContext(), a, emailHash)
		userID := authStringify(userData["user_id"])
		if userID == "" {
			if existing != nil {
				userID = authStringify(existing["user_id"])
			} else {
				userID = generateUserID()
			}
		}
		update := map[string]any{
			"user_id":         userID,
			"email_encrypted": apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(body.Email))),
			"email_hash":      emailHash,
			"username":        authStringify(userData["username"]),
			"password":        authStringify(userData["password"]),
			"created_at":      time.Now().UTC(),
			"auth_methods":    []string{"email"},
		}
		if existing != nil {
			authMethods := append(toStringSlice(existing["auth_methods"]), "email")
			update["auth_methods"] = uniqueStrings(authMethods)
		}
		if err := upsertAuthUser(c.UserContext(), a, update); err != nil {
			return err
		}
		_ = deleteEmailVerification(c.UserContext(), a, emailHash)
		response, err := buildAuthResponse(a, userID, authStringify(update["username"]), authStringify(userData["device_id"]), defaultAvatarURL)
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, userID, response.RefreshToken); err != nil {
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
// @Success 200 {object} modelsv2.AuthUserInfo
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/me [get]
// @Router /v2/auth/me [get]
func currentUser(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil || user == nil {
			return apptypes.Error(fiber.StatusNotFound, "User not found")
		}
		username := authStringify(user["username"])
		if username == "" {
			if decrypted, err := apptypes.DecryptString(authStringify(user["email_encrypted"])); err == nil {
				username = decrypted
			}
		}
		avatarURL := authStringify(user["avatar_url"])
		if avatarURL == "" {
			avatarURL = defaultAvatarURL
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.AuthUserInfo{
			UserID:    authStringify(user["user_id"]),
			Username:  username,
			AvatarURL: avatarURL,
		})
	}
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
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
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
		if err := storeDiscordTokens(c.UserContext(), a, userID, body.DeviceID, body.DeviceName, token); err != nil {
			return err
		}

		response, err := buildAuthResponse(a, userID, discordUser.EffectiveName(), body.DeviceID, discordUser.EffectiveAvatarURL())
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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
		if expiresAt := asTime(stored["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			return apptypes.Error(fiber.StatusUnauthorized, "Expired refresh token. Please login again.")
		}
		if authStringify(stored["user_id"]) != claims.Sub {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token.")
		}
		accessToken, err := apptypes.GenerateAccessToken(a.Config, claims.Sub, body.DeviceID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"access_token": accessToken})
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 409 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
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
		if existing != nil && slicesContains(toStringSlice(existing["auth_methods"]), "email") {
			return apptypes.Error(fiber.StatusBadRequest, "Email already registered. Please try logging in instead.")
		}
		pending, _ := findEmailVerification(c.UserContext(), a, emailHash, "")
		if pending != nil {
			if expiresAt := asTime(pending["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().Before(expiresAt) {
				return apptypes.Error(fiber.StatusConflict, "A verification email was already sent to this address. Please check your email or request a resend.")
			}
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
		}
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		code := generateVerificationCode()
		record := map[string]any{
			"email_hash":        emailHash,
			"verification_code": code,
			"user_data": map[string]any{
				"email_encrypted": apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(body.Email))),
				"email_hash":      emailHash,
				"username":        body.Username,
				"password":        string(passwordHash),
				"device_id":       body.DeviceID,
			},
			"created_at": time.Now().UTC(),
			"expires_at": time.Now().UTC().Add(15 * time.Minute),
		}
		if err := insertEmailVerification(c.UserContext(), a, record); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"message":           "Verification email sent. Please check your email and enter the 6-digit code.",
			"verification_code": localCode(a, code),
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 410 {object} map[string]interface{}
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
			if existing != nil && slicesContains(toStringSlice(existing["auth_methods"]), "email") {
				return apptypes.Error(fiber.StatusBadRequest, "This email is already verified. Please try logging in instead.")
			}
			return apptypes.Error(fiber.StatusNotFound, "No pending verification found for this email. Please register first.")
		}
		if expiresAt := asTime(pending["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusGone, "Verification expired. Please register again.")
		}
		code := generateVerificationCode()
		pending["verification_code"] = code
		pending["created_at"] = time.Now().UTC()
		pending["expires_at"] = time.Now().UTC().Add(15 * time.Minute)
		if err := insertEmailVerification(c.UserContext(), a, pending); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"message":           "Verification email resent successfully. Please check your email.",
			"verification_code": localCode(a, code),
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
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 409 {object} map[string]interface{}
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
		passwordHash := authStringify(user["password"])
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.Password)); err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid email or password")
		}
		if !slicesContains(toStringSlice(user["auth_methods"]), "email") {
			return apptypes.Error(fiber.StatusConflict, "Email has not been verified for this account.")
		}
		response, err := buildAuthResponse(a, authStringify(user["user_id"]), fallbackUserName(user), body.DeviceID, fallbackAvatar(user))
		if err != nil {
			return err
		}
		if err := storeRefreshToken(c.UserContext(), a, authStringify(user["user_id"]), response.RefreshToken); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

type linkDiscordPayload struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
	DeviceID     string
	DeviceName   string
}

// linkDiscord links a Discord account to an existing authenticated account.
//
// @Summary Link Discord to an existing account
// @Description Attaches a Discord account and stores its OAuth tokens for the current authenticated user.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/link-discord [post]
// @Router /v2/auth/link-discord [post]
func linkDiscord(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		if strings.TrimSpace(userID) == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Missing or invalid authentication token")
		}

		currentUser, err := findUserByID(c.UserContext(), a, userID)
		if err != nil || currentUser == nil {
			return apptypes.Error(fiber.StatusNotFound, "User not found")
		}

		payload, err := decodeLinkDiscordPayload(c)
		if err != nil {
			return err
		}
		if strings.TrimSpace(payload.AccessToken) == "" {
			return apptypes.Error(fiber.StatusBadRequest, "Missing access_token")
		}

		discordUser, err := a.Discord.GetCurrentUser(c.UserContext(), payload.AccessToken)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid Discord access token")
		}

		conflictFilter := discordAccountConflictFilter(discordUser.ID.String())
		if len(conflictFilter) > 0 {
			conflictUser, _ := findUserByDiscordID(c.UserContext(), a, discordUser.ID.String())
			if conflictUser != nil && authStringify(conflictUser["user_id"]) != userID {
				return apptypes.Error(fiber.StatusBadRequest, "Discord account already linked to another user")
			}
		}

		linkedDiscord := map[string]any{
			"linked_at":       time.Now().UTC(),
			"discord_user_id": discordUser.ID.String(),
			"username":        discordUser.Username,
			"email":           discordUser.Email,
		}
		update := map[string]any{
			"auth_methods":            uniqueStrings(append(toStringSlice(currentUser["auth_methods"]), "discord")),
			"linked_accounts.discord": linkedDiscord,
		}
		for key, value := range update {
			currentUser[key] = value
		}
		if err := upsertAuthUser(c.UserContext(), a, currentUser); err != nil {
			return err
		}

		if err := upsertLinkedDiscordTokens(c.UserContext(), a, userID, payload); err != nil {
			return err
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"detail": "Discord account successfully linked"})
	}
}

// linkEmail links an email credential to an authenticated account.
//
// @Summary Link Email to an existing Discord account
// @Description Attaches email credentials to the authenticated account.
// @Tags App Authentication
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.AuthEmailRegisterRequest true "Link email payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/link-email [post]
// @Router /v2/auth/link-email [post]
func linkEmail(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		var body modelsv2.AuthEmailRegisterRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRegistration(body.Email, body.Password, body.Username); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil || user == nil {
			return apptypes.Error(fiber.StatusNotFound, "User not found")
		}
		for key, value := range map[string]any{
			"email_encrypted": apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(body.Email))),
			"email_hash":      emailHash,
			"username":        body.Username,
			"password":        string(passwordHash),
			"auth_methods":    []string{"discord", "email"},
		} {
			user[key] = value
		}
		if err := upsertAuthUser(c.UserContext(), a, user); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"message": "Email linked successfully"})
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/forgot-password [post]
// @Router /v2/auth/forgot-password [post]
func forgotPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthForgotPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		user, err := findUserByEmailHash(c.UserContext(), a, emailHash)
		if err != nil {
			return apptypes.Error(fiber.StatusNotFound, "No account found with this email address.")
		}
		code := generateVerificationCode()
		err = insertPasswordReset(c.UserContext(), a, map[string]any{
			"user_id":    authStringify(user["user_id"]),
			"email_hash": emailHash,
			"reset_code": code,
			"expires_at": time.Now().UTC().Add(time.Hour),
			"created_at": time.Now().UTC(),
			"used":       false,
		})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"message":    "If an account exists for this email, a password reset link has been sent.",
			"reset_code": localCode(a, code),
		})
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
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/reset-password [post]
// @Router /v2/auth/reset-password [post]
func resetPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.AuthResetPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		record, err := findPasswordReset(c.UserContext(), a, emailHash, body.ResetCode)
		if err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid password reset code.")
		}
		if expiresAt := asTime(record["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			return apptypes.Error(fiber.StatusUnauthorized, "Password reset code expired. Please request a new one.")
		}
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		userID := authStringify(record["user_id"])
		user, _ := findUserByID(c.UserContext(), a, userID)
		if user == nil {
			return apptypes.Error(fiber.StatusNotFound, "User not found")
		}
		user["password"] = string(passwordHash)
		if err := upsertAuthUser(c.UserContext(), a, user); err != nil {
			return err
		}
		if err := markPasswordResetUsed(c.UserContext(), a, emailHash, body.ResetCode); err != nil {
			return err
		}
		response, err := buildAuthResponse(a, userID, fallbackUserName(user), body.DeviceID, fallbackAvatar(user))
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

func generateVerificationCode() string {
	now := time.Now().UTC().UnixNano()
	return fmt.Sprintf("%06d", (now%900000)+100000)
}

func generateUserID() string {
	return time.Now().UTC().Format("20060102150405.000000")
}

func localCode(a apptypes.Deps, code string) any {
	if a.Config.Local {
		return code
	}
	return nil
}

func buildAuthResponse(a apptypes.Deps, userID, username, deviceID, avatarURL string) (modelsv2.AuthResponse, error) {
	accessToken, err := apptypes.GenerateAccessToken(a.Config, userID, deviceID)
	if err != nil {
		return modelsv2.AuthResponse{}, err
	}
	refreshToken, err := apptypes.GenerateRefreshToken(a.Config, userID, deviceID)
	if err != nil {
		return modelsv2.AuthResponse{}, err
	}
	return modelsv2.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User: modelsv2.AuthUserInfo{
			UserID:    userID,
			Username:  username,
			AvatarURL: avatarURL,
		},
	}, nil
}

func storeRefreshToken(ctx context.Context, a apptypes.Deps, userID, refreshToken string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_refresh_tokens (token_hash, user_id, expires_at, data, created_at)
		VALUES ($1, $2, $3, $4::jsonb, now())
		ON CONFLICT (token_hash) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			expires_at = EXCLUDED.expires_at,
			revoked_at = NULL,
			data = EXCLUDED.data
	`, tokenHash(refreshToken), userID, time.Now().UTC().Add(30*24*time.Hour), apptypes.Marshal(map[string]any{"refresh_token": refreshToken}))
	return err
}

func findUserByID(ctx context.Context, a apptypes.Deps, userID string) (map[string]any, error) {
	return scanAuthUser(ctx, a, `WHERE user_id = $1`, userID)
}

func fallbackUserName(user map[string]any) string {
	if user == nil {
		return "User"
	}
	if username := authStringify(user["username"]); username != "" {
		return username
	}
	if email, err := apptypes.DecryptString(authStringify(user["email_encrypted"])); err == nil && email != "" {
		return email
	}
	return "User"
}

func fallbackAvatar(user map[string]any) string {
	if user == nil {
		return defaultAvatarURL
	}
	if avatar := authStringify(user["avatar_url"]); avatar != "" {
		return avatar
	}
	return defaultAvatarURL
}

func authStringify(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	default:
		return ""
	}
}

func asTime(value any) time.Time {
	switch typed := value.(type) {
	case time.Time:
		return typed
	default:
		return time.Time{}
	}
}

func toStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := authStringify(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func slicesContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func parseRefreshToken(a apptypes.Deps, token string) (*apptypes.Claims, error) {
	claims := &apptypes.Claims{}
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return []byte(a.Config.RefreshSecret), nil
	})
	if err != nil {
		return nil, apptypes.Error(fiber.StatusUnauthorized, "Invalid refresh token signature.")
	}
	return claims, nil
}

func upsertDiscordUser(ctx context.Context, a apptypes.Deps, discordUser *discord.OAuth2User) (string, error) {
	existingUser, _ := findUserByID(ctx, a, discordUser.ID.String())
	if existingUser == nil && strings.TrimSpace(discordUser.Email) != "" {
		existingUser, _ = findUserByEmailHash(ctx, a, hashEmail(a, discordUser.Email))
	}

	username := discordUser.EffectiveName()
	if username == "" {
		username = discordUser.Username
	}
	avatarURL := discordUser.EffectiveAvatarURL()

	if existingUser != nil {
		userID := authStringify(existingUser["user_id"])
		if userID == "" {
			userID = discordUser.ID.String()
		}
		authMethods := append(toStringSlice(existingUser["auth_methods"]), "discord")
		update := map[string]any{
			"auth_methods": uniqueStrings(authMethods),
			"username":     username,
			"avatar_url":   avatarURL,
		}
		if strings.TrimSpace(discordUser.Email) != "" {
			update["email_encrypted"] = apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(discordUser.Email)))
			update["email_hash"] = hashEmail(a, discordUser.Email)
		}
		for key, value := range update {
			existingUser[key] = value
		}
		if err := upsertAuthUser(ctx, a, existingUser); err != nil {
			return "", err
		}
		return userID, nil
	}

	userID := discordUser.ID.String()
	insert := map[string]any{
		"user_id":      userID,
		"auth_methods": []string{"discord"},
		"username":     username,
		"avatar_url":   avatarURL,
		"created_at":   time.Now().UTC(),
	}
	if strings.TrimSpace(discordUser.Email) != "" {
		insert["email_encrypted"] = apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(discordUser.Email)))
		insert["email_hash"] = hashEmail(a, discordUser.Email)
	}
	if err := upsertAuthUser(ctx, a, insert); err != nil {
		return "", err
	}
	return userID, nil
}

func storeDiscordTokens(ctx context.Context, a apptypes.Deps, userID, deviceID, deviceName string, token *discord.AccessTokenResponse) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	payload := map[string]any{
		"user_id":               userID,
		"device_id":             deviceID,
		"device_name":           deviceName,
		"discord_access_token":  apptypes.EncryptToString(token.AccessToken),
		"discord_refresh_token": apptypes.EncryptToString(token.RefreshToken),
		"expires_at":            time.Now().UTC().Add(token.ExpiresIn),
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_discord_tokens (
			user_id, device_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, data, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now(), now())
		ON CONFLICT (user_id, device_id) DO UPDATE SET
			access_token_ciphertext = EXCLUDED.access_token_ciphertext,
			refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
			expires_at = EXCLUDED.expires_at,
			data = EXCLUDED.data,
			updated_at = now()
	`, userID, deviceID, payload["discord_access_token"], payload["discord_refresh_token"], payload["expires_at"], apptypes.Marshal(payload))
	return err
}

func decodeLinkDiscordPayload(c *fiber.Ctx) (linkDiscordPayload, error) {
	contentType := strings.ToLower(c.Get("Content-Type"))
	if strings.Contains(contentType, "application/json") {
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return linkDiscordPayload{}, err
		}
		return linkDiscordPayload{
			AccessToken:  strings.TrimSpace(authStringify(body["access_token"])),
			RefreshToken: strings.TrimSpace(authStringify(body["refresh_token"])),
			ExpiresIn:    anyToInt(body["expires_in"]),
			DeviceID:     strings.TrimSpace(authStringify(body["device_id"])),
			DeviceName:   strings.TrimSpace(authStringify(body["device_name"])),
		}, nil
	}

	return linkDiscordPayload{
		AccessToken:  strings.TrimSpace(c.FormValue("access_token")),
		RefreshToken: strings.TrimSpace(c.FormValue("refresh_token")),
		ExpiresIn:    anyToInt(c.FormValue("expires_in")),
		DeviceID:     strings.TrimSpace(c.FormValue("device_id")),
		DeviceName:   strings.TrimSpace(c.FormValue("device_name")),
	}, nil
}

func discordAccountConflictFilter(discordUserID string) map[string]any {
	clauses := []map[string]any{{"linked_accounts.discord.discord_user_id": discordUserID}}
	if parsed, err := strconv.ParseInt(discordUserID, 10, 64); err == nil {
		clauses = append(clauses, map[string]any{"linked_accounts.discord.discord_user_id": parsed})
	}
	return map[string]any{"$or": clauses}
}

func upsertLinkedDiscordTokens(ctx context.Context, a apptypes.Deps, userID string, payload linkDiscordPayload) error {
	if strings.TrimSpace(payload.AccessToken) == "" {
		return nil
	}

	expiresAt := time.Now().UTC().Add(time.Hour)
	if payload.ExpiresIn > 0 {
		expiresAt = time.Now().UTC().Add(time.Duration(payload.ExpiresIn) * time.Second)
	}

	token := &discord.AccessTokenResponse{
		AccessToken: payload.AccessToken,
		ExpiresIn:   time.Until(expiresAt),
	}
	if payload.RefreshToken != "" {
		token.RefreshToken = payload.RefreshToken
	}
	record := map[string]any{
		"user_id":              userID,
		"device_id":            payload.DeviceID,
		"device_name":          payload.DeviceName,
		"discord_access_token": apptypes.EncryptToString(payload.AccessToken),
		"expires_at":           expiresAt,
	}
	if payload.RefreshToken != "" {
		record["discord_refresh_token"] = apptypes.EncryptToString(payload.RefreshToken)
	}
	_ = record
	return storeDiscordTokens(ctx, a, userID, payload.DeviceID, payload.DeviceName, token)
}

func findUserByEmailHash(ctx context.Context, a apptypes.Deps, emailHash string) (map[string]any, error) {
	return scanAuthUser(ctx, a, `WHERE email_hash = $1`, emailHash)
}

func findUserByDiscordID(ctx context.Context, a apptypes.Deps, discordUserID string) (map[string]any, error) {
	return scanAuthUser(ctx, a, `WHERE discord_user_id = $1 OR data #>> '{linked_accounts,discord,discord_user_id}' = $1`, discordUserID)
}

func scanAuthUser(ctx context.Context, a apptypes.Deps, where string, args ...any) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT user_id, email_hash, discord_user_id, username, password_hash, verified, data
		FROM auth_users ` + where + ` LIMIT 1`
	var userID, username string
	var emailHash, discordUserID, passwordHash *string
	var verified bool
	var raw []byte
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(&userID, &emailHash, &discordUserID, &username, &passwordHash, &verified, &raw); err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["user_id"] = userID
	out["username"] = username
	out["verified"] = verified
	if emailHash != nil {
		out["email_hash"] = *emailHash
	}
	if discordUserID != nil {
		out["discord_user_id"] = *discordUserID
	}
	if passwordHash != nil {
		out["password"] = *passwordHash
	}
	return out, nil
}

func upsertAuthUser(ctx context.Context, a apptypes.Deps, user map[string]any) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	expandDotted(user)
	userID := authStringify(user["user_id"])
	if userID == "" {
		userID = generateUserID()
		user["user_id"] = userID
	}
	username := fallbackUserName(user)
	if username == "User" {
		username = authStringify(user["username"])
	}
	emailHash := nullableString(authStringify(user["email_hash"]))
	passwordHash := nullableString(authStringify(user["password"]))
	discordID := nullableString(authStringify(user["discord_user_id"]))
	if discordID == nil {
		if linked, ok := user["linked_accounts"].(map[string]any); ok {
			if discordAccount, ok := linked["discord"].(map[string]any); ok {
				discordID = nullableString(authStringify(discordAccount["discord_user_id"]))
			}
		}
	}
	verified := slicesContains(toStringSlice(user["auth_methods"]), "email") || slicesContains(toStringSlice(user["auth_methods"]), "discord")
	data := apptypes.Marshal(user)
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_users (
			user_id, email_hash, discord_user_id, username, password_hash, verified, data, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())
		ON CONFLICT (user_id) DO UPDATE SET
			email_hash = EXCLUDED.email_hash,
			discord_user_id = EXCLUDED.discord_user_id,
			username = EXCLUDED.username,
			password_hash = EXCLUDED.password_hash,
			verified = EXCLUDED.verified,
			data = EXCLUDED.data,
			updated_at = now()
	`, userID, emailHash, discordID, username, passwordHash, verified, data)
	return err
}

func findEmailVerification(ctx context.Context, a apptypes.Deps, emailHash string, code string) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	query := `
		SELECT email_hash, verification_code_hash, user_id, expires_at, data, created_at
		FROM auth_email_verifications
		WHERE email_hash = $1`
	args := []any{emailHash}
	if strings.TrimSpace(code) != "" {
		query += ` AND verification_code_hash = $2`
		args = append(args, code)
	}
	query += ` LIMIT 1`
	var rowEmail, verificationCode string
	var userID *string
	var expiresAt, createdAt time.Time
	var raw []byte
	if err := a.Store.SQL.QueryRow(ctx, query, args...).Scan(&rowEmail, &verificationCode, &userID, &expiresAt, &raw, &createdAt); err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["email_hash"] = rowEmail
	out["verification_code"] = verificationCode
	out["expires_at"] = expiresAt
	out["created_at"] = createdAt
	if userID != nil {
		out["user_id"] = *userID
	}
	return out, nil
}

func insertEmailVerification(ctx context.Context, a apptypes.Deps, record map[string]any) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	emailHash := authStringify(record["email_hash"])
	code := authStringify(record["verification_code"])
	expiresAt := asTime(record["expires_at"])
	if expiresAt.IsZero() {
		expiresAt = time.Now().UTC().Add(15 * time.Minute)
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_email_verifications (
			email_hash, verification_code_hash, user_id, expires_at, data, created_at
		) VALUES ($1, $2, NULLIF($3, ''), $4, $5::jsonb, now())
		ON CONFLICT (email_hash) DO UPDATE SET
			verification_code_hash = EXCLUDED.verification_code_hash,
			user_id = EXCLUDED.user_id,
			expires_at = EXCLUDED.expires_at,
			data = EXCLUDED.data,
			created_at = now()
	`, emailHash, code, authStringify(record["user_id"]), expiresAt, apptypes.Marshal(record))
	return err
}

func deleteEmailVerification(ctx context.Context, a apptypes.Deps, emailHash string) error {
	if a.Store.SQL == nil {
		return nil
	}
	_, err := a.Store.SQL.Exec(ctx, `DELETE FROM auth_email_verifications WHERE email_hash = $1`, emailHash)
	return err
}

func findRefreshToken(ctx context.Context, a apptypes.Deps, refreshToken string) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var userID string
	var expiresAt time.Time
	var raw []byte
	if err := a.Store.SQL.QueryRow(ctx, `
		SELECT user_id, expires_at, data
		FROM auth_refresh_tokens
		WHERE token_hash = $1 AND revoked_at IS NULL
	`, tokenHash(refreshToken)).Scan(&userID, &expiresAt, &raw); err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["user_id"] = userID
	out["refresh_token"] = refreshToken
	out["expires_at"] = expiresAt
	return out, nil
}

func insertPasswordReset(ctx context.Context, a apptypes.Deps, record map[string]any) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_password_reset_tokens (
			email_hash, reset_code_hash, user_id, used, expires_at, data, created_at
		) VALUES ($1, $2, NULLIF($3, ''), false, $4, $5::jsonb, now())
	`, authStringify(record["email_hash"]), authStringify(record["reset_code"]), authStringify(record["user_id"]), asTime(record["expires_at"]), apptypes.Marshal(record))
	return err
}

func findPasswordReset(ctx context.Context, a apptypes.Deps, emailHash, code string) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var userID string
	var expiresAt time.Time
	var raw []byte
	if err := a.Store.SQL.QueryRow(ctx, `
		SELECT user_id, expires_at, data
		FROM auth_password_reset_tokens
		WHERE email_hash = $1 AND reset_code_hash = $2 AND used = false
		ORDER BY created_at DESC
		LIMIT 1
	`, emailHash, code).Scan(&userID, &expiresAt, &raw); err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["user_id"] = userID
	out["email_hash"] = emailHash
	out["reset_code"] = code
	out["expires_at"] = expiresAt
	return out, nil
}

func markPasswordResetUsed(ctx context.Context, a apptypes.Deps, emailHash, code string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	_, err := a.Store.SQL.Exec(ctx, `
		UPDATE auth_password_reset_tokens
		SET used = true, data = jsonb_set(data, '{used}', 'true'::jsonb, true)
		WHERE email_hash = $1 AND reset_code_hash = $2 AND used = false
	`, emailHash, code)
	return err
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func nullableString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func expandDotted(values map[string]any) {
	for key, value := range values {
		if !strings.Contains(key, ".") {
			continue
		}
		delete(values, key)
		parts := strings.Split(key, ".")
		current := values
		for _, part := range parts[:len(parts)-1] {
			next, _ := current[part].(map[string]any)
			if next == nil {
				next = map[string]any{}
				current[part] = next
			}
			current = next
		}
		current[parts[len(parts)-1]] = value
	}
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
