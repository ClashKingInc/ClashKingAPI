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
	PlayerTag string `json:"player_tag"`
	Name      string `json:"name"`
	Hidden    bool   `json:"hidden"`
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
	DiscordID string `json:"discord_id"`
	PlayerTag string `json:"player_tag"`
}

type SharedLinksLookupResponse struct {
	Links []SharedLink `json:"links"`
}

type DeveloperApplication struct {
	ApplicationID    string     `json:"application_id"`
	ApplicationName  string     `json:"application_name"`
	DeveloperName    *string    `json:"developer_name"`
	ContactEmail     *string    `json:"contact_email"`
	RedirectURI      *string    `json:"redirect_uri"`
	TokenPrefix      string     `json:"token_prefix"`
	TokenLastUsedAt  *time.Time `json:"token_last_used_at"`
	CreatedByAdminID string     `json:"created_by_admin_id"`
	ConnectURL       string     `json:"connect_url"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	RevokedAt        *time.Time `json:"revoked_at"`
}

type DeveloperApplicationCreateRequest struct {
	ApplicationName  string  `json:"application_name"`
	DeveloperName    *string `json:"developer_name,omitempty"`
	ContactEmail     *string `json:"contact_email,omitempty"`
	RedirectURI      *string `json:"redirect_uri,omitempty"`
	CreatedByAdminID string  `json:"created_by_admin_id"`
}

type DeveloperApplicationUpdateRequest struct {
	ApplicationName *string `json:"application_name,omitempty"`
	DeveloperName   *string `json:"developer_name,omitempty" extensions:"x-nullable"`
	ContactEmail    *string `json:"contact_email,omitempty" extensions:"x-nullable"`
	RedirectURI     *string `json:"redirect_uri,omitempty" extensions:"x-nullable"`
}

type DeveloperApplicationCreateResponse struct {
	DeveloperApplication
	APIToken string `json:"api_token"`
}
