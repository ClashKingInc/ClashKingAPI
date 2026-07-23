package utils

import (
	"errors"
	"fmt"
	"net"
	"net/url"
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
	APIBotToken         string
	DevUserID           string
	ClientSecret        string
	BotToken            string
	ProxyBaseURL        string
	EncryptionKey       string
	SecretKey           string
	RefreshSecret       string
	DiscordRedirectURI  string
	DiscordClientID     string
	DiscordClientSecret string
	SentryDSN           string
	SentryDSNMobile     string
	SMTPUsername        string
	SMTPPassword        string
	SMTPFrom            string
	SMTPReplyTo         string
	SMTPServer          string
	SMTPPort            int
	SMTPStartTLS        bool
	SMTPSSLTLS          bool
	ListenHost          string
	ListenPort          int
}

func Load() (Config, error) {
	_ = godotenv.Load()

	if err := validateTimescaleEnvironment(os.Getenv); err != nil {
		return Config{}, err
	}

	cfg := Config{
		COCEmail:            os.Getenv("COC_EMAIL"),
		COCPassword:         os.Getenv("COC_PASSWORD"),
		TimescaleURL:        buildTimescaleURL(os.Getenv),
		RedisIP:             os.Getenv("REDIS_IP"),
		RedisPassword:       os.Getenv("REDIS_PW"),
		BunnyAccessKey:      os.Getenv("BUNNY_ACCESS_KEY"),
		AnalyticsToken:      os.Getenv("API_ANALYTICS_KEY"),
		LinkAPIUser:         os.Getenv("LINK_API_USER"),
		LinkAPIPassword:     os.Getenv("LINK_API_PW"),
		InternalAPIToken:    os.Getenv("INTERNAL_API_TOKEN"),
		Local:               strings.EqualFold(os.Getenv("LOCAL"), "TRUE"),
		APIBotToken:         os.Getenv("API_BOT_TOKEN"),
		DevUserID:           os.Getenv("DEV_USER_ID"),
		ClientSecret:        os.Getenv("CLIENT_SECRET"),
		BotToken:            os.Getenv("BOT_TOKEN"),
		ProxyBaseURL:        os.Getenv("PROXY_BASE_URL"),
		EncryptionKey:       os.Getenv("ENCRYPTION_KEY"),
		SecretKey:           os.Getenv("SECRET_KEY"),
		RefreshSecret:       os.Getenv("REFRESH_SECRET"),
		DiscordRedirectURI:  os.Getenv("DISCORD_REDIRECT_URI"),
		DiscordClientID:     os.Getenv("DISCORD_CLIENT_ID"),
		DiscordClientSecret: os.Getenv("DISCORD_CLIENT_SECRET"),
		SentryDSN:           os.Getenv("SENTRY_DSN_API"),
		SentryDSNMobile:     os.Getenv("APP_SENTRY_DSN"),
		SMTPUsername:        os.Getenv("SMTP_USERNAME"),
		SMTPPassword:        os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:            os.Getenv("SMTP_FROM"),
		SMTPReplyTo:         firstNonEmpty(os.Getenv("SMTP_REPLY_TO"), "noreply@clashk.ing"),
		SMTPServer:          firstNonEmpty(os.Getenv("SMTP_SERVER"), "smtp.gmail.com"),
		SMTPPort:            envInt("SMTP_PORT", 587),
		SMTPStartTLS:        envBool("SMTP_STARTTLS", true),
		SMTPSSLTLS:          envBool("SMTP_SSL_TLS", false),
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
		"ENCRYPTION_KEY":        c.EncryptionKey,
		"SECRET_KEY":            c.SecretKey,
		"REFRESH_SECRET":        c.RefreshSecret,
		"BOT_TOKEN":             c.BotToken,
		"DISCORD_CLIENT_ID":     c.DiscordClientID,
		"DISCORD_CLIENT_SECRET": c.DiscordClientSecret,
		"DISCORD_REDIRECT_URI":  c.DiscordRedirectURI,
		"API_BOT_TOKEN":         c.APIBotToken,
		"PROXY_BASE_URL":        c.ProxyBaseURL,
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
	if !c.Local {
		for key, value := range map[string]string{
			"SMTP_USERNAME": c.SMTPUsername,
			"SMTP_PASSWORD": c.SMTPPassword,
			"SMTP_FROM":     c.SMTPFrom,
			"SMTP_SERVER":   c.SMTPServer,
		} {
			if strings.TrimSpace(value) == "" {
				return fmt.Errorf("%s is required outside local mode", key)
			}
		}
	}
	if c.SMTPPort < 1 || c.SMTPPort > 65535 {
		return errors.New("SMTP_PORT must be between 1 and 65535")
	}
	if c.SMTPStartTLS && c.SMTPSSLTLS {
		return errors.New("SMTP_STARTTLS and SMTP_SSL_TLS cannot both be enabled")
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

func buildTimescaleURL(getenv func(string) string) string {
	host := strings.TrimSpace(getenv("TIMESCALE_HOST"))
	port := firstNonEmpty(getenv("TIMESCALE_PORT"), "5432")
	user := strings.TrimSpace(getenv("TIMESCALE_USER"))
	password := getenv("TIMESCALE_PASSWORD")
	database := strings.TrimSpace(getenv("TIMESCALE_DB"))

	connection := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, password),
		Host:   net.JoinHostPort(host, port),
		Path:   database,
	}
	query := connection.Query()
	query.Set("sslmode", firstNonEmpty(getenv("TIMESCALE_SSLMODE"), "disable"))
	connection.RawQuery = query.Encode()
	return connection.String()
}

func validateTimescaleEnvironment(getenv func(string) string) error {
	required := []string{
		"TIMESCALE_HOST",
		"TIMESCALE_USER",
		"TIMESCALE_PASSWORD",
		"TIMESCALE_DB",
	}
	var missing []string
	for _, key := range required {
		if strings.TrimSpace(getenv(key)) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	return nil
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return value
}
