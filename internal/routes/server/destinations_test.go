package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	disgorest "github.com/disgoorg/disgo/rest"
)

const destinationTestServerID = 923764211845312533

func TestValidateDiscordDestinationChannels(t *testing.T) {
	text := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197801","type":0,"guild_id":"923764211845312533",
		"name":"logs","position":0,"permission_overwrites":[]
	}`)
	news := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197802","type":5,"guild_id":"923764211845312533",
		"name":"announcements","position":0,"permission_overwrites":[]
	}`)
	forum := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197806","type":15,"guild_id":"923764211845312533",
		"name":"forum","position":0,"permission_overwrites":[],"available_tags":[]
	}`)
	voice := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197803","type":2,"guild_id":"923764211845312533",
		"name":"voice","position":0,"permission_overwrites":[],"bitrate":64000,"user_limit":0
	}`)
	textThread := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197811","type":11,"guild_id":"923764211845312533",
		"parent_id":"1127708751479197801","owner_id":"1","name":"child",
		"message_count":0,"member_count":0,
		"thread_metadata":{"archived":false,"auto_archive_duration":1440,"archive_timestamp":"2026-01-01T00:00:00Z","locked":false}
	}`)
	forumPost := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197812","type":11,"guild_id":"923764211845312533",
		"parent_id":"1127708751479197806","owner_id":"1","name":"post",
		"message_count":0,"member_count":0,
		"thread_metadata":{"archived":false,"auto_archive_duration":1440,"archive_timestamp":"2026-01-01T00:00:00Z","locked":false}
	}`)
	otherParentThread := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197813","type":11,"guild_id":"923764211845312533",
		"parent_id":"1127708751479197899","owner_id":"1","name":"elsewhere",
		"message_count":0,"member_count":0,
		"thread_metadata":{"archived":false,"auto_archive_duration":1440,"archive_timestamp":"2026-01-01T00:00:00Z","locked":false}
	}`)
	otherGuildText := decodeDestinationTestChannel(t, `{
		"id":"1127708751479197804","type":0,"guild_id":"923764211845312534",
		"name":"other","position":0,"permission_overwrites":[]
	}`)

	for _, testCase := range []struct {
		name        string
		parent      discord.Channel
		thread      discord.Channel
		wantField   string
		wantMessage string
	}{
		{name: "text direct", parent: text},
		{name: "announcement direct", parent: news},
		{name: "text child thread", parent: text, thread: textThread},
		{name: "forum child post", parent: forum, thread: forumPost},
		{name: "forum requires post", parent: forum, wantField: "thread_id", wantMessage: "is required when channel_id is a forum channel"},
		{name: "voice parent rejected", parent: voice, wantField: "channel_id", wantMessage: "must be a text, announcement, or forum channel"},
		{name: "cross server parent rejected", parent: otherGuildText, wantField: "channel_id", wantMessage: "must belong to the requested server"},
		{name: "non thread child rejected", parent: text, thread: news, wantField: "thread_id", wantMessage: "must identify a Discord thread or forum post"},
		{name: "wrong parent rejected", parent: text, thread: otherParentThread, wantField: "thread_id", wantMessage: "must belong to channel_id"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateDiscordDestinationChannels(destinationTestServerID, testCase.parent, testCase.thread)
			if testCase.wantField == "" {
				if err != nil {
					t.Fatalf("validateDiscordDestinationChannels() error = %v", err)
				}
				return
			}
			assertDestinationFieldError(t, err, testCase.wantField, testCase.wantMessage)
		})
	}
}

func TestParseDiscordDestinationIDsReturnStructuredFieldErrors(t *testing.T) {
	if _, err := parseDiscordDestinationID("not-a-snowflake", "channel_id"); err == nil {
		t.Fatal("parseDiscordDestinationID() error = nil")
	} else {
		assertDestinationFieldError(t, err, "channel_id", "must be a valid Discord snowflake")
	}
	invalidThread := "0"
	if _, err := parseOptionalDiscordDestinationID(&invalidThread, "thread_id"); err == nil {
		t.Fatal("parseOptionalDiscordDestinationID() error = nil")
	} else {
		assertDestinationFieldError(t, err, "thread_id", "must be a valid Discord snowflake")
	}
}

func TestDiscordDestinationLookupNotFoundIsValidationError(t *testing.T) {
	err := discordDestinationLookupError(&disgorest.Error{
		Response: &http.Response{StatusCode: http.StatusNotFound},
	}, "thread_id", "Discord thread was not found", "Failed to fetch Discord thread")
	assertDestinationFieldError(t, err, "thread_id", "Discord thread was not found")
}

func decodeDestinationTestChannel(t *testing.T, raw string) discord.Channel {
	t.Helper()
	var decoded discord.UnmarshalChannel
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("decode Discord channel: %v", err)
	}
	return decoded.Channel
}

func assertDestinationFieldError(t *testing.T, err error, field, message string) {
	t.Helper()
	var appErr *apptypes.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("error = %T %v, want *utils.AppError", err, err)
	}
	if appErr.Status != http.StatusBadRequest || appErr.Code != modelsv2.ErrorCodeValidationFailed || appErr.Detail != "Invalid Discord destination" {
		t.Fatalf("AppError = %#v", appErr)
	}
	if len(appErr.Details) != 1 || appErr.Details[0].Field != field || appErr.Details[0].Message != message {
		t.Fatalf("AppError details = %#v, want %s: %s", appErr.Details, field, message)
	}
}
