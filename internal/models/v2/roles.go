package modelsv2

type RoleResponse struct {
	Message  string `json:"message"`
	ServerID int    `json:"server_id"`
	RoleType string `json:"role_type"`
	RoleID   any    `json:"role_id"`
}

type RolesListResponse struct {
	ServerID int              `json:"server_id"`
	RoleType string           `json:"role_type"`
	Roles    []map[string]any `json:"roles"`
	Count    int              `json:"count"`
}

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

type RoleSettingsResponse struct {
	ServerID         int               `json:"server_id"`
	AutoEvalStatus   *bool             `json:"auto_eval_status,omitempty"`
	AutoEvalNickname *bool             `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers []string          `json:"autoeval_triggers,omitempty"`
	AutoevalLog      any               `json:"autoeval_log,omitempty"`
	BlacklistedRoles []any             `json:"blacklisted_roles,omitempty"`
	RoleTreatment    []string          `json:"role_treatment,omitempty"`
	CategoryRoles    map[string]string `json:"category_roles,omitempty"`
}

type RoleSettingsUpdate struct {
	AutoEvalStatus   *bool          `json:"auto_eval_status,omitempty"`
	Autoeval         *bool          `json:"autoeval,omitempty"`
	AutoEvalNickname *bool          `json:"auto_eval_nickname,omitempty"`
	AutoevalTriggers []string       `json:"autoeval_triggers,omitempty"`
	AutoevalLog      any            `json:"autoeval_log,omitempty"`
	BlacklistedRoles []any          `json:"blacklisted_roles,omitempty"`
	RoleTreatment    []string       `json:"role_treatment,omitempty"`
	CategoryRoles    map[string]any `json:"category_roles,omitempty"`
}

type AllRolesResponse struct {
	ServerID      int                         `json:"server_id"`
	Roles         map[string][]map[string]any `json:"roles"`
	CategoryRoles map[string]string           `json:"category_roles,omitempty"`
	TotalCount    int                         `json:"total_count"`
}
