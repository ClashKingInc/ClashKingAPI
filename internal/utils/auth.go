package utils

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
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
	store *Store
}

func NewAuthenticator(cfg Config, store *Store) *Authenticator {
	return &Authenticator{cfg: cfg, store: store}
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
			return Error(fiber.StatusForbidden, "Authentication token missing")
		}
		if a.cfg.AuthToken != "" && token == a.cfg.AuthToken {
			return next(c)
		}
		if userID, err := a.fromDBToken(c.UserContext(), token); err == nil {
			ctx := context.WithValue(c.UserContext(), userIDKey, userID)
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

func (a *Authenticator) fromDBToken(ctx context.Context, token string) (string, error) {
	if a.store.SQL == nil {
		return "", Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var userID string
	var serverID *string
	var expiresAt *time.Time
	if err := a.store.SQL.QueryRow(ctx, `
		SELECT user_id, server_id, expires_at
		FROM api_tokens
		WHERE token_hash = $1
	`, tokenHash(token)).Scan(&userID, &serverID, &expiresAt); err != nil {
		return "", err
	}
	if expiresAt != nil && time.Now().After(*expiresAt) {
		return "", Error(fiber.StatusUnauthorized, "Access token expired")
	}
	if serverID != nil && *serverID != "" {
		return fmt.Sprintf("server:%s", *serverID), nil
	}
	return userID, nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (a *Authenticator) parseJWT(token string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		return []byte(a.cfg.SecretKey), nil
	})
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

func EncryptToString(value string) string {
	return base64.URLEncoding.EncodeToString([]byte(value))
}

func DecryptString(value string) (string, error) {
	out, err := base64.URLEncoding.DecodeString(value)
	return string(out), err
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
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(90 * 24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.RefreshSecret))
}

func Marshal(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}
