package routes

import (
	"reflect"
	"testing"
)

func TestNotificationTagsNormalizesAndDeduplicates(t *testing.T) {
	got := notificationTags([]string{" #abc ", "ABC", "#def"})
	want := []string{"#ABC", "#DEF"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("notificationTags() = %#v, want %#v", got, want)
	}
}

func TestDefaultNotificationPreferencesUsesStableEmptyLists(t *testing.T) {
	got := defaultNotificationPreferences("device-1", "sandbox")
	if got.DeviceID != "device-1" || got.Environment != "sandbox" || !got.Enabled {
		t.Fatalf("unexpected defaults: %#v", got)
	}
	if got.EnabledTypes == nil || got.SelectedAccounts == nil || got.SelectedTownHalls == nil {
		t.Fatal("default preference lists must serialize as [] instead of null")
	}
}
