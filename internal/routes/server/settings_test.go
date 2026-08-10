package server

import (
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
)

func TestNormalizedServerSettingUpdatesOnlyIncludesProvidedFields(t *testing.T) {
	embedColor := 2829617
	updates := normalizedServerSettingUpdates(modelsv2.ServerSettingsUpdate{EmbedColor: &embedColor})

	if len(updates) != 1 {
		t.Fatalf("embed-only patch produced %d updates, want 1: %#v", len(updates), updates)
	}
	if updates[0].column != "embed_color" || updates[0].value != "2829617" {
		t.Fatalf("unexpected embed-color update: %#v", updates[0])
	}
}

func TestNormalizedServerSettingUpdatesPreservesExplicitZeroValues(t *testing.T) {
	disabled := false
	zero := 0
	empty := ""
	updates := normalizedServerSettingUpdates(modelsv2.ServerSettingsUpdate{
		ChangeNickname: &disabled,
		AutoboardLimit: &zero,
		FamilyLabel:    &empty,
		LinkParse:      &modelsv2.LinkParseSettings{Clan: &disabled},
	})

	want := []serverSettingUpdate{
		{column: "change_nickname", value: false},
		{column: "autoboard_limit", value: 0},
		{column: "family_label", value: ""},
		{column: "link_parse_clan", value: false},
	}
	if len(updates) != len(want) {
		t.Fatalf("zero-value patch produced %d updates, want %d: %#v", len(updates), len(want), updates)
	}
	for index := range want {
		if updates[index].column != want[index].column || updates[index].value != want[index].value {
			t.Fatalf("update %d = %#v, want %#v", index, updates[index], want[index])
		}
	}
}
