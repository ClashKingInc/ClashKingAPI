package modelsv2

type DashboardAccessLevel string

const (
	DashboardAccessView   DashboardAccessLevel = "view"
	DashboardAccessManage DashboardAccessLevel = "manage"
)

type DashboardAccessGrant struct {
	RoleID      string               `json:"role_id"`
	Section     string               `json:"section"`
	AccessLevel DashboardAccessLevel `json:"access_level"`
}

type DashboardAccessRole struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Color    int    `json:"color"`
	Position int    `json:"position"`
}

type DashboardAccessConfig struct {
	ServerID string                 `json:"server_id"`
	Roles    []DashboardAccessRole  `json:"roles"`
	Grants   []DashboardAccessGrant `json:"grants"`
	Sections []string               `json:"sections"`
}

type DashboardAccessUpdate struct {
	Grants []DashboardAccessGrant `json:"grants"`
}

type DashboardCapabilities struct {
	ServerID   string            `json:"server_id"`
	FullAccess bool              `json:"full_access"`
	Sections   map[string]string `json:"sections"`
}

type BotGuildProfile struct {
	Name            string  `json:"name"`
	AvatarURL       *string `json:"avatar_url"`
	BannerURL       *string `json:"banner_url"`
	Bio             string  `json:"bio"`
	NameInherited   bool    `json:"name_inherited"`
	AvatarInherited bool    `json:"avatar_inherited"`
	BannerInherited bool    `json:"banner_inherited"`
	BioInherited    bool    `json:"bio_inherited"`
}

type BotGuildProfileUpdate struct {
	Name        *string `json:"name,omitempty"`
	Avatar      *string `json:"avatar,omitempty"`
	Banner      *string `json:"banner,omitempty"`
	Bio         *string `json:"bio,omitempty"`
	ClearName   bool    `json:"clear_name,omitempty"`
	ClearAvatar bool    `json:"clear_avatar,omitempty"`
	ClearBanner bool    `json:"clear_banner,omitempty"`
	ClearBio    bool    `json:"clear_bio,omitempty"`
}
