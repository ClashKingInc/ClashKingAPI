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
		token := bearerToken(c.Get("Authorization"))
		if token == "" {
			if a.cfg.Local {
				ctx := context.WithValue(c.UserContext(), userIDKey, a.cfg.DevUserID)
				WithUserContext(c, ctx)
				return next(c)
			}
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
	claims := Claims{
		Sub:    userID,
		Device: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.SecretKey))
}

func GenerateRefreshToken(cfg Config, userID, deviceID string) (string, error) {
	claims := Claims{
		Sub:    userID,
		Device: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(90 * 24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.RefreshSecret))
}

func Marshal(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}
