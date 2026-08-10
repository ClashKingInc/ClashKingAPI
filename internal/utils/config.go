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
	COCEmail                     string
	COCPassword                  string
	TimescaleURL                 string
	RedisIP                      string
	RedisPassword                string
	BunnyAccessKey               string
	AnalyticsToken               string
	LinkAPIUser                  string
	LinkAPIPassword              string
	InternalAPIToken             string
	AIUsageSecret                string
	Local                        bool
	APIBotToken                  string
	DevUserID                    string
	ClientSecret                 string
	BotToken                     string
	ProxyBaseURL                 string
	EncryptionKey                string
	SecretKey                    string
	RefreshSecret                string
	NativeTokenAudience          string
	WebTokenAudience             string
	WebAllowedOrigins            []string
	DiscordRedirectURI           string
	DiscordClientID              string
	DiscordClientSecret          string
	SentryDSN                    string
	SentryDSNMobile              string
	StripeSecretKey              string
	StripeWebhookSecret          string
	StripeMonthlyPriceID         string
	StripeCheckoutSuccessURL     string
	StripeCheckoutCancelURL      string
	StripePortalReturnURL        string
	AIRosterMaxPromptChars       int
	AIRosterMembershipMaxChanges int
	RosterRefreshCooldownMinutes int
	SMTPUsername                 string
	SMTPPassword                 string
	SMTPFrom                     string
	SMTPReplyTo                  string
	SMTPServer                   string
	SMTPPort                     int
	SMTPStartTLS                 bool
	SMTPSSLTLS                   bool
	ListenHost                   string
	ListenPort                   int
}

func Load() (Config, error) {
	_ = godotenv.Load()

	if err := validateTimescaleEnvironment(os.Getenv); err != nil {
		return Config{}, err
	}

	cfg := Config{
		COCEmail:                     os.Getenv("COC_EMAIL"),
		COCPassword:                  os.Getenv("COC_PASSWORD"),
		TimescaleURL:                 buildTimescaleURL(os.Getenv),
		RedisIP:                      os.Getenv("REDIS_IP"),
		RedisPassword:                os.Getenv("REDIS_PW"),
		BunnyAccessKey:               os.Getenv("BUNNY_ACCESS_KEY"),
		AnalyticsToken:               os.Getenv("API_ANALYTICS_KEY"),
		LinkAPIUser:                  os.Getenv("LINK_API_USER"),
		LinkAPIPassword:              os.Getenv("LINK_API_PW"),
		InternalAPIToken:             os.Getenv("INTERNAL_API_TOKEN"),
		AIUsageSecret:                os.Getenv("AI_USAGE_SECRET"),
		Local:                        strings.EqualFold(os.Getenv("LOCAL"), "TRUE"),
		APIBotToken:                  os.Getenv("API_BOT_TOKEN"),
		DevUserID:                    os.Getenv("DEV_USER_ID"),
		ClientSecret:                 os.Getenv("CLIENT_SECRET"),
		BotToken:                     os.Getenv("BOT_TOKEN"),
		ProxyBaseURL:                 os.Getenv("PROXY_BASE_URL"),
		EncryptionKey:                os.Getenv("ENCRYPTION_KEY"),
		SecretKey:                    os.Getenv("SECRET_KEY"),
		RefreshSecret:                os.Getenv("REFRESH_SECRET"),
		NativeTokenAudience:          firstNonEmpty(os.Getenv("NATIVE_TOKEN_AUDIENCE"), "clashking-native"),
		WebTokenAudience:             firstNonEmpty(os.Getenv("WEB_TOKEN_AUDIENCE"), "clashking-web"),
		WebAllowedOrigins:            splitCSV(os.Getenv("WEB_ALLOWED_ORIGINS")),
		DiscordRedirectURI:           os.Getenv("DISCORD_REDIRECT_URI"),
		DiscordClientID:              os.Getenv("DISCORD_CLIENT_ID"),
		DiscordClientSecret:          os.Getenv("DISCORD_CLIENT_SECRET"),
		SentryDSN:                    os.Getenv("SENTRY_DSN_API"),
		SentryDSNMobile:              os.Getenv("APP_SENTRY_DSN"),
		StripeSecretKey:              os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:          os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripeMonthlyPriceID:         os.Getenv("STRIPE_MONTHLY_PRICE_ID"),
		StripeCheckoutSuccessURL:     os.Getenv("STRIPE_CHECKOUT_SUCCESS_URL"),
		StripeCheckoutCancelURL:      os.Getenv("STRIPE_CHECKOUT_CANCEL_URL"),
		StripePortalReturnURL:        os.Getenv("STRIPE_PORTAL_RETURN_URL"),
		AIRosterMaxPromptChars:       envInt("AI_ROSTER_MAX_PROMPT_CHARS", 12000),
		AIRosterMembershipMaxChanges: envInt("AI_ROSTER_MEMBERSHIP_MAX_CHANGES", 1000),
		RosterRefreshCooldownMinutes: envInt("ROSTER_REFRESH_COOLDOWN_MINUTES", 15),
		SMTPUsername:                 os.Getenv("SMTP_USERNAME"),
		SMTPPassword:                 os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:                     os.Getenv("SMTP_FROM"),
		SMTPReplyTo:                  firstNonEmpty(os.Getenv("SMTP_REPLY_TO"), "noreply@clashk.ing"),
		SMTPServer:                   firstNonEmpty(os.Getenv("SMTP_SERVER"), "smtp.gmail.com"),
		SMTPPort:                     envInt("SMTP_PORT", 587),
		SMTPStartTLS:                 envBool("SMTP_STARTTLS", true),
		SMTPSSLTLS:                   envBool("SMTP_SSL_TLS", false),
	}
	if cfg.Local {
		if strings.TrimSpace(cfg.AIUsageSecret) == "" {
			cfg.AIUsageSecret = "clashking-local-ai-metering"
		}
		cfg.ListenHost = "127.0.0.1"
		cfg.ListenPort = 8000
		if len(cfg.WebAllowedOrigins) == 0 {
			cfg.WebAllowedOrigins = []string{
				"https://dev-dash.clashk.ing",
				"http://localhost:3002", "http://127.0.0.1:3002",
				"http://localhost:8080", "http://127.0.0.1:8080",
			}
		}
	} else {
		cfg.ListenHost = "0.0.0.0"
		cfg.ListenPort = 8010
	}
	if listenHost := strings.TrimSpace(os.Getenv("LISTEN_HOST")); listenHost != "" {
		cfg.ListenHost = listenHost
	}
	if listenPort := strings.TrimSpace(os.Getenv("LISTEN_PORT")); listenPort != "" {
		port, err := strconv.Atoi(listenPort)
		if err != nil || port < 1 || port > 65535 {
			return Config{}, fmt.Errorf("invalid LISTEN_PORT: %s", listenPort)
		}
		cfg.ListenPort = port
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
		if strings.TrimSpace(c.AIUsageSecret) == "" {
			return errors.New("AI_USAGE_SECRET is required outside local mode")
		}
		if len(c.WebAllowedOrigins) == 0 {
			return errors.New("WEB_ALLOWED_ORIGINS is required outside local mode")
		}
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
	if c.AIRosterMaxPromptChars != 0 && c.AIRosterMaxPromptChars < 1000 ||
		c.AIRosterMembershipMaxChanges != 0 && (c.AIRosterMembershipMaxChanges < 1 || c.AIRosterMembershipMaxChanges > 1000) ||
		c.RosterRefreshCooldownMinutes != 0 && c.RosterRefreshCooldownMinutes < 1 {
		return errors.New("AI roster and roster refresh limits must be positive and within supported minimums")
	}
	if c.SMTPStartTLS && c.SMTPSSLTLS {
		return errors.New("SMTP_STARTTLS and SMTP_SSL_TLS cannot both be enabled")
	}
	return nil
}

func splitCSV(raw string) []string {
	seen := make(map[string]struct{})
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		value = strings.TrimSpace(strings.TrimSuffix(value, "/"))
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	return values
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
