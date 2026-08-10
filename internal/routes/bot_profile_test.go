package routes

import (
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
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

func TestBotProfilePaidFeatureBoundary(t *testing.T) {
	name := "ClashKing Beta"
	bio := "Family bot"
	avatar := "data:image/png;base64,YQ=="
	banner := "data:image/png;base64,Yg=="

	freeUpdates := []modelsv2.BotGuildProfileUpdate{
		{Name: &name},
		{ClearName: true},
	}
	for _, update := range freeUpdates {
		if botProfileUpdateRequiresSubscription(update) {
			t.Fatalf("name-only update unexpectedly requires a subscription: %#v", update)
		}
	}

	paidUpdates := []modelsv2.BotGuildProfileUpdate{
		{Bio: &bio},
		{Avatar: &avatar},
		{Banner: &banner},
		{ClearBio: true},
		{ClearAvatar: true},
		{ClearBanner: true},
		{Name: &name, Bio: &bio},
	}
	for _, update := range paidUpdates {
		if !botProfileUpdateRequiresSubscription(update) {
			t.Fatalf("paid profile update did not require a subscription: %#v", update)
		}
	}
}
