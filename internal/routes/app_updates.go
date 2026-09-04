package routes

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const installationHeader = "x-clashking-installation"

var (
	appUpdateVersionPattern     = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta)?$`)
	appUpdateSignaturePattern   = regexp.MustCompile(`^sig="[A-Za-z0-9+/]+={0,2}", keyid="main"$`)
	appUpdateRollbackKeyPattern = regexp.MustCompile(`^rollbacks\/(beta|production)\/[^/]+\/[^/]+\/(ios|android)-[0-9a-f-]{36}\.json$`)
)

type appUpdateDB interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

type appUpdateMarkerLoader interface {
	Load(context.Context, string, string) (appUpdateRelease, error)
	LoadRollback(context.Context, string) (appUpdatePlatform, error)
}

type appUpdateHTTPMarkerLoader struct {
	origin string
	client *http.Client
}

type appUpdateRelease struct {
	SchemaVersion   int                                `json:"schemaVersion"`
	Version         string                             `json:"version"`
	Track           string                             `json:"track"`
	Type            string                             `json:"type"`
	Platforms       map[string]appUpdatePlatform       `json:"platforms"`
	RollbackTargets map[string]appUpdateRollbackTarget `json:"rollbackTargets"`
}

type appUpdateRollbackTarget struct {
	Type      string                               `json:"type"`
	Platforms map[string]appUpdateRollbackPlatform `json:"platforms"`
}

type appUpdateRollbackPlatform struct {
	RuntimeVersion string `json:"runtimeVersion"`
	Key            string `json:"key"`
}

type appUpdatePlatform struct {
	RuntimeVersion string          `json:"runtimeVersion"`
	Manifest       json.RawMessage `json:"manifest"`
	Signature      string          `json:"signature"`
}

type appUpdateChannelState struct {
	ActiveVersion         string
	RollbackTargetVersion string
	BasisPoints           int
	Paused                bool
	From                  *int
	To                    *int
	StartsAt              *time.Time
	EndsAt                *time.Time
}

func appUpdateManifest(a apptypes.Deps) fiber.Handler {
	var database appUpdateDB
	if a.Store != nil {
		database = a.Store.SQL
	}
	loader := appUpdateHTTPMarkerLoader{
		origin: a.Config.AppUpdatesR2Origin,
		client: &http.Client{Timeout: 10 * time.Second},
	}
	return appUpdateManifestHandler(database, loader, time.Now)
}

func appUpdateManifestHandler(database appUpdateDB, loader appUpdateMarkerLoader, now func() time.Time) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if database == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update service is not configured")
		}
		if c.Get("expo-protocol-version") != "1" {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported Expo Updates protocol version")
		}

		platform := strings.ToLower(strings.TrimSpace(c.Get("expo-platform")))
		if platform != "ios" && platform != "android" {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported update platform")
		}
		runtimeVersion := strings.TrimSpace(c.Get("expo-runtime-version"))
		if runtimeVersion == "" || len(runtimeVersion) > 200 {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid Expo runtime version")
		}
		channel := strings.ToLower(strings.TrimSpace(c.Get("expo-channel-name")))
		if channel == "" {
			channel = "production"
		}
		if channel != "beta" && channel != "production" {
			return apptypes.Error(fiber.StatusBadRequest, "Unsupported update channel")
		}

		token, err := installationToken(c.Get(installationHeader))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid installation cohort token")
		}
		c.Set("expo-server-defined-headers", installationHeader+"=\""+token+"\"")
		c.Set("expo-protocol-version", "1")
		c.Set("expo-sfv-version", "0")
		c.Set(fiber.HeaderCacheControl, "private, max-age=0")

		state, err := loadAppUpdateChannel(c.UserContext(), database, channel, platform, runtimeVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return c.SendStatus(fiber.StatusNoContent)
		}
		if err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update service is unavailable")
		}
		currentUpdateID := nullableUpdateID(c.Get("expo-current-update-id"))
		if state.ActiveVersion == "" || state.Paused {
			return c.SendStatus(fiber.StatusNoContent)
		}

		basisPoints := effectiveRolloutBasisPoints(state, now().UTC())
		if rolloutBucket(state.ActiveVersion, token) >= basisPoints {
			return c.SendStatus(fiber.StatusNoContent)
		}

		release, err := loader.Load(c.UserContext(), channel, state.ActiveVersion)
		if err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update release is unavailable")
		}
		if release.SchemaVersion != 1 || release.Type != "ota" || release.Track != channel || release.Version != state.ActiveVersion || !validAppUpdateReleaseVersion(release.Version, channel, release.Type) {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update release marker is invalid")
		}
		update, servedVersion, err := selectAppUpdatePlatform(c.UserContext(), loader, release, state, platform)
		if err != nil || update.RuntimeVersion != runtimeVersion || len(update.Manifest) == 0 || !validAppUpdateSignature(update.Signature) {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update release marker is invalid")
		}
		update.Manifest, err = compactAppUpdateManifest(update.Manifest)
		if err != nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update manifest is invalid")
		}

		var manifestID struct {
			ID             string `json:"id"`
			RuntimeVersion string `json:"runtimeVersion"`
			Metadata       struct {
				Version      string `json:"version"`
				RollbackFrom string `json:"rollbackFrom"`
			} `json:"metadata"`
		}
		if json.Unmarshal(update.Manifest, &manifestID) != nil || manifestID.ID == "" || manifestID.RuntimeVersion != runtimeVersion || manifestID.Metadata.Version != servedVersion {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update manifest is invalid")
		}
		if state.RollbackTargetVersion != "" && manifestID.Metadata.RollbackFrom != state.ActiveVersion {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Update manifest is invalid")
		}
		if currentUpdateID != nil && manifestID.ID == currentUpdateID.String() {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return sendAppUpdateManifest(c, update.Manifest, update.Signature)
	}
}

func selectAppUpdatePlatform(ctx context.Context, loader appUpdateMarkerLoader, release appUpdateRelease, state appUpdateChannelState, platform string) (appUpdatePlatform, string, error) {
	if state.RollbackTargetVersion == "" {
		update, ok := release.Platforms[platform]
		if !ok {
			return appUpdatePlatform{}, "", errors.New("platform is not present in release")
		}
		return update, release.Version, nil
	}
	if state.RollbackTargetVersion == state.ActiveVersion {
		return appUpdatePlatform{}, "", errors.New("rollback target matches active release")
	}
	target, ok := release.RollbackTargets[state.RollbackTargetVersion]
	if !ok || !validAppUpdateReleaseVersion(state.RollbackTargetVersion, release.Track, target.Type) {
		return appUpdatePlatform{}, "", errors.New("rollback target is invalid")
	}
	reference, ok := target.Platforms[platform]
	expectedPrefix := fmt.Sprintf("rollbacks/%s/%s/%s/%s-", release.Track, release.Version, state.RollbackTargetVersion, platform)
	if !ok || !strings.HasPrefix(reference.Key, expectedPrefix) || !appUpdateRollbackKeyPattern.MatchString(reference.Key) {
		return appUpdatePlatform{}, "", errors.New("rollback platform is invalid")
	}
	update, err := loader.LoadRollback(ctx, reference.Key)
	if err != nil || update.RuntimeVersion != reference.RuntimeVersion {
		return appUpdatePlatform{}, "", errors.New("rollback descriptor is invalid")
	}
	return update, state.RollbackTargetVersion, nil
}

func validAppUpdateSignature(value string) bool {
	return appUpdateSignaturePattern.MatchString(value)
}

func compactAppUpdateManifest(manifest json.RawMessage) (json.RawMessage, error) {
	var compact bytes.Buffer
	if err := json.Compact(&compact, manifest); err != nil {
		return nil, err
	}
	return json.RawMessage(compact.String()), nil
}

func validAppUpdateReleaseVersion(version, channel, releaseType string) bool {
	match := appUpdateVersionPattern.FindStringSubmatch(version)
	if match == nil || (channel == "beta") != strings.HasSuffix(version, "-beta") {
		return false
	}
	return (releaseType == "native" && match[3] == "0") || (releaseType == "ota" && match[3] != "0")
}

func loadAppUpdateChannel(ctx context.Context, database appUpdateDB, channel, platform, runtimeVersion string) (appUpdateChannelState, error) {
	var state appUpdateChannelState
	err := database.QueryRow(ctx, `SELECT COALESCE(active_version, ''), COALESCE(rollback_target_version, ''), rollout_basis_points, paused,
        rollout_from_basis_points, rollout_to_basis_points, rollout_starts_at, rollout_ends_at
      FROM app_update_channels WHERE channel = $1 AND platform = $2 AND runtime_version = $3`,
		channel, platform, runtimeVersion,
	).Scan(&state.ActiveVersion, &state.RollbackTargetVersion, &state.BasisPoints, &state.Paused, &state.From, &state.To, &state.StartsAt, &state.EndsAt)
	return state, err
}

func installationToken(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value != "" {
		decoded, err := hex.DecodeString(value)
		if err != nil || len(decoded) != 16 {
			return "", errors.New("invalid token")
		}
		return strings.ToLower(value), nil
	}
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func nullableUpdateID(value string) *uuid.UUID {
	id, err := uuid.Parse(strings.TrimSpace(value))
	if err != nil {
		return nil
	}
	return &id
}

func effectiveRolloutBasisPoints(state appUpdateChannelState, at time.Time) int {
	if state.From == nil || state.To == nil || state.StartsAt == nil || state.EndsAt == nil {
		return clampBasisPoints(state.BasisPoints)
	}
	if !at.After(*state.StartsAt) {
		return clampBasisPoints(*state.From)
	}
	if !at.Before(*state.EndsAt) {
		return clampBasisPoints(*state.To)
	}
	progress := float64(at.Sub(*state.StartsAt)) / float64(state.EndsAt.Sub(*state.StartsAt))
	value := float64(*state.From) + float64(*state.To-*state.From)*progress
	return clampBasisPoints(int(value + 0.5))
}

func clampBasisPoints(value int) int {
	if value < 0 {
		return 0
	}
	if value > 10000 {
		return 10000
	}
	return value
}

func rolloutBucket(releaseID, token string) int {
	hash := sha256.Sum256([]byte(releaseID + ":" + token))
	return int(binary.BigEndian.Uint64(hash[:8]) % 10000)
}

func (l appUpdateHTTPMarkerLoader) Load(ctx context.Context, channel, version string) (appUpdateRelease, error) {
	if l.origin == "" {
		return appUpdateRelease{}, errors.New("R2 update origin is not configured")
	}
	if channel != "beta" && channel != "production" {
		return appUpdateRelease{}, errors.New("invalid channel")
	}
	if !appUpdateVersionPattern.MatchString(version) {
		return appUpdateRelease{}, errors.New("invalid version")
	}
	markerURL := strings.TrimRight(l.origin, "/") + "/releases/" + url.PathEscape(channel) + "/" + url.PathEscape(version) + "/release.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, markerURL, nil)
	if err != nil {
		return appUpdateRelease{}, err
	}
	res, err := l.client.Do(req)
	if err != nil {
		return appUpdateRelease{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return appUpdateRelease{}, fmt.Errorf("marker returned %s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return appUpdateRelease{}, err
	}
	var release appUpdateRelease
	if err := json.Unmarshal(body, &release); err != nil {
		return appUpdateRelease{}, err
	}
	return release, nil
}

func (l appUpdateHTTPMarkerLoader) LoadRollback(ctx context.Context, key string) (appUpdatePlatform, error) {
	if l.origin == "" {
		return appUpdatePlatform{}, errors.New("R2 update origin is not configured")
	}
	if !appUpdateRollbackKeyPattern.MatchString(key) {
		return appUpdatePlatform{}, errors.New("invalid rollback descriptor key")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(l.origin, "/")+"/"+key, nil)
	if err != nil {
		return appUpdatePlatform{}, err
	}
	res, err := l.client.Do(req)
	if err != nil {
		return appUpdatePlatform{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return appUpdatePlatform{}, fmt.Errorf("rollback descriptor returned %s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return appUpdatePlatform{}, err
	}
	var update appUpdatePlatform
	if err := json.Unmarshal(body, &update); err != nil {
		return appUpdatePlatform{}, err
	}
	return update, nil
}

func sendAppUpdateManifest(c *fiber.Ctx, manifest json.RawMessage, signature string) error {
	boundaryBytes := make([]byte, 12)
	if _, err := rand.Read(boundaryBytes); err != nil {
		return err
	}
	boundary := "expo-" + hex.EncodeToString(boundaryBytes)
	var body strings.Builder
	body.WriteString("--" + boundary + "\r\n")
	body.WriteString("content-disposition: form-data; name=\"manifest\"\r\n")
	body.WriteString("content-type: application/json; charset=utf-8\r\n")
	if signature != "" {
		body.WriteString("expo-signature: " + signature + "\r\n")
	}
	body.WriteString("\r\n")
	body.Write(manifest)
	body.WriteString("\r\n--" + boundary + "--\r\n")
	c.Set(fiber.HeaderContentType, "multipart/mixed; boundary="+boundary)
	return c.SendString(body.String())
}
