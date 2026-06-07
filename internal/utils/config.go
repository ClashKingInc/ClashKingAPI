package utils

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	COCEmail            string
	COCPassword         string
	TimescaleURL        string
	RedisIP             string
	RedisPassword       string
	BunnyAccessKey      string
	AnalyticsToken      string
	LinkAPIUser         string
	LinkAPIPassword     string
	InternalAPIToken    string
	Local               bool
	AuthToken           string
	DevUserID           string
	ClientSecret        string
	BotToken            string
	EncryptionKey       string
	SecretKey           string
	RefreshSecret       string
	DiscordRedirectURI  string
	DiscordClientID     string
	DiscordClientSecret string
	SentryDSN           string
	SentryDSNMobile     string
	ListenHost          string
	ListenPort          int
}

func Load() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		COCEmail:            os.Getenv("COC_EMAIL"),
		COCPassword:         os.Getenv("COC_PASSWORD"),
		TimescaleURL:        firstNonEmpty(os.Getenv("TIMESCALE_URL"), os.Getenv("DATABASE_URL")),
		RedisIP:             os.Getenv("REDIS_IP"),
		RedisPassword:       os.Getenv("REDIS_PW"),
		BunnyAccessKey:      os.Getenv("BUNNY_ACCESS_KEY"),
		AnalyticsToken:      os.Getenv("API_ANALYTICS_KEY"),
		LinkAPIUser:         os.Getenv("LINK_API_USER"),
		LinkAPIPassword:     os.Getenv("LINK_API_PW"),
		InternalAPIToken:    os.Getenv("INTERNAL_API_TOKEN"),
		Local:               strings.EqualFold(os.Getenv("LOCAL"), "TRUE"),
		AuthToken:           os.Getenv("AUTH_TOKEN"),
		DevUserID:           os.Getenv("DEV_USER_ID"),
		ClientSecret:        os.Getenv("CLIENT_SECRET"),
		BotToken:            os.Getenv("BOT_TOKEN"),
		EncryptionKey:       os.Getenv("ENCRYPTION_KEY"),
		SecretKey:           os.Getenv("SECRET_KEY"),
		RefreshSecret:       os.Getenv("REFRESH_SECRET"),
		DiscordRedirectURI:  os.Getenv("DISCORD_REDIRECT_URI"),
		DiscordClientID:     os.Getenv("DISCORD_CLIENT_ID"),
		DiscordClientSecret: os.Getenv("DISCORD_CLIENT_SECRET"),
		SentryDSN:           os.Getenv("SENTRY_DSN"),
		SentryDSNMobile:     os.Getenv("APP_SENTRY_DSN"),
	}
	if cfg.Local {
		cfg.ListenHost = "127.0.0.1"
		cfg.ListenPort = 8000
	} else {
		cfg.ListenHost = "0.0.0.0"
		cfg.ListenPort = 8010
	}

	if err := cfg.validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Addr() string {
	return net.JoinHostPort(c.ListenHost, strconv.Itoa(c.ListenPort))
}

func (c Config) validate() error {
	required := map[string]string{
		"TIMESCALE_URL":         c.TimescaleURL,
		"ENCRYPTION_KEY":        c.EncryptionKey,
		"SECRET_KEY":            c.SecretKey,
		"REFRESH_SECRET":        c.RefreshSecret,
		"BOT_TOKEN":             c.BotToken,
		"DISCORD_CLIENT_ID":     c.DiscordClientID,
		"DISCORD_CLIENT_SECRET": c.DiscordClientSecret,
		"DISCORD_REDIRECT_URI":  c.DiscordRedirectURI,
	}
	var missing []string
	for key, value := range required {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	if c.Local && c.DevUserID == "" {
		return errors.New("LOCAL=TRUE requires DEV_USER_ID")
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
