package server

import "testing"

func TestCanonicalLogTypeScopeValidation(t *testing.T) {
	clanTag := "#2PP"
	for _, testCase := range []struct {
		name     string
		clanTag  *string
		logTypes []string
		wantErr  bool
	}{
		{name: "ban alert is clan scoped", clanTag: &clanTag, logTypes: []string{"ban_alert"}},
		{name: "ban alert rejects server scope", logTypes: []string{"ban_alert"}, wantErr: true},
		{name: "reddit feed is server scoped", logTypes: []string{"reddit_feed"}},
		{name: "reddit feed rejects clan scope", clanTag: &clanTag, logTypes: []string{"reddit_feed"}, wantErr: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateLogTypeScopes(testCase.clanTag, testCase.logTypes)
			if (err != nil) != testCase.wantErr {
				t.Fatalf("validateLogTypeScopes() error = %v, wantErr %v", err, testCase.wantErr)
			}
		})
	}
}

func TestNormalizeLogTypesAcceptsCanonicalWebhookTypes(t *testing.T) {
	got, err := normalizeLogTypes([]string{" ban_alert ", "reddit_feed", "ban_alert"})
	if err != nil {
		t.Fatalf("normalizeLogTypes() error = %v", err)
	}
	if len(got) != 2 || got[0] != "ban_alert" || got[1] != "reddit_feed" {
		t.Fatalf("normalizeLogTypes() = %#v", got)
	}
}
