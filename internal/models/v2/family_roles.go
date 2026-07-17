package modelsv2

type FamilyRoleRequest struct {
	Role string `json:"role"`
	Type string `json:"type"`
}

type FamilyRolesResponse struct {
	ServerID            int      `json:"server_id"`
	FamilyRoles         []string `json:"family_roles"`
	NotFamilyRoles      []string `json:"not_family_roles"`
	OnlyFamilyRoles     []string `json:"only_family_roles"`
	FamilyMemberRoles   []string `json:"family_member_roles"`
	FamilyElderRoles    []string `json:"family_elder_roles"`
	FamilyColeaderRoles []string `json:"family_coleader_roles"`
	FamilyLeaderRoles   []string `json:"family_leader_roles"`
	IgnoredRoles        []string `json:"ignored_roles"`
}

type FamilyRoleOperationResponse struct {
	Message  string `json:"message"`
	ServerID int    `json:"server_id"`
	RoleType string `json:"role_type"`
	RoleID   string `json:"role_id"`
}
