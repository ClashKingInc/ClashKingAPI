package routes

import (
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
)

func TestAddProfileNameMapsNameToDiscordNickname(t *testing.T) {
	payload := map[string]any{}
	name := "  ClashKing Beta  "
	if err := addProfileName(payload, &name); err != nil {
		t.Fatalf("addProfileName() error = %v", err)
	}
	if payload["nick"] != "ClashKing Beta" {
		t.Fatalf("nick = %#v, want ClashKing Beta", payload["nick"])
	}
}

func TestBotProfileResponseIncludesName(t *testing.T) {
	response := botProfileResponse(123, &apptypes.DiscordBotGuildProfile{Name: "ClashKing Beta", Bio: "Family bot", NameGuildProfile: true, BioGuildProfile: true})
	if response.Name != "ClashKing Beta" || response.Bio != "Family bot" || response.NameInherited || response.BioInherited || !response.AvatarInherited || !response.BannerInherited {
		t.Fatalf("botProfileResponse() = %#v", response)
	}
}
