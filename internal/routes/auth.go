package routes

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
		if existing == nil && userID != "" {
			existing, _ = findUserByID(c.UserContext(), a, userID)
		}
		update := map[string]any{}
		for key, value := range existing {
			update[key] = value
		}
		update["user_id"] = userID
		update["email_encrypted"] = authStringify(userData["email_encrypted"])
		update["email_hash"] = emailHash
		update["username"] = authStringify(userData["username"])
		update["password"] = authStringify(userData["password"])
		update["created_at"] = time.Now().UTC()
		update["auth_methods"] = uniqueStrings(append(toStringSlice(update["auth_methods"]), "email"))
		if err := upsertAuthUser(c.UserContext(), a, update); err != nil {
			pending["verification_code"] = body.Code
			_ = insertEmailVerification(c.UserContext(), a, pending)
			return err
		}
		response, err := buildAuthResponse(a, userID, authStringify(update["username"]), authStringify(userData["device_id"]), defaultAvatarURL)
		if err != nil {
			return err
		}
		enrichAuthUserInfo(&response.User, update)
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
		info := modelsv2.AuthUserInfo{
			UserID:    authStringify(user["user_id"]),
			Username:  username,
			AvatarURL: avatarURL,
		}
		enrichAuthUserInfo(&info, user)
		return apptypes.JSON(c, fiber.StatusOK, info)
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
		if err := storeDiscordTokens(c.UserContext(), a, userID, body.DeviceID, body.DeviceName, token); err != nil {
			return err
		}

		response, err := buildAuthResponse(a, userID, discordUser.EffectiveName(), body.DeviceID, discordUser.EffectiveAvatarURL())
		if err != nil {
			return err
		}
		response.User.AuthMethods = []string{"discord"}
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
		if expiresAt := asTime(stored["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			return apptypes.Error(fiber.StatusUnauthorized, "Expired refresh token. Please login again.")
		}
		if authStringify(stored["user_id"]) != claims.Sub {
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
		code, err := generateVerificationCode()
		if err != nil {
			return err
		}
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
		if err := sendVerificationEmail(c.UserContext(), a, body.Email, body.Username, code); err != nil {
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
			if existing != nil && slicesContains(toStringSlice(existing["auth_methods"]), "email") {
				return apptypes.Error(fiber.StatusBadRequest, "This email is already verified. Please try logging in instead.")
			}
			return apptypes.Error(fiber.StatusNotFound, "No pending verification found for this email. Please register first.")
		}
		if expiresAt := asTime(pending["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_ = deleteEmailVerification(c.UserContext(), a, emailHash)
			return apptypes.Error(fiber.StatusGone, "Verification expired. Please register again.")
		}
		code, err := generateVerificationCode()
		if err != nil {
			return err
		}
		pending["verification_code"] = code
		pending["created_at"] = time.Now().UTC()
		pending["expires_at"] = time.Now().UTC().Add(15 * time.Minute)
		if err := insertEmailVerification(c.UserContext(), a, pending); err != nil {
			return err
		}
		username := ""
		if userData, ok := pending["user_data"].(map[string]any); ok {
			username = authStringify(userData["username"])
		}
		if err := sendVerificationEmail(c.UserContext(), a, body.Email, username, code); err != nil {
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
		enrichAuthUserInfo(&response.User, user)
		if err := storeRefreshToken(c.UserContext(), a, authStringify(user["user_id"]), response.RefreshToken); err != nil {
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
		err = insertPasswordReset(c.UserContext(), a, map[string]any{
			"user_id":    authStringify(user["user_id"]),
			"email_hash": emailHash,
			"reset_code": code,
			"expires_at": time.Now().UTC().Add(time.Hour),
			"created_at": time.Now().UTC(),
			"used":       false,
		})
		if err != nil {
			apptypes.Logger().Error("password_reset_record_failed", "error", err, "email_hash", emailHash)
			return apptypes.JSON(c, fiber.StatusOK, response)
		}
		if err := sendPasswordResetEmail(c.UserContext(), a, body.Email, fallbackUserName(user), code); err != nil {
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
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid or expired password reset code.")
		}
		user, err := findUserByID(c.UserContext(), a, userID)
		if err != nil {
			return err
		}
		response, err := buildAuthResponse(a, userID, fallbackUserName(user), body.DeviceID, fallbackAvatar(user))
		if err != nil {
			return err
		}
		enrichAuthUserInfo(&response.User, user)
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

func sendVerificationEmail(ctx context.Context, a apptypes.Deps, email, username, code string) error {
	if a.Mailer == nil {
		if a.Config.Local {
			return nil
		}
		return fmt.Errorf("mailer is not configured")
	}
	return a.Mailer.SendVerification(ctx, strings.TrimSpace(email), username, code)
}

func sendPasswordResetEmail(ctx context.Context, a apptypes.Deps, email, username, code string) error {
	if a.Mailer == nil {
		if a.Config.Local {
			return nil
		}
		return fmt.Errorf("mailer is not configured")
	}
	return a.Mailer.SendPasswordReset(ctx, strings.TrimSpace(email), username, code)
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

func enrichAuthUserInfo(info *modelsv2.AuthUserInfo, user map[string]any) {
	info.AuthMethods = uniqueStrings(toStringSlice(user["auth_methods"]))
	if !slicesContains(info.AuthMethods, "email") {
		return
	}
	if email, err := apptypes.DecryptString(authStringify(user["email_encrypted"])); err == nil && email != "" {
		info.Email = &email
	}
}

func storeRefreshToken(ctx context.Context, a apptypes.Deps, userID, refreshToken string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	claims, err := parseRefreshToken(a, refreshToken)
	if err != nil {
		return err
	}
	_, err = a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_refresh_tokens (token_hash, user_id, device_id, expires_at, data, created_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, now())
		ON CONFLICT (token_hash) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			device_id = EXCLUDED.device_id,
			expires_at = EXCLUDED.expires_at,
			revoked_at = NULL,
			data = EXCLUDED.data
	`, tokenHash(refreshToken), userID, claims.Device, time.Now().UTC().Add(90*24*time.Hour), apptypes.Marshal(map[string]any{"device_id": claims.Device}))
	return err
}

func rotateRefreshToken(ctx context.Context, a apptypes.Deps, oldToken, newToken, userID, deviceID string) error {
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	tx, err := a.Store.SQL.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	cmd, err := tx.Exec(ctx, `
		UPDATE auth_refresh_tokens
		SET revoked_at = now()
		WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
	`, tokenHash(oldToken), userID)
	if err != nil || cmd.RowsAffected() != 1 {
		if err != nil {
			return err
		}
		return fmt.Errorf("refresh token was already consumed")
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO auth_refresh_tokens (token_hash, user_id, device_id, expires_at, data, created_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, now())
	`, tokenHash(newToken), userID, deviceID, time.Now().UTC().Add(90*24*time.Hour), apptypes.Marshal(map[string]any{"device_id": deviceID}))
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
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

func upsertDiscordUser(ctx context.Context, a apptypes.Deps, discordUser *discord.OAuth2User) (string, error) {
	existingUser, _ := findUserByDiscordID(ctx, a, discordUser.ID.String())

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
		for key, value := range discordIdentityData(discordUser) {
			update[key] = value
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
	for key, value := range discordIdentityData(discordUser) {
		insert[key] = value
	}
	if err := upsertAuthUser(ctx, a, insert); err != nil {
		return "", err
	}
	return userID, nil
}

func discordIdentityData(discordUser *discord.OAuth2User) map[string]any {
	return map[string]any{
		"discord_user_id": discordUser.ID.String(),
		"linked_accounts": map[string]any{
			"discord": map[string]any{
				"linked_at":       time.Now().UTC(),
				"discord_user_id": discordUser.ID.String(),
				"username":        discordUser.Username,
			},
		},
	}
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

func findUserByEmailHash(ctx context.Context, a apptypes.Deps, emailHash string) (map[string]any, error) {
	return scanAuthUser(ctx, a, `WHERE email_hash = $1`, emailHash)
}

func findUserByDiscordID(ctx context.Context, a apptypes.Deps, discordUserID string) (map[string]any, error) {
	return scanAuthUser(ctx, a, `WHERE discord_user_id = $1 OR data #>> '{linked_accounts,discord,discord_user_id}' = $1 OR user_id = $1`, discordUserID)
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
	expandDotted(user)
	if err := validateAuthIdentity(user); err != nil {
		return err
	}
	if a.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
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
	authMethods := uniqueStrings(toStringSlice(user["auth_methods"]))
	verified := slicesContains(authMethods, "email") || slicesContains(authMethods, "discord")
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

func validateAuthIdentity(user map[string]any) error {
	authMethods := uniqueStrings(toStringSlice(user["auth_methods"]))
	hasEmail := authStringify(user["email_hash"]) != ""
	hasDiscord := authStringify(user["discord_user_id"]) != ""
	if !hasDiscord {
		if linked, ok := user["linked_accounts"].(map[string]any); ok {
			if discordAccount, ok := linked["discord"].(map[string]any); ok {
				hasDiscord = authStringify(discordAccount["discord_user_id"]) != ""
			}
		}
	}
	if (slicesContains(authMethods, "email") && slicesContains(authMethods, "discord")) || (hasEmail && hasDiscord) {
		return fmt.Errorf("auth user cannot combine email and Discord identities")
	}
	return nil
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
		args = append(args, authCodeHash(a, emailHash, code))
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
	codeHash := authCodeHash(a, emailHash, code)
	expiresAt := asTime(record["expires_at"])
	if expiresAt.IsZero() {
		expiresAt = time.Now().UTC().Add(15 * time.Minute)
	}
	data := make(map[string]any, len(record))
	for key, value := range record {
		if key != "verification_code" {
			data[key] = value
		}
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
	`, emailHash, codeHash, authStringify(record["user_id"]), expiresAt, apptypes.Marshal(data))
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

func consumeEmailVerification(ctx context.Context, a apptypes.Deps, emailHash, code string) (map[string]any, error) {
	if a.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var userID *string
	var expiresAt, createdAt time.Time
	var raw []byte
	if err := a.Store.SQL.QueryRow(ctx, `
		DELETE FROM auth_email_verifications
		WHERE email_hash = $1 AND verification_code_hash = $2 AND expires_at > now()
		RETURNING user_id, expires_at, data, created_at
	`, emailHash, authCodeHash(a, emailHash, code)).Scan(&userID, &expiresAt, &raw, &createdAt); err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["email_hash"] = emailHash
	out["expires_at"] = expiresAt
	out["created_at"] = createdAt
	if userID != nil {
		out["user_id"] = *userID
	}
	return out, nil
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
	emailHash := authStringify(record["email_hash"])
	codeHash := authCodeHash(a, emailHash, authStringify(record["reset_code"]))
	data := make(map[string]any, len(record))
	for key, value := range record {
		if key != "reset_code" {
			data[key] = value
		}
	}
	_, err := a.Store.SQL.Exec(ctx, `
		INSERT INTO auth_password_reset_tokens (
			email_hash, reset_code_hash, user_id, used, expires_at, data, created_at
		) VALUES ($1, $2, NULLIF($3, ''), false, $4, $5::jsonb, now())
	`, emailHash, codeHash, authStringify(record["user_id"]), asTime(record["expires_at"]), apptypes.Marshal(data))
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
	`, emailHash, authCodeHash(a, emailHash, code)).Scan(&userID, &expiresAt, &raw); err != nil {
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
	`, emailHash, authCodeHash(a, emailHash, code))
	return err
}

func deletePasswordReset(ctx context.Context, a apptypes.Deps, emailHash, code string) error {
	if a.Store.SQL == nil {
		return nil
	}
	_, err := a.Store.SQL.Exec(ctx, `
		DELETE FROM auth_password_reset_tokens
		WHERE email_hash = $1 AND reset_code_hash = $2 AND used = false
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
		UPDATE auth_password_reset_tokens
		SET used = true,
		    data = jsonb_set(data, '{used}', 'true'::jsonb, true)
		WHERE id = (
			SELECT id
			FROM auth_password_reset_tokens
			WHERE email_hash = $1
			  AND reset_code_hash = $2
			  AND used = false
			  AND expires_at > now()
			ORDER BY created_at DESC
			LIMIT 1
			FOR UPDATE
		)
		RETURNING user_id
	`, emailHash, authCodeHash(a, emailHash, code)).Scan(&userID); err != nil {
		return "", err
	}
	cmd, err := tx.Exec(ctx, `
		UPDATE auth_users
		SET password_hash = $2,
		    data = jsonb_set(data, '{password}', to_jsonb($2::text), true),
		    updated_at = now()
		WHERE user_id = $1
	`, userID, passwordHash)
	if err != nil {
		return "", err
	}
	if cmd.RowsAffected() != 1 {
		return "", fmt.Errorf("password reset user not found")
	}
	if _, err := tx.Exec(ctx, `
		UPDATE auth_refresh_tokens
		SET revoked_at = now()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, userID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return userID, nil
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
