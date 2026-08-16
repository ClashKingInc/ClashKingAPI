package routes

import (
	"context"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type refreshTokenExecCall struct {
	sql  string
	args []any
}

type fakeRefreshTokenStore struct {
	tx       *fakeRefreshTokenTx
	beginErr error
}

func (s *fakeRefreshTokenStore) Begin(context.Context) (pgx.Tx, error) {
	return s.tx, s.beginErr
}

type fakeRefreshTokenTx struct {
	pgx.Tx
	execCalls     []refreshTokenExecCall
	deleteRows    int64
	insertErr     error
	commitErr     error
	commitCalled  bool
	rollbackCalls int
}

func (tx *fakeRefreshTokenTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	tx.execCalls = append(tx.execCalls, refreshTokenExecCall{sql: sql, args: args})
	if len(tx.execCalls) == 1 {
		return pgconn.NewCommandTag("DELETE " + strconv.FormatInt(tx.deleteRows, 10)), nil
	}
	if tx.insertErr != nil {
		return pgconn.CommandTag{}, tx.insertErr
	}
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func (tx *fakeRefreshTokenTx) Commit(context.Context) error {
	tx.commitCalled = true
	return tx.commitErr
}

func (tx *fakeRefreshTokenTx) Rollback(context.Context) error {
	tx.rollbackCalls++
	return nil
}

func TestValidateAuthIdentityRejectsDiscordUserWithEmailFields(t *testing.T) {
	emailHash := "email-hash"
	err := validateAuthIdentity(&authUser{
		UserID:    "123456789",
		Provider:  authProviderDiscord,
		EmailHash: &emailHash,
	})
	if err == nil || err.Error() != "Discord auth user cannot persist email, username, or password" {
		t.Fatalf("expected Discord identity rejection, got %v", err)
	}
}

func TestParseRefreshTokenRejectsUnexpectedAlgorithm(t *testing.T) {
	cfg := apptypes.Config{JWTRefreshSecret: "refresh-secret"}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS512, apptypes.Claims{Sub: "user-1"}).SignedString([]byte(cfg.JWTRefreshSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := parseRefreshToken(apptypes.Deps{Config: cfg}, token); err == nil {
		t.Fatal("expected refresh token signed with HS512 to be rejected")
	}
}

func TestPersistDiscordAuthUserStoresIdentityOnly(t *testing.T) {
	tx := &fakeRefreshTokenTx{}
	user := &authUser{
		UserID:   "123456789",
		Provider: authProviderDiscord,
	}

	if err := persistAuthUser(context.Background(), tx, user); err != nil {
		t.Fatalf("persist Discord auth user: %v", err)
	}
	if len(tx.execCalls) != 1 {
		t.Fatalf("persist exec calls = %d, want 1", len(tx.execCalls))
	}
	call := tx.execCalls[0]
	if !strings.Contains(call.sql, "user_id, provider, email_hash, username, password_hash, created_at, updated_at") {
		t.Fatalf("unexpected auth user insert query: %s", call.sql)
	}
	for _, removed := range []string{"discord_user_id", "display_name", "verified", "profile", " data"} {
		if strings.Contains(call.sql, removed) {
			t.Fatalf("auth user query still references removed column %q: %s", removed, call.sql)
		}
	}
	if call.args[1] != authProviderDiscord ||
		call.args[2] != (*string)(nil) ||
		call.args[3] != (*string)(nil) ||
		call.args[4] != (*string)(nil) {
		t.Fatalf("Discord auth user persisted profile or password data: %#v", call.args)
	}
}

func TestAuthUserReadsOnlyFinalTypedColumns(t *testing.T) {
	for _, column := range []string{
		"user_id",
		"provider",
		"email_hash",
		"username",
		"password_hash",
		"created_at",
		"updated_at",
	} {
		if !strings.Contains(authUserSelectColumns, column) {
			t.Fatalf("auth user select columns omit %q: %s", column, authUserSelectColumns)
		}
	}
	for _, removed := range []string{"discord_user_id", "display_name", "verified", "profile", "data"} {
		if strings.Contains(authUserSelectColumns, removed) {
			t.Fatalf("auth user select columns still include %q: %s", removed, authUserSelectColumns)
		}
	}
}

func TestNewDiscordAuthUserUsesSnowflakeAsCanonicalID(t *testing.T) {
	user := newDiscordAuthUser("706149153431879760")
	if user.UserID != "706149153431879760" || user.Provider != authProviderDiscord {
		t.Fatalf("unexpected Discord auth identity: %#v", user)
	}
}

type fakeDiscordProfileProvider struct {
	profile     *discord.OAuth2User
	err         error
	accessToken string
}

func (p *fakeDiscordProfileProvider) GetCurrentUser(_ context.Context, accessToken string) (*discord.OAuth2User, error) {
	p.accessToken = accessToken
	return p.profile, p.err
}

func TestLoadDiscordAuthUserInfoUsesCurrentDeviceAndLiveProfile(t *testing.T) {
	user := &authUser{
		UserID:   "123456789",
		Provider: authProviderDiscord,
	}
	provider := &fakeDiscordProfileProvider{profile: &discord.OAuth2User{
		User: discord.User{
			ID:       snowflake.ID(123456789),
			Username: "live-discord-user",
		},
	}}
	var loadedUserID, loadedDeviceID string
	info, err := loadDiscordAuthUserInfo(
		context.Background(),
		user,
		"device-1",
		func(_ context.Context, userID, deviceID string) (string, error) {
			loadedUserID = userID
			loadedDeviceID = deviceID
			return "decrypted-live-access-token", nil
		},
		provider,
	)
	if err != nil {
		t.Fatalf("load Discord auth user info: %v", err)
	}
	if loadedUserID != user.UserID || loadedDeviceID != "device-1" {
		t.Fatalf("loaded credential for user=%q device=%q", loadedUserID, loadedDeviceID)
	}
	if provider.accessToken != "decrypted-live-access-token" {
		t.Fatalf("Discord profile access token = %q", provider.accessToken)
	}
	if info.UserID != user.UserID || info.Username != "live-discord-user" ||
		len(info.AuthMethods) != 1 || info.AuthMethods[0] != "discord" {
		t.Fatalf("unexpected live Discord user info: %#v", info)
	}
}

func TestLoadDiscordAuthUserInfoRejectsMissingDeviceIdentity(t *testing.T) {
	loaderCalled := false
	_, err := loadDiscordAuthUserInfo(
		context.Background(),
		&authUser{UserID: "123456789", Provider: authProviderDiscord},
		"",
		func(context.Context, string, string) (string, error) {
			loaderCalled = true
			return "", nil
		},
		&fakeDiscordProfileProvider{},
	)
	if err == nil {
		t.Fatal("expected missing device identity to be rejected")
	}
	if loaderCalled {
		t.Fatal("credential loader was called without a device identity")
	}
}

func TestPasswordResetCodeHashIsSecretBoundAndOpaque(t *testing.T) {
	emailHash := "email-hash"
	code := "123456"
	deps := apptypes.Deps{Config: apptypes.Config{JWTAccessSecret: "server-secret"}}

	codeHash := authCodeHash(deps, emailHash, code)
	if codeHash == code {
		t.Fatal("password reset code was stored without hashing")
	}
	if _, err := hex.DecodeString(codeHash); err != nil || len(codeHash) != sha256HexLength {
		t.Fatalf("password reset code hash is not a SHA-256 hex digest: %q", codeHash)
	}
	if codeHash != authCodeHash(deps, emailHash, code) {
		t.Fatal("password reset code hash is not deterministic")
	}
	if codeHash == authCodeHash(apptypes.Deps{Config: apptypes.Config{JWTAccessSecret: "different-secret"}}, emailHash, code) {
		t.Fatal("password reset code hash is not bound to the server secret")
	}
	if codeHash == authCodeHash(deps, "different-email-hash", code) {
		t.Fatal("password reset code hash is not bound to the email identity")
	}
}

func TestRotateRefreshTokenAtomicallyDeletesAndInsertsHashedTokens(t *testing.T) {
	tx := &fakeRefreshTokenTx{deleteRows: 1}
	store := &fakeRefreshTokenStore{tx: tx}
	expiry := time.Now().UTC().Add(30 * 24 * time.Hour).Truncate(time.Second)

	if err := rotateRefreshTokenInStore(
		context.Background(),
		store,
		"raw-old-refresh-token",
		"raw-new-refresh-token",
		"user-1",
		"device-1",
		expiry,
	); err != nil {
		t.Fatalf("rotate refresh token: %v", err)
	}

	if !tx.commitCalled {
		t.Fatal("rotation did not commit")
	}
	if tx.rollbackCalls != 1 {
		t.Fatalf("deferred rollback calls = %d, want 1", tx.rollbackCalls)
	}
	if len(tx.execCalls) != 2 {
		t.Fatalf("transaction exec calls = %d, want 2", len(tx.execCalls))
	}
	deleteCall, insertCall := tx.execCalls[0], tx.execCalls[1]
	if !strings.Contains(deleteCall.sql, "DELETE FROM auth_refresh_tokens") ||
		strings.Contains(deleteCall.sql, "revoked_at") {
		t.Fatalf("unexpected rotation delete query: %s", deleteCall.sql)
	}
	if !strings.Contains(insertCall.sql, "token_hash, user_id, device_id, expires_at") {
		t.Fatalf("unexpected rotation insert query: %s", insertCall.sql)
	}
	for _, query := range []string{deleteCall.sql, insertCall.sql} {
		for _, removed := range []string{"revoked_at", "data", "created_at"} {
			if strings.Contains(query, removed) {
				t.Fatalf("rotation query still references removed column %q: %s", removed, query)
			}
		}
	}
	if deleteCall.args[0] != tokenHash("raw-old-refresh-token") ||
		insertCall.args[0] != tokenHash("raw-new-refresh-token") {
		t.Fatal("rotation did not use refresh-token hashes")
	}
	for _, call := range tx.execCalls {
		for _, arg := range call.args {
			if arg == "raw-old-refresh-token" || arg == "raw-new-refresh-token" {
				t.Fatal("rotation passed a raw refresh token to SQL")
			}
		}
	}
	if insertCall.args[3] != expiry {
		t.Fatalf("persisted replacement expiry = %v, want %v", insertCall.args[3], expiry)
	}
}

func TestPersistRefreshTokenStoresOnlyHashAndFinalColumns(t *testing.T) {
	tx := &fakeRefreshTokenTx{}
	expiry := time.Now().UTC().Add(30 * 24 * time.Hour).Truncate(time.Second)
	rawToken := "raw-refresh-token"

	if err := persistRefreshToken(
		context.Background(),
		tx,
		tokenHash(rawToken),
		"user-1",
		"device-1",
		expiry,
	); err != nil {
		t.Fatalf("persist refresh token: %v", err)
	}
	if len(tx.execCalls) != 1 {
		t.Fatalf("persist exec calls = %d, want 1", len(tx.execCalls))
	}
	call := tx.execCalls[0]
	if !strings.Contains(call.sql, "token_hash, user_id, device_id, expires_at") {
		t.Fatalf("unexpected refresh-token insert query: %s", call.sql)
	}
	for _, removed := range []string{"revoked_at", "data", "created_at"} {
		if strings.Contains(call.sql, removed) {
			t.Fatalf("refresh-token insert still references removed column %q: %s", removed, call.sql)
		}
	}
	if call.args[0] != tokenHash(rawToken) {
		t.Fatalf("persisted token hash = %v, want %s", call.args[0], tokenHash(rawToken))
	}
	for _, arg := range call.args {
		if arg == rawToken {
			t.Fatal("raw refresh token was passed to SQL")
		}
	}
	if call.args[3] != expiry {
		t.Fatalf("persisted expiry = %v, want %v", call.args[3], expiry)
	}
}

func TestRotateRefreshTokenRollsBackWhenReplacementInsertFails(t *testing.T) {
	insertErr := errors.New("insert failed")
	tx := &fakeRefreshTokenTx{deleteRows: 1, insertErr: insertErr}
	store := &fakeRefreshTokenStore{tx: tx}

	err := rotateRefreshTokenInStore(
		context.Background(),
		store,
		"raw-old-refresh-token",
		"raw-new-refresh-token",
		"user-1",
		"device-1",
		time.Now().UTC().Add(30*24*time.Hour),
	)
	if !errors.Is(err, insertErr) {
		t.Fatalf("rotation error = %v, want %v", err, insertErr)
	}
	if tx.commitCalled {
		t.Fatal("failed rotation committed")
	}
	if tx.rollbackCalls != 1 {
		t.Fatalf("failed rotation rollback calls = %d, want 1", tx.rollbackCalls)
	}
}

func TestRotateRefreshTokenRejectsAlreadyConsumedToken(t *testing.T) {
	tx := &fakeRefreshTokenTx{deleteRows: 0}
	store := &fakeRefreshTokenStore{tx: tx}

	err := rotateRefreshTokenInStore(
		context.Background(),
		store,
		"raw-old-refresh-token",
		"raw-new-refresh-token",
		"user-1",
		"device-1",
		time.Now().UTC().Add(30*24*time.Hour),
	)
	if !errors.Is(err, errRefreshTokenConsumed) {
		t.Fatalf("rotation error = %v, want already-consumed error", err)
	}
	if tx.commitCalled || len(tx.execCalls) != 1 || tx.rollbackCalls != 1 {
		t.Fatalf(
			"already-consumed rotation state: committed=%v execs=%d rollbacks=%d",
			tx.commitCalled,
			len(tx.execCalls),
			tx.rollbackCalls,
		)
	}
}

func TestPasswordResetDeletesAllUserRefreshTokens(t *testing.T) {
	if !strings.Contains(deleteUserRefreshTokensQuery, "WHERE user_id = $1") ||
		strings.Contains(deleteUserRefreshTokensQuery, "device_id") ||
		strings.Contains(deleteUserRefreshTokensQuery, "token_hash") {
		t.Fatalf(
			"password-reset session deletion is not scoped to every user token: %s",
			deleteUserRefreshTokensQuery,
		)
	}
}

func TestPrivacySafeUserExportsNoRemovedProfileOrCredentialFields(t *testing.T) {
	user := &authUser{
		UserID:    "123456789",
		Provider:  authProviderDiscord,
		CreatedAt: time.Unix(10, 0).UTC(),
		UpdatedAt: time.Unix(20, 0).UTC(),
	}
	export := privacySafeUser(user)
	if export["user_id"] != user.UserID || export["provider"] != authProviderDiscord {
		t.Fatalf("unexpected safe user export: %#v", export)
	}
	for _, removed := range []string{
		"display_name",
		"verified",
		"profile",
		"data",
		"password_hash",
		"email_hash",
		"avatar_url",
	} {
		if _, ok := export[removed]; ok {
			t.Fatalf("safe user export still includes %q: %#v", removed, export)
		}
	}
}

const sha256HexLength = 64
