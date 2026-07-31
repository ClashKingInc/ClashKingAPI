package server

import (
	"os"
	"strings"
	"testing"
)

func TestReminderScannerAndResponsePreserveTypedThreadID(t *testing.T) {
	channelID := "1127708751479197806"
	threadID := "1127708751479197812"
	triggerTime := "30m"
	scanner := reminderScannerFunc(func(dest ...any) error {
		*(dest[0].(*string)) = "018f0000-0000-7000-8000-000000000001"
		*(dest[1].(*string)) = "War"
		*(dest[2].(**string)) = nil
		*(dest[3].(**string)) = &channelID
		*(dest[4].(**string)) = &threadID
		*(dest[5].(**string)) = &triggerTime
		*(dest[6].(**string)) = nil
		*(dest[7].(*[]int)) = []int{}
		*(dest[8].(*[]string)) = []string{}
		*(dest[9].(*[]string)) = []string{}
		*(dest[10].(*[]byte)) = nil
		*(dest[11].(*[]byte)) = nil
		*(dest[12].(**string)) = nil
		*(dest[13].(**string)) = nil
		return nil
	})

	row, err := scanReminderRows(scanner)
	if err != nil {
		t.Fatalf("scanReminderRows() error = %v", err)
	}
	config := reminderConfigFromDoc(row)
	if config.ChannelID == nil || *config.ChannelID != channelID {
		t.Fatalf("channel_id = %#v", config.ChannelID)
	}
	if config.ThreadID == nil || *config.ThreadID != threadID {
		t.Fatalf("thread_id = %#v", config.ThreadID)
	}
}

func TestReminderSQLUsesTypedChannelAndThreadColumns(t *testing.T) {
	source, err := os.ReadFile("reminders.go")
	if err != nil {
		t.Fatalf("read reminders.go: %v", err)
	}
	text := string(source)
	for _, required := range []string{
		"server_id, type, type_name, clan_tag, webhook_token, channel_id, thread_id,",
		"SELECT id::text, type_name, clan_tag, channel_id, thread_id, trigger_time",
		"thread_id = CASE WHEN $15 THEN $16 ELSE thread_id END",
		"validateReminderDestination(c, rt, serverID, body.ChannelID, body.ThreadID)",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("reminders.go is missing %q", required)
		}
	}
	if strings.Contains(text, "$5, NULL,\n") {
		t.Fatal("reminder INSERT still hard-codes thread_id to NULL")
	}
}

type reminderScannerFunc func(dest ...any) error

func (f reminderScannerFunc) Scan(dest ...any) error {
	return f(dest...)
}
