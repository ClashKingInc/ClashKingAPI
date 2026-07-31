package utils

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type contextKey string

const (
	userIDKey   contextKey = "user_id"
	deviceIDKey contextKey = "device_id"
)

type Claims struct {
	Sub    string `json:"sub"`
	Device string `json:"device,omitempty"`
	jwt.RegisteredClaims
}

const (
	defaultNativeTokenAudience = "clashking-native"
	defaultWebTokenAudience    = "clashking-web"
)

type Authenticator struct {
	cfg   Config
	users authUserLookup
}

type authUserLookup interface {
	AuthUserExists(context.Context, string) (bool, error)
}

func NewAuthenticator(cfg Config, store *Store) *Authenticator {
	if store == nil {
		return newAuthenticator(cfg, nil)
	}
	return newAuthenticator(cfg, store)
}

func newAuthenticator(cfg Config, users authUserLookup) *Authenticator {
	return &Authenticator{cfg: cfg, users: users}
}

func (a *Authenticator) Wrap(next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if a.cfg.Local {
			token := bearerToken(c.Get("Authorization"))
			if token == "" {
				ctx := context.WithValue(c.UserContext(), userIDKey, a.cfg.DevUserID)
				WithUserContext(c, ctx)
				return next(c)
			}

			claims, err := a.parseJWT(token)
			if err != nil {
				return err
			}
			ctx := context.WithValue(c.UserContext(), userIDKey, claims.Sub)
			if claims.Device != "" {
				ctx = context.WithValue(ctx, deviceIDKey, claims.Device)
			}
			WithUserContext(c, ctx)
			return next(c)
		}
		token := bearerToken(c.Get("Authorization"))
		if token == "" {
			return Error(fiber.StatusUnauthorized, "Authentication token missing")
		}
		claims, err := a.parseJWT(token)
		if err != nil {
			return err
		}
		if a.users == nil {
			return Error(fiber.StatusServiceUnavailable, "Authentication state is unavailable")
		}
		exists, err := a.users.AuthUserExists(c.UserContext(), claims.Sub)
		if err != nil {
			return Error(fiber.StatusServiceUnavailable, "Authentication state is unavailable")
		}
		if !exists {
			return Error(fiber.StatusUnauthorized, "User session is no longer valid")
		}
		ctx := context.WithValue(c.UserContext(), userIDKey, claims.Sub)
		if claims.Device != "" {
			ctx = context.WithValue(ctx, deviceIDKey, claims.Device)
		}
		WithUserContext(c, ctx)
		return next(c)
	}
}

func bearerToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parts := strings.Split(raw, " ")
	if len(parts) == 2 {
		return parts[1]
	}
	return raw
}

func (a *Authenticator) parseJWT(token string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(
		token,
		claims,
		func(t *jwt.Token) (any, error) {
			return []byte(a.cfg.SecretKey), nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)
	if err != nil {
		return nil, Error(fiber.StatusUnauthorized, "Invalid or expired token")
	}
	if claims.Sub == "" {
		return nil, Error(fiber.StatusUnauthorized, "User not found")
	}
	if !claimsHasAudience(claims, nativeTokenAudience(a.cfg)) && !claimsHasAudience(claims, webTokenAudience(a.cfg)) {
		return nil, Error(fiber.StatusUnauthorized, "Invalid token audience")
	}
	return claims, nil
}

func UserID(ctx context.Context) string {
	value, _ := ctx.Value(userIDKey).(string)
	return value
}

func DeviceID(ctx context.Context) string {
	value, _ := ctx.Value(deviceIDKey).(string)
	return value
}

func GenerateAccessToken(cfg Config, userID, deviceID string) (string, error) {
	return generateAccessToken(cfg, userID, deviceID, nativeTokenAudience(cfg), 24*time.Hour)
}

func GenerateWebAccessToken(cfg Config, userID, deviceID string) (string, error) {
	return generateAccessToken(cfg, userID, deviceID, webTokenAudience(cfg), 15*time.Minute)
}

func generateAccessToken(cfg Config, userID, deviceID, audience string, lifetime time.Duration) (string, error) {
	claims := Claims{
		Sub:    userID,
		Device: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(lifetime)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.SecretKey))
}

func GenerateRefreshToken(cfg Config, userID, deviceID string) (string, error) {
	return generateRefreshToken(cfg, userID, deviceID, nativeTokenAudience(cfg))
}

func GenerateWebRefreshToken(cfg Config, userID, deviceID string) (string, error) {
	return generateRefreshToken(cfg, userID, deviceID, webTokenAudience(cfg))
}

func generateRefreshToken(cfg Config, userID, deviceID, audience string) (string, error) {
	claims := Claims{
		Sub:    userID,
		Device: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			Audience:  jwt.ClaimStrings{audience},
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(30 * 24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.RefreshSecret))
}

func nativeTokenAudience(cfg Config) string {
	if value := strings.TrimSpace(cfg.NativeTokenAudience); value != "" {
		return value
	}
	return defaultNativeTokenAudience
}

func webTokenAudience(cfg Config) string {
	if value := strings.TrimSpace(cfg.WebTokenAudience); value != "" {
		return value
	}
	return defaultWebTokenAudience
}

func claimsHasAudience(claims *Claims, audience string) bool {
	for _, value := range claims.Audience {
		if value == audience {
			return true
		}
	}
	return false
}

func Marshal(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}
