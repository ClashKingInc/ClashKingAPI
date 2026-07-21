package modelsv2

type DiscordRole struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       int    `json:"color"`
	Position    int    `json:"position"`
	Managed     bool   `json:"managed"`
	Mentionable bool   `json:"mentionable"`
}

type DiscordRolesResponse struct {
	ServerID int           `json:"server_id"`
	Roles    []DiscordRole `json:"roles"`
	Count    int           `json:"count"`
}

type ServerRole struct {
	ID        string  `json:"id"`
	ServerID  int     `json:"server_id"`
	ClanTag   *string `json:"clan_tag,omitempty"`
	Type      string  `json:"type"`
	Option    string  `json:"option"`
	RoleID    string  `json:"role_id"`
	Mode      string  `json:"mode"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type ServerRoleCreate struct {
	ClanTag *string `json:"clan_tag,omitempty"`
	Type    string  `json:"type"`
	Option  string  `json:"option"`
	RoleID  string  `json:"role_id"`
	Mode    string  `json:"mode"`
}

type ServerRoleUpdate struct {
	ClanTag *string `json:"clan_tag,omitempty"`
	Type    *string `json:"type,omitempty"`
	Option  *string `json:"option,omitempty"`
	RoleID  *string `json:"role_id,omitempty"`
	Mode    *string `json:"mode,omitempty"`
}

type ServerRolesResponse struct {
	ServerID int          `json:"server_id"`
	Roles    []ServerRole `json:"roles"`
	Count    int          `json:"count"`
}

type ServerRoleResponse struct {
	Message string     `json:"message"`
	Role    ServerRole `json:"role"`
}

type RoleSettingsResponse struct {
	ServerID         int      `json:"server_id"`
	AutoEvalStatus   *bool    `json:"auto_eval_status,omitempty"`
	AutoEvalNickname *bool    `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers []string `json:"autoeval_triggers,omitempty"`
	AutoevalLog      *string  `json:"autoeval_log,omitempty"`
	BlacklistedRoles []string `json:"blacklisted_roles,omitempty"`
}

type RoleSettingsUpdate struct {
	AutoEvalStatus   *bool    `json:"auto_eval_status,omitempty"`
	AutoEvalNickname *bool    `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers []string `json:"autoeval_triggers,omitempty"`
	AutoevalLog      *string  `json:"autoeval_log,omitempty"`
	BlacklistedRoles []string `json:"blacklisted_roles,omitempty"`
}
