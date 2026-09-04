package routes

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type appUpdateTestDB struct {
	basisPoints    int
	activeVersion  string
	rollbackTarget string
}

func (d appUpdateTestDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return appUpdateTestRow{
		basisPoints:    d.basisPoints,
		activeVersion:  d.activeVersion,
		rollbackTarget: d.rollbackTarget,
	}
}

type appUpdateTestRow struct {
	basisPoints    int
	activeVersion  string
	rollbackTarget string
}

func (r appUpdateTestRow) Scan(dest ...any) error {
	activeVersion := r.activeVersion
	if activeVersion == "" {
		activeVersion = "1.1.1-beta"
	}
	*(dest[0].(*string)) = activeVersion
	*(dest[1].(*string)) = r.rollbackTarget
	*(dest[2].(*int)) = r.basisPoints
	*(dest[3].(*bool)) = false
	return nil
}

type appUpdateTestLoader struct {
	release  appUpdateRelease
	rollback appUpdatePlatform
}

func (l appUpdateTestLoader) Load(context.Context, string, string) (appUpdateRelease, error) {
	return l.release, nil
}

func (l appUpdateTestLoader) LoadRollback(context.Context, string) (appUpdatePlatform, error) {
	return l.rollback, nil
}

func TestEffectiveRolloutBasisPoints(t *testing.T) {
	start := time.Date(2026, 9, 2, 12, 0, 0, 0, time.UTC)
	end := start.Add(10 * time.Hour)
	from, to := 10, 5010
	state := appUpdateChannelState{BasisPoints: 9000, From: &from, To: &to, StartsAt: &start, EndsAt: &end}

	for _, test := range []struct {
		name string
		at   time.Time
		want int
	}{
		{"before", start.Add(-time.Minute), 10},
		{"middle", start.Add(5 * time.Hour), 2510},
		{"after", end.Add(time.Minute), 5010},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := effectiveRolloutBasisPoints(state, test.at); got != test.want {
				t.Fatalf("effective rollout = %d, want %d", got, test.want)
			}
		})
	}
}

func TestRolloutBucketIsStablePerRelease(t *testing.T) {
	first := rolloutBucket("1.1.1-beta", "00112233445566778899aabbccddeeff")
	if first != rolloutBucket("1.1.1-beta", "00112233445566778899aabbccddeeff") {
		t.Fatal("bucket changed for the same release and installation")
	}
	if first == rolloutBucket("1.1.2-beta", "00112233445566778899aabbccddeeff") {
		t.Fatal("bucket should be independently distributed for a new release")
	}
}

func TestInstallationTokenValidatesServerDefinedHeader(t *testing.T) {
	want := "00112233445566778899aabbccddeeff"
	if got, err := installationToken(want); err != nil || got != want {
		t.Fatalf("installationToken() = %q, %v", got, err)
	}
	if _, err := installationToken("not-a-token"); err == nil {
		t.Fatal("expected invalid cohort token to fail")
	}
	generated, err := installationToken("")
	if err != nil || len(generated) != 32 {
		t.Fatalf("generated token = %q, %v", generated, err)
	}
}

func TestAppUpdateSignatureValidation(t *testing.T) {
	if !validAppUpdateSignature(`sig="c2lnbmF0dXJl", keyid="main"`) {
		t.Fatal("expected a valid Expo signature")
	}
	if validAppUpdateSignature("sig=\"bad\r\ncontent-type: text/plain\"") {
		t.Fatal("expected a malformed signature to be rejected")
	}
}

func TestCompactAppUpdateManifestPreservesSignedRepresentation(t *testing.T) {
	pretty := json.RawMessage("{\n  \"id\": \"update-id\",\n  \"extra\": {\n    \"value\": \"kept\\u0020escaped\"\n  }\n}")
	got, err := compactAppUpdateManifest(pretty)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"update-id","extra":{"value":"kept\u0020escaped"}}`
	if string(got) != want {
		t.Fatalf("compact manifest = %s, want %s", got, want)
	}
}

func TestAppUpdateReleaseVersionConvention(t *testing.T) {
	for _, test := range []struct {
		version, channel, releaseType string
		want                          bool
	}{
		{"1.1.0-beta", "beta", "native", true},
		{"1.1.2-beta", "beta", "ota", true},
		{"1.1.0", "production", "native", true},
		{"1.1.2", "production", "ota", true},
		{"1.1.2-beta", "production", "ota", false},
		{"1.1.0-beta", "beta", "ota", false},
	} {
		if got := validAppUpdateReleaseVersion(test.version, test.channel, test.releaseType); got != test.want {
			t.Fatalf("validAppUpdateReleaseVersion(%q, %q, %q) = %v, want %v", test.version, test.channel, test.releaseType, got, test.want)
		}
	}
}

func TestAppUpdateManifestServesEligibleSignedMultipartResponse(t *testing.T) {
	manifest := json.RawMessage(`{
  "id": "11111111-2222-3333-4444-555555555555",
  "runtimeVersion": "runtime-ios",
  "metadata": { "version": "1.1.1-beta" }
}`)
	loader := appUpdateTestLoader{release: appUpdateRelease{
		SchemaVersion: 1,
		Version:       "1.1.1-beta",
		Track:         "beta",
		Type:          "ota",
		Platforms: map[string]appUpdatePlatform{
			"ios": {RuntimeVersion: "runtime-ios", Manifest: manifest, Signature: `sig="signed", keyid="main"`},
		},
	}}
	app := fiber.New()
	app.Get("/manifest", appUpdateManifestHandler(appUpdateTestDB{basisPoints: 10000}, loader, time.Now))
	req := httptest.NewRequest("GET", "/manifest", nil)
	req.Header.Set("expo-protocol-version", "1")
	req.Header.Set("expo-platform", "ios")
	req.Header.Set("expo-runtime-version", "runtime-ios")
	req.Header.Set("expo-channel-name", "beta")
	req.Header.Set(installationHeader, "00112233445566778899aabbccddeeff")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "multipart/mixed; boundary=") {
		t.Fatalf("status/content-type = %d %q", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if !strings.Contains(string(body), `expo-signature: sig="signed", keyid="main"`) || !strings.Contains(string(body), `"runtimeVersion":"runtime-ios"`) {
		t.Fatalf("multipart response is missing signature or manifest: %s", body)
	}
	if strings.Contains(string(body), `\n  "runtimeVersion"`) {
		t.Fatalf("multipart response did not compact the signed manifest: %s", body)
	}
	if got := res.Header.Get("expo-server-defined-headers"); got != `x-clashking-installation="00112233445566778899aabbccddeeff"` {
		t.Fatalf("server-defined headers = %q", got)
	}
}

func TestAppUpdateManifestServesPreSignedRollback(t *testing.T) {
	manifest, _ := json.Marshal(map[string]any{
		"id":             "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"runtimeVersion": "runtime-ios",
		"metadata": map[string]any{
			"version":      "1.1.1-beta",
			"rollbackFrom": "1.1.2-beta",
		},
	})
	rollbackUpdate := appUpdatePlatform{
		RuntimeVersion: "runtime-ios",
		Manifest:       manifest,
		Signature:      `sig="signed", keyid="main"`,
	}
	loader := appUpdateTestLoader{release: appUpdateRelease{
		SchemaVersion: 1,
		Version:       "1.1.2-beta",
		Track:         "beta",
		Type:          "ota",
		RollbackTargets: map[string]appUpdateRollbackTarget{
			"1.1.1-beta": {
				Type: "ota",
				Platforms: map[string]appUpdateRollbackPlatform{
					"ios": {
						RuntimeVersion: "runtime-ios",
						Key:            "rollbacks/beta/1.1.2-beta/1.1.1-beta/ios-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
					},
				},
			},
		},
	}, rollback: rollbackUpdate}
	app := fiber.New()
	app.Get("/manifest", appUpdateManifestHandler(appUpdateTestDB{
		basisPoints:    10000,
		activeVersion:  "1.1.2-beta",
		rollbackTarget: "1.1.1-beta",
	}, loader, time.Now))
	req := httptest.NewRequest("GET", "/manifest", nil)
	req.Header.Set("expo-protocol-version", "1")
	req.Header.Set("expo-platform", "ios")
	req.Header.Set("expo-runtime-version", "runtime-ios")
	req.Header.Set("expo-channel-name", "beta")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.Contains(string(body), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") {
		t.Fatalf("rollback response = %d %s", res.StatusCode, body)
	}
}

func TestAppUpdateManifestReturnsNoContentOutsideRollout(t *testing.T) {
	app := fiber.New()
	app.Get("/manifest", appUpdateManifestHandler(appUpdateTestDB{basisPoints: 0}, appUpdateTestLoader{}, time.Now))
	req := httptest.NewRequest("GET", "/manifest", nil)
	req.Header.Set("expo-protocol-version", "1")
	req.Header.Set("expo-platform", "android")
	req.Header.Set("expo-runtime-version", "runtime-android")
	req.Header.Set("expo-channel-name", "production")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 204 {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}
}
