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
	TimescaleURL                 string
	ValkeyAddress                string
	ValkeyPassword               string
	ElasticsearchURL             string
	ElasticsearchAPIKey          string
	ElasticsearchPlayersAlias    string
	ElasticsearchClansAlias      string
	WarArchiveOrigin             string
	BunnyAccessKey               string
	AIUsageSecret                string
	Local                        bool
	APIBotToken                  string
	DevUserID                    string
	DiscordBotToken              string
	ProxyOrigin                  string
	DataEncryptionKey            string
	JWTAccessSecret              string
	JWTRefreshSecret             string
	NativeTokenAudience          string
	WebTokenAudience             string
	LandingOrigin                string
	DashboardOrigin              string
	WebAllowedOrigins            []string
	DiscordRedirectURI           string
	DiscordClientID              string
	DiscordClientSecret          string
	SentryDSN                    string
	SentryDSNMobile              string
	StripeRestrictedKey          string
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

	landingOrigin := normalizeOrigin(os.Getenv("CLASHKING_LANDING_ORIGIN"))
	dashboardOrigin := normalizeOrigin(os.Getenv("CLASHKING_DASHBOARD_ORIGIN"))
	webAllowedOrigins := append(
		parseOrigins(os.Getenv("WEB_ALLOWED_ORIGINS")),
		landingOrigin,
		dashboardOrigin,
	)
	cfg := Config{
		TimescaleURL:                 buildTimescaleURL(os.Getenv),
		ValkeyAddress:                buildValkeyAddress(os.Getenv),
		ValkeyPassword:               os.Getenv("VALKEY_PASSWORD"),
		ElasticsearchURL:             normalizeOrigin(os.Getenv("ELASTICSEARCH_URL")),
		ElasticsearchAPIKey:          strings.TrimSpace(os.Getenv("ELASTICSEARCH_API_KEY")),
		ElasticsearchPlayersAlias:    normalizeElasticsearchAlias(os.Getenv("ELASTICSEARCH_PLAYERS_ALIAS"), "clashking_players"),
		ElasticsearchClansAlias:      normalizeElasticsearchAlias(os.Getenv("ELASTICSEARCH_CLANS_ALIAS"), "clashking_clans"),
		WarArchiveOrigin:             normalizeOrigin(firstNonEmpty(os.Getenv("WAR_ARCHIVE_ORIGIN"), "https://wars.clashk.ing")),
		BunnyAccessKey:               os.Getenv("BUNNY_ACCESS_KEY"),
		AIUsageSecret:                os.Getenv("AI_USAGE_SECRET"),
		Local:                        strings.EqualFold(os.Getenv("LOCAL"), "TRUE"),
		APIBotToken:                  os.Getenv("API_BOT_TOKEN"),
		DevUserID:                    os.Getenv("DEV_USER_ID"),
		DiscordBotToken:              os.Getenv("DISCORD_BOT_TOKEN"),
		ProxyOrigin:                  normalizeOrigin(os.Getenv("CLASHKING_PROXY_INTERNAL_ORIGIN")),
		DataEncryptionKey:            os.Getenv("DATA_ENCRYPTION_KEY"),
		JWTAccessSecret:              os.Getenv("JWT_ACCESS_SECRET"),
		JWTRefreshSecret:             os.Getenv("JWT_REFRESH_SECRET"),
		NativeTokenAudience:          firstNonEmpty(os.Getenv("NATIVE_TOKEN_AUDIENCE"), "clashking-native"),
		WebTokenAudience:             firstNonEmpty(os.Getenv("WEB_TOKEN_AUDIENCE"), "clashking-web"),
		LandingOrigin:                landingOrigin,
		DashboardOrigin:              dashboardOrigin,
		WebAllowedOrigins:            nonEmptyStrings(webAllowedOrigins...),
		DiscordRedirectURI:           appendOriginPath(dashboardOrigin, "/auth/callback"),
		DiscordClientID:              os.Getenv("DISCORD_CLIENT_ID"),
		DiscordClientSecret:          os.Getenv("DISCORD_CLIENT_SECRET"),
		SentryDSN:                    os.Getenv("SENTRY_DSN_API"),
		SentryDSNMobile:              os.Getenv("SENTRY_DSN_MOBILE"),
		StripeRestrictedKey:          os.Getenv("STRIPE_RESTRICTED_KEY"),
		StripeWebhookSecret:          os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripeMonthlyPriceID:         os.Getenv("STRIPE_MONTHLY_PRICE_ID"),
		StripeCheckoutSuccessURL:     appendOriginPath(dashboardOrigin, "/dashboard/settings?checkout=success"),
		StripeCheckoutCancelURL:      appendOriginPath(dashboardOrigin, "/dashboard/settings?checkout=cancelled"),
		StripePortalReturnURL:        appendOriginPath(dashboardOrigin, "/dashboard/settings"),
		AIRosterMaxPromptChars:       envInt("AI_ROSTER_MAX_PROMPT_CHARS", 12000),
		AIRosterMembershipMaxChanges: envInt("AI_ROSTER_MEMBERSHIP_MAX_CHANGES", 1000),
		RosterRefreshCooldownMinutes: envInt("ROSTER_REFRESH_COOLDOWN_MINUTES", 15),
		SMTPUsername:                 os.Getenv("SMTP_USERNAME"),
		SMTPPassword:                 os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:                     os.Getenv("SMTP_FROM_ADDRESS"),
		SMTPReplyTo:                  firstNonEmpty(os.Getenv("SMTP_REPLY_TO_ADDRESS"), "noreply@clashk.ing"),
		SMTPServer:                   firstNonEmpty(os.Getenv("SMTP_HOST"), "smtp.gmail.com"),
		SMTPPort:                     envInt("SMTP_PORT", 587),
		SMTPStartTLS:                 envBool("SMTP_STARTTLS", true),
		SMTPSSLTLS:                   envBool("SMTP_SSL_TLS", false),
	}
	if cfg.Local {
		cfg.ListenHost = "127.0.0.1"
		cfg.ListenPort = 8000
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
		"DATA_ENCRYPTION_KEY":             c.DataEncryptionKey,
		"JWT_ACCESS_SECRET":               c.JWTAccessSecret,
		"JWT_REFRESH_SECRET":              c.JWTRefreshSecret,
		"DISCORD_BOT_TOKEN":               c.DiscordBotToken,
		"DISCORD_CLIENT_ID":               c.DiscordClientID,
		"DISCORD_CLIENT_SECRET":           c.DiscordClientSecret,
		"API_BOT_TOKEN":                   c.APIBotToken,
		"CLASHKING_PROXY_INTERNAL_ORIGIN": c.ProxyOrigin,
		"CLASHKING_LANDING_ORIGIN":        c.LandingOrigin,
		"CLASHKING_DASHBOARD_ORIGIN":      c.DashboardOrigin,
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
		if strings.TrimSpace(c.ElasticsearchURL) == "" {
			return errors.New("ELASTICSEARCH_URL is required outside local mode")
		}
		if strings.TrimSpace(c.ElasticsearchAPIKey) == "" {
			return errors.New("ELASTICSEARCH_API_KEY is required outside local mode")
		}
		if strings.TrimSpace(c.ValkeyAddress) == "" {
			return errors.New("VALKEY_HOST is required outside local mode")
		}
		if strings.TrimSpace(c.ValkeyPassword) == "" {
			return errors.New("VALKEY_PASSWORD is required outside local mode")
		}
		if strings.TrimSpace(c.AIUsageSecret) == "" {
			return errors.New("AI_USAGE_SECRET is required outside local mode")
		}
		for key, value := range map[string]string{
			"SMTP_USERNAME":     c.SMTPUsername,
			"SMTP_PASSWORD":     c.SMTPPassword,
			"SMTP_FROM_ADDRESS": c.SMTPFrom,
			"SMTP_HOST":         c.SMTPServer,
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
	for key, value := range map[string]string{
		"ELASTICSEARCH_PLAYERS_ALIAS": c.ElasticsearchPlayersAlias,
		"ELASTICSEARCH_CLANS_ALIAS":   c.ElasticsearchClansAlias,
	} {
		if !validElasticsearchName(value) {
			return fmt.Errorf("%s contains unsupported characters", key)
		}
	}
	return nil
}

func validElasticsearchName(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 255 || value == "." || value == ".." || strings.ContainsRune("-_+", rune(value[0])) {
		return false
	}
	for _, char := range value {
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' || char == '-' || char == '_' || char == '.' {
			continue
		}
		return false
	}
	return true
}

func normalizeElasticsearchAlias(value, fallback string) string {
	return strings.TrimSpace(firstNonEmpty(value, fallback))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func normalizeOrigin(value string) string {
	return strings.TrimRight(strings.TrimSpace(value), "/")
}

func appendOriginPath(origin, path string) string {
	if origin == "" {
		return ""
	}
	return origin + path
}

func nonEmptyStrings(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func parseOrigins(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if origin := normalizeOrigin(part); origin != "" {
			result = append(result, origin)
		}
	}
	return result
}

func buildTimescaleURL(getenv func(string) string) string {
	host := strings.TrimSpace(getenv("TIMESCALE_HOST"))
	port := firstNonEmpty(getenv("TIMESCALE_PORT"), "5432")
	user := strings.TrimSpace(getenv("TIMESCALE_USERNAME"))
	password := getenv("TIMESCALE_PASSWORD")
	database := strings.TrimSpace(getenv("TIMESCALE_DATABASE"))

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

func buildValkeyAddress(getenv func(string) string) string {
	host := strings.TrimSpace(getenv("VALKEY_HOST"))
	if host == "" {
		return ""
	}
	return net.JoinHostPort(host, firstNonEmpty(getenv("VALKEY_PORT"), "6379"))
}

func validateTimescaleEnvironment(getenv func(string) string) error {
	required := []string{
		"TIMESCALE_HOST",
		"TIMESCALE_USERNAME",
		"TIMESCALE_PASSWORD",
		"TIMESCALE_DATABASE",
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
