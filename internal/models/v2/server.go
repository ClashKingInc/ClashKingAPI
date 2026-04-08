package modelsv2

type ServerPanelBody struct {
	EmbedName      *string  `json:"embed_name"`
	Buttons        []string `json:"buttons"`
	ButtonColor    string   `json:"button_color"`
	WelcomeChannel *int64   `json:"welcome_channel"`
}
