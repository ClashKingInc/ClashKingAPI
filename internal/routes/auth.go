package routes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/ClashKingInc/ClashKingAPI/internal/models"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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
// @Param body body models.AuthEmailCodeRequest true "Verification payload"
// @Success 200 {object} models.AuthResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/auth/verify-email-code [post]
func verifyEmailCode(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthEmailCodeRequest
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
		var pending map[string]any
		if err := a.Store.C.EmailVerify.FindOne(c.UserContext(), bson.M{"email_hash": emailHash, "verification_code": body.Code}).Decode(&pending); err != nil {
			return apptypes.Error(fiber.StatusUnauthorized, "Invalid verification code")
		}
		expiresAt := asTime(pending["expires_at"])
		if !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_, _ = a.Store.C.EmailVerify.DeleteOne(c.UserContext(), bson.M{"_id": pending["_id"]})
			return apptypes.Error(fiber.StatusUnauthorized, "Verification code expired. Please request a new one.")
		}
		userData, _ := pending["user_data"].(map[string]any)
		if userData == nil {
			return apptypes.Error(fiber.StatusInternalServerError, "Invalid verification record")
		}
		var existing map[string]any
		_ = a.Store.C.Users.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&existing)
		userID := authStringify(userData["user_id"])
		if userID == "" {
			if existing != nil {
				userID = authStringify(existing["user_id"])
			} else {
				userID = generateUserID()
			}
		}
		update := bson.M{
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
		if existing != nil {
			if _, err := a.Store.C.Users.UpdateOne(c.UserContext(), bson.M{"user_id": userID}, bson.M{"$set": update}); err != nil {
				return err
			}
		} else {
			if _, err := a.Store.C.Users.InsertOne(c.UserContext(), update); err != nil {
				return err
			}
		}
		_, _ = a.Store.C.EmailVerify.DeleteOne(c.UserContext(), bson.M{"_id": pending["_id"]})
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
// @Success 200 {object} models.AuthUserInfo
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		return apptypes.JSON(c, fiber.StatusOK, models.AuthUserInfo{
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
// @Param body body models.AuthDiscordOAuthRequest true "Discord OAuth payload"
// @Success 200 {object} models.AuthResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/auth/discord [post]
func discordAuth(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthDiscordOAuthRequest
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
// @Param body body models.AuthRefreshTokenRequest true "Refresh token payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/auth/refresh [post]
func refreshToken(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthRefreshTokenRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		claims, err := parseRefreshToken(a, body.RefreshToken)
		if err != nil {
			return err
		}
		var stored map[string]any
		if err := a.Store.C.RefreshTokens.FindOne(c.UserContext(), bson.M{"refresh_token": body.RefreshToken}).Decode(&stored); err != nil {
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
// @Param body body models.AuthEmailRegisterRequest true "Registration payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 409 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/auth/register [post]
func register(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthEmailRegisterRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateRegistration(body.Email, body.Password, body.Username); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		var existing map[string]any
		_ = a.Store.C.Users.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&existing)
		if existing != nil && slicesContains(toStringSlice(existing["auth_methods"]), "email") {
			return apptypes.Error(fiber.StatusBadRequest, "Email already registered. Please try logging in instead.")
		}
		var pending map[string]any
		_ = a.Store.C.EmailVerify.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&pending)
		if pending != nil {
			if expiresAt := asTime(pending["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().Before(expiresAt) {
				return apptypes.Error(fiber.StatusConflict, "A verification email was already sent to this address. Please check your email or request a resend.")
			}
			_, _ = a.Store.C.EmailVerify.DeleteMany(c.UserContext(), bson.M{"email_hash": emailHash})
		}
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		code := generateVerificationCode()
		record := bson.M{
			"email_hash":        emailHash,
			"verification_code": code,
			"user_data": bson.M{
				"email_encrypted": apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(body.Email))),
				"email_hash":      emailHash,
				"username":        body.Username,
				"password":        string(passwordHash),
				"device_id":       body.DeviceID,
			},
			"created_at": time.Now().UTC(),
			"expires_at": time.Now().UTC().Add(15 * time.Minute),
		}
		if _, err := a.Store.C.EmailVerify.InsertOne(c.UserContext(), record); err != nil {
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
// @Param body body models.AuthForgotPasswordRequest true "Email payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 410 {object} map[string]interface{}
// @Router /v2/auth/resend-verification [post]
func resendVerification(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthForgotPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := validateEmail(body.Email); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		var pending map[string]any
		if err := a.Store.C.EmailVerify.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&pending); err != nil {
			var existing map[string]any
			_ = a.Store.C.Users.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&existing)
			if existing != nil && slicesContains(toStringSlice(existing["auth_methods"]), "email") {
				return apptypes.Error(fiber.StatusBadRequest, "This email is already verified. Please try logging in instead.")
			}
			return apptypes.Error(fiber.StatusNotFound, "No pending verification found for this email. Please register first.")
		}
		if expiresAt := asTime(pending["expires_at"]); !expiresAt.IsZero() && time.Now().UTC().After(expiresAt) {
			_, _ = a.Store.C.EmailVerify.DeleteOne(c.UserContext(), bson.M{"_id": pending["_id"]})
			return apptypes.Error(fiber.StatusGone, "Verification expired. Please register again.")
		}
		code := generateVerificationCode()
		_, err := a.Store.C.EmailVerify.UpdateOne(c.UserContext(), bson.M{"_id": pending["_id"]}, bson.M{"$set": bson.M{"verification_code": code, "created_at": time.Now().UTC(), "expires_at": time.Now().UTC().Add(15 * time.Minute)}})
		if err != nil {
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
// @Param body body models.AuthEmailAuthRequest true "Login payload"
// @Success 200 {object} models.AuthResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 409 {object} map[string]interface{}
// @Router /v2/auth/email [post]
func emailLogin(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthEmailAuthRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		var user map[string]any
		if err := a.Store.C.Users.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&user); err != nil {
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

// notImplementedDiscord documents the current Discord-linking placeholder.
//
// @Summary Link Discord to an existing account
// @Description Placeholder endpoint for Discord account linking.
// @Tags App Authentication
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]interface{}
// @Router /v2/auth/link-discord [post]
func notImplementedDiscord() fiber.Handler {
	return func(_ *fiber.Ctx) error {
		return apptypes.Error(fiber.StatusNotImplemented, "Discord account linking is not implemented yet in the shared Discord adapter")
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
// @Param body body models.AuthEmailRegisterRequest true "Link email payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/auth/link-email [post]
func linkEmail(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := apptypes.UserID(c.UserContext())
		var body models.AuthEmailRegisterRequest
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
		_, err = a.Store.C.Users.UpdateOne(c.UserContext(), bson.M{"user_id": userID}, bson.M{"$set": bson.M{
			"email_encrypted": apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(body.Email))),
			"email_hash":      emailHash,
			"username":        body.Username,
			"password":        string(passwordHash),
			"auth_methods":    []string{"discord", "email"},
		}})
		if err != nil {
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
// @Param body body models.AuthForgotPasswordRequest true "Forgot password payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/auth/forgot-password [post]
func forgotPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthForgotPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		var user map[string]any
		if err := a.Store.C.Users.FindOne(c.UserContext(), bson.M{"email_hash": emailHash}).Decode(&user); err != nil {
			return apptypes.Error(fiber.StatusNotFound, "No account found with this email address.")
		}
		code := generateVerificationCode()
		_, err := a.Store.C.PasswordResets.InsertOne(c.UserContext(), bson.M{
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
// @Param body body models.AuthResetPasswordRequest true "Reset password payload"
// @Success 200 {object} models.AuthResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/auth/reset-password [post]
func resetPassword(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body models.AuthResetPasswordRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		emailHash := hashEmail(a, body.Email)
		var record map[string]any
		if err := a.Store.C.PasswordResets.FindOne(c.UserContext(), bson.M{"email_hash": emailHash, "reset_code": body.ResetCode, "used": false}).Decode(&record); err != nil {
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
		if _, err := a.Store.C.Users.UpdateOne(c.UserContext(), bson.M{"user_id": userID}, bson.M{"$set": bson.M{"password": string(passwordHash)}}); err != nil {
			return err
		}
		if _, err := a.Store.C.PasswordResets.UpdateOne(c.UserContext(), bson.M{"_id": record["_id"]}, bson.M{"$set": bson.M{"used": true, "used_at": time.Now().UTC()}}); err != nil {
			return err
		}
		user, _ := findUserByID(c.UserContext(), a, userID)
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

func buildAuthResponse(a apptypes.Deps, userID, username, deviceID, avatarURL string) (models.AuthResponse, error) {
	accessToken, err := apptypes.GenerateAccessToken(a.Config, userID, deviceID)
	if err != nil {
		return models.AuthResponse{}, err
	}
	refreshToken, err := apptypes.GenerateRefreshToken(a.Config, userID, deviceID)
	if err != nil {
		return models.AuthResponse{}, err
	}
	return models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User: models.AuthUserInfo{
			UserID:    userID,
			Username:  username,
			AvatarURL: avatarURL,
		},
	}, nil
}

func storeRefreshToken(ctx context.Context, a apptypes.Deps, userID, refreshToken string) error {
	var existing map[string]any
	err := a.Store.C.RefreshTokens.FindOne(ctx, bson.M{"user_id": userID}).Decode(&existing)
	update := bson.M{
		"user_id":       userID,
		"refresh_token": refreshToken,
		"expires_at":    time.Now().UTC().Add(30 * 24 * time.Hour),
	}
	if existing != nil {
		_, err = a.Store.C.RefreshTokens.UpdateOne(ctx, bson.M{"user_id": userID}, bson.M{"$set": update})
		return err
	}
	_, err = a.Store.C.RefreshTokens.InsertOne(ctx, update)
	return err
}

func findUserByID(ctx context.Context, a apptypes.Deps, userID string) (map[string]any, error) {
	var user map[string]any
	if err := a.Store.C.Users.FindOne(ctx, bson.M{"user_id": userID}).Decode(&user); err == nil {
		return user, nil
	}
	if parsed, err := strconv.Atoi(userID); err == nil {
		if err := a.Store.C.Users.FindOne(ctx, bson.M{"user_id": parsed}).Decode(&user); err == nil {
			return user, nil
		}
	}
	return nil, nil
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
	case bson.DateTime:
		return typed.Time()
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
	emailConditions := []bson.M{{"user_id": discordUser.ID.String()}}
	if strings.TrimSpace(discordUser.Email) != "" {
		emailConditions = append(emailConditions, bson.M{"email_hash": hashEmail(a, discordUser.Email)})
	}

	var existingUser map[string]any
	_ = a.Store.C.Users.FindOne(ctx, bson.M{"$or": emailConditions}).Decode(&existingUser)

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
		update := bson.M{
			"auth_methods": uniqueStrings(authMethods),
			"username":     username,
			"avatar_url":   avatarURL,
		}
		if strings.TrimSpace(discordUser.Email) != "" {
			update["email_encrypted"] = apptypes.EncryptToString(strings.ToLower(strings.TrimSpace(discordUser.Email)))
			update["email_hash"] = hashEmail(a, discordUser.Email)
		}
		if _, err := a.Store.C.Users.UpdateOne(ctx, bson.M{"user_id": existingUser["user_id"]}, bson.M{"$set": update}); err != nil {
			return "", err
		}
		return userID, nil
	}

	userID := discordUser.ID.String()
	insert := bson.M{
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
	if _, err := a.Store.C.Users.InsertOne(ctx, insert); err != nil {
		return "", err
	}
	return userID, nil
}

func storeDiscordTokens(ctx context.Context, a apptypes.Deps, userID, deviceID, deviceName string, token *discord.AccessTokenResponse) error {
	update := bson.M{
		"user_id":               userID,
		"device_id":             deviceID,
		"device_name":           deviceName,
		"discord_access_token":  apptypes.EncryptToString(token.AccessToken),
		"discord_refresh_token": apptypes.EncryptToString(token.RefreshToken),
		"expires_at":            time.Now().UTC().Add(token.ExpiresIn),
	}
	_, err := a.Store.C.DiscordTokens.UpdateOne(
		ctx,
		bson.M{"user_id": userID, "device_id": deviceID, "device_name": deviceName},
		bson.M{"$set": update},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}
