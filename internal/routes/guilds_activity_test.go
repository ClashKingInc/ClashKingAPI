package routes

import (
	"testing"
	"time"
)

func TestServerInactiveUsesLastCommandAt(t *testing.T) {
	cutoff := time.Date(2026, time.May, 6, 12, 0, 0, 0, time.UTC)
	before := cutoff.Add(-time.Second)
	atCutoff := cutoff
	after := cutoff.Add(time.Second)

	for name, test := range map[string]struct {
		hasBot        bool
		lastCommandAt *time.Time
		want          bool
	}{
		"missing command history": {hasBot: true, want: true},
		"older than cutoff":       {hasBot: true, lastCommandAt: &before, want: true},
		"exactly at cutoff":       {hasBot: true, lastCommandAt: &atCutoff, want: false},
		"newer than cutoff":       {hasBot: true, lastCommandAt: &after, want: false},
		"bot absent":              {hasBot: false, want: false},
	} {
		t.Run(name, func(t *testing.T) {
			if got := serverInactive(test.hasBot, test.lastCommandAt, cutoff); got != test.want {
				t.Fatalf("serverInactive() = %v, want %v", got, test.want)
			}
		})
	}
}
