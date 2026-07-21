package server

import (
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestValidateServerRoleRejectsRemovedFamilyOptions(t *testing.T) {
	tests := []modelsv2.ServerRole{
		{Type: "family", Option: "only_family", RoleID: "1", Mode: "both"},
		{Type: "clan_role", Option: "member", RoleID: "1", Mode: "both"},
	}
	for _, role := range tests {
		if err := validateServerRole(role); err == nil {
			t.Fatalf("validateServerRole(%+v) error = nil, want error", role)
		}
	}
}

func TestValidateServerRoleAllowsSupportedFamilyOptions(t *testing.T) {
	clanTag := "#2PP"
	tests := []modelsv2.ServerRole{
		{Type: "family", Option: "family", RoleID: "1", Mode: "both"},
		{Type: "family", Option: "not_family", RoleID: "2", Mode: "add"},
		{Type: "clan_role", Option: "member", ClanTag: &clanTag, RoleID: "3", Mode: "remove"},
	}
	for _, role := range tests {
		if err := validateServerRole(role); err != nil {
			t.Fatalf("validateServerRole(%+v) error = %v", role, err)
		}
	}
}
