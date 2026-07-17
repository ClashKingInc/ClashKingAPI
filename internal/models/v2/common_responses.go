package modelsv2

type CDNUploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
}

type PublicConfigResponse struct {
	SentryDSNMobile string `json:"sentry_dsn_mobile"`
}

type MobilePublicConfigResponse struct {
	SentryDSN string `json:"sentry_dsn"`
}
