package modelsv2

import "time"

const (
	SharedLinksAccessSelected            = "selected"
	SharedLinksAccessAllCurrentAndFuture = "all_current_and_future"
)

type SharedLinksApplication struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	DeveloperName *string `json:"developer_name,omitempty"`
}

type SharedLinksApplicationResponse struct {
	Application SharedLinksApplication `json:"application"`
	RedirectURI *string                `json:"redirect_uri,omitempty"`
}

type SharedLinksAccount struct {
	PlayerTag  string `json:"player_tag"`
	Name       string `json:"name"`
	IsVerified bool   `json:"is_verified"`
	Hidden     bool   `json:"hidden"`
}

type SharedLinksGrant struct {
	AccessMode         string    `json:"access_mode" enums:"selected,all_current_and_future"`
	SelectedPlayerTags []string  `json:"selected_player_tags"`
	ConnectedAt        time.Time `json:"connected_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SharedLinksConsentResponse struct {
	Application SharedLinksApplication `json:"application"`
	Accounts    []SharedLinksAccount   `json:"accounts"`
	Grant       *SharedLinksGrant      `json:"grant" extensions:"x-nullable"`
}

type SharedLinksGrantRequest struct {
	AccessMode string   `json:"access_mode" enums:"selected,all_current_and_future"`
	PlayerTags []string `json:"player_tags,omitempty"`
}

type SharedLinksConnection struct {
	Application SharedLinksApplication `json:"application"`
	Grant       SharedLinksGrant       `json:"grant"`
}

type SharedLinksConnectionsResponse struct {
	Items []SharedLinksConnection `json:"items"`
}

type SharedLinksLookupRequest struct {
	DiscordIDs []string `json:"discord_ids,omitempty"`
	PlayerTags []string `json:"player_tags,omitempty"`
}

type SharedLink struct {
	DiscordID  string `json:"discord_id"`
	PlayerTag  string `json:"player_tag"`
	IsVerified bool   `json:"is_verified"`
	Hidden     bool   `json:"hidden"`
}

type SharedLinksLookupResponse struct {
	Links []SharedLink `json:"links"`
}
