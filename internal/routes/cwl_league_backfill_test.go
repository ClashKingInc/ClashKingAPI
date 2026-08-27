package routes

import "testing"

func TestCWLWarSizeAssignmentsUsesConsistentAvailableWars(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "missing", roundTags: [][]string{{"#WAR1", "#0"}, {"#WAR2"}}},
		{cwlID: "present", warSize: 30, roundTags: [][]string{{"#WAR3"}}},
	}
	wars := map[string]cwlLeagueBackfillWar{
		"#WAR1": {tag: "#WAR1", size: 15},
		"#WAR2": {tag: "#WAR2", size: 15},
		"#WAR3": {tag: "#WAR3", size: 20},
	}
	assignments := cwlWarSizeAssignments(groups, wars)
	if assignments["missing"] != 15 {
		t.Fatalf("assignments = %#v", assignments)
	}
	if _, exists := assignments["present"]; exists {
		t.Fatalf("existing war size must not be overwritten: %#v", assignments)
	}
}

func TestCWLWarSizeAssignmentsRejectsConflictingWars(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "conflict", roundTags: [][]string{{"#WAR1"}, {"#WAR2"}}},
		{cwlID: "unavailable", roundTags: [][]string{{"#MISSING"}}},
	}
	wars := map[string]cwlLeagueBackfillWar{
		"#WAR1": {tag: "#WAR1", size: 15},
		"#WAR2": {tag: "#WAR2", size: 30},
	}
	assignments := cwlWarSizeAssignments(groups, wars)
	if len(assignments) != 0 {
		t.Fatalf("conflicting or unavailable sizes must remain unset: %#v", assignments)
	}
}

func TestCWLLeagueAssignmentsUsesShiftedHistoryThenWalksForward(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "aug", month: "2025-08", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "sep", month: "2025-09", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "oct", month: "2025-10", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{
		"2025-08": 48000014,
		"2025-09": 48000015,
	}, true)
	if assignments["aug"] != 48000014 || assignments["sep"] != 48000015 || assignments["oct"] != 48000016 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestCWLLeagueAssignmentsUsesUnrankedForMissingImportedMonth(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "jul", month: "2025-07", clanTags: make([]string, 8)},
		{cwlID: "aug", month: "2025-08", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{"2025-08": 48000015}, true)
	if assignments["jul"] != cwlUnrankedLeagueID || assignments["aug"] != 48000015 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestMajorityCWLLeagueIDUsesKnownVotesOnly(t *testing.T) {
	tests := []struct {
		name  string
		votes []int
		want  int
		ok    bool
	}{
		{name: "single known vote", votes: []int{48000010}, want: 48000010, ok: true},
		{name: "two of three", votes: []int{48000010, 48000011, 48000010}, want: 48000010, ok: true},
		{name: "tie", votes: []int{48000010, 48000011}, ok: false},
		{name: "no known votes", votes: nil, ok: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := majorityCWLLeagueID(test.votes)
			if got != test.want || ok != test.ok {
				t.Fatalf("majorityCWLLeagueID() = (%d, %v), want (%d, %v)", got, ok, test.want, test.ok)
			}
		})
	}
}

func TestPeerAnchorWalksForwardBeforeDirectHistoryCutoff(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "may", season: "2025-05", month: "2025-05", leagueID: 48000010, rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "jun", season: "2025-06", month: "2025-06", rank: 4, complete: true, clanTags: make([]string, 8)},
		{cwlID: "jul", season: "2025-07", month: "2025-07", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{}, false)
	if assignments["jun"] != 48000011 || assignments["jul"] != 48000011 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestPeerAnchorTakesPriorityOverMissingImportedMonth(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "may", season: "2025-05", month: "2025-05", leagueID: 48000010, rank: 4, complete: true, clanTags: make([]string, 8)},
		{cwlID: "jun", season: "2025-06", month: "2025-06", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{"2025-08": 48000012}, true)
	if assignments["jun"] != 48000010 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestNextCWLLeagueIDUsesHistoricalSpecialRules(t *testing.T) {
	tests := []struct {
		name     string
		leagueID int
		rank     int
		season   string
		want     int
	}{
		{name: "normal Master I only promotes first", leagueID: 48000015, rank: 2, season: "2026-04", want: 48000015},
		{name: "historical Master II second stays", leagueID: 48000014, rank: 2, season: "2025-09", want: 48000014},
		{name: "historical Crystal I second stays", leagueID: 48000012, rank: 2, season: "2026-04", want: 48000012},
		{name: "historical Champion I cannot promote", leagueID: 48000018, rank: 1, season: "2026-04", want: 48000018},
		{name: "historical Champion I sixth demotes", leagueID: 48000018, rank: 6, season: "2026-04", want: 48000017},
		{name: "special Master I promotes second", leagueID: 48000015, rank: 2, season: "2026-05", want: 48000016},
		{name: "current Master II promotes second", leagueID: 48000014, rank: 2, season: "2026-06", want: 48000015},
		{name: "special Champion I promotes fourth", leagueID: 48000018, rank: 4, season: "2026-07", want: 48000019},
		{name: "special Titan III demotes only last", leagueID: 48000019, rank: 7, season: "2026-07", want: 48000019},
		{name: "special Titan III demotes eighth", leagueID: 48000019, rank: 8, season: "2026-07", want: 48000018},
		{name: "special rules end after August", leagueID: 48000018, rank: 4, season: "2026-09", want: 48000018},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := nextCWLLeagueID(test.leagueID, test.rank, 8, test.season); got != test.want {
				t.Fatalf("nextCWLLeagueID() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestCalculateCWLLeagueBackfillRank(t *testing.T) {
	group := cwlLeagueBackfillGroup{
		state: "ended", clanTags: []string{"#A", "#B"}, roundTags: [][]string{{"#WAR"}},
	}
	rank, complete := calculateCWLLeagueBackfillRank("#A", group, map[string]cwlLeagueBackfillWar{
		"#WAR": {
			tag: "#WAR", state: "warended", clanTag: "#A", opponentTag: "#B",
			clanStars: 30, opponentStars: 29, clanDestruction: 90, opponentDestruction: 99,
		},
	})
	if !complete || rank != 1 {
		t.Fatalf("rank=%d complete=%v", rank, complete)
	}
}

func TestCalculateCWLLeagueBackfillRankPreservesExactTies(t *testing.T) {
	group := cwlLeagueBackfillGroup{
		state: "ended", clanTags: []string{"#A", "#B"}, roundTags: [][]string{{"#WAR"}},
	}
	rank, complete := calculateCWLLeagueBackfillRank("#B", group, map[string]cwlLeagueBackfillWar{
		"#WAR": {
			tag: "#WAR", state: "warEnded", clanTag: "#A", opponentTag: "#B",
			clanStars: 30, opponentStars: 30, clanDestruction: 90, opponentDestruction: 90,
		},
	})
	if !complete || rank != 1 {
		t.Fatalf("rank=%d complete=%v", rank, complete)
	}
}

func TestCalculateCWLSeasonSummaryUsesFinishedWars(t *testing.T) {
	group := cwlLeagueBackfillGroup{
		state: "ended", clanTags: []string{"#A", "#B"},
		roundTags: [][]string{{"#WAR1"}, {"#WAR2"}},
	}
	summary, ok := calculateCWLSeasonSummary("#A", group, map[string]cwlLeagueBackfillWar{
		"#WAR1": {
			tag: "#WAR1", state: "warEnded", clanTag: "#A", opponentTag: "#B",
			clanStars: 30, opponentStars: 29, clanDestruction: 90, opponentDestruction: 89,
		},
		"#WAR2": {
			tag: "#WAR2", state: "warEnded", clanTag: "#B", opponentTag: "#A",
			clanStars: 28, opponentStars: 28, clanDestruction: 80, opponentDestruction: 80,
		},
	})
	if !ok {
		t.Fatal("expected a calculated summary")
	}
	if summary.rank != 1 || summary.stars != 68 || summary.destruction != 85 ||
		summary.wins != 1 || summary.ties != 1 || summary.losses != 0 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestCalculateCWLSeasonSummaryRoundsDestructionToTwoDecimals(t *testing.T) {
	group := cwlLeagueBackfillGroup{
		state: "ended", clanTags: []string{"#A", "#B"}, roundTags: [][]string{{"#WAR"}},
	}
	summary, ok := calculateCWLSeasonSummary("#A", group, map[string]cwlLeagueBackfillWar{
		"#WAR": {
			tag: "#WAR", state: "warEnded", clanTag: "#A", opponentTag: "#B",
			clanStars: 30, opponentStars: 29,
			clanDestruction: 91.76190476190477, opponentDestruction: 90,
		},
	})
	if !ok || summary.destruction != 91.76 {
		t.Fatalf("destruction = %v, want 91.76", summary.destruction)
	}
}

func TestMissingAugustAnchorKeepsEveryForwardSeasonUnranked(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "aug", month: "2025-08", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "sep", month: "2025-09", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "oct", month: "2025-10", rank: 1, complete: true, clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{}, true)
	if assignments["aug"] != cwlUnrankedLeagueID || assignments["sep"] != cwlUnrankedLeagueID || assignments["oct"] != cwlUnrankedLeagueID {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestIncompleteAugustLeavesForwardSeasonsUnassigned(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "aug", month: "2025-08", complete: false, clanTags: make([]string, 8)},
		{cwlID: "sep", month: "2025-09", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "oct", month: "2025-10", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{"2025-08": 48000015}, true)
	if assignments["aug"] != 48000015 {
		t.Fatalf("August assignment = %d", assignments["aug"])
	}
	if _, exists := assignments["sep"]; exists {
		t.Fatalf("September should remain unassigned: %#v", assignments)
	}
	if _, exists := assignments["oct"]; exists {
		t.Fatalf("October should remain unassigned: %#v", assignments)
	}
}

func TestBackfillIncludesAugustAndStopsBeforeSeptember2026(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "jul", season: "2026-07", month: "2026-07", leagueID: 48000017, rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "aug", season: "2026-08", month: "2026-08", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "sep", season: "2026-09", month: "2026-09", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{}, false)
	if assignments["aug"] != 48000018 {
		t.Fatalf("August 2026 assignment = %d, want 48000018", assignments["aug"])
	}
	if _, exists := assignments["sep"]; exists {
		t.Fatalf("September 2026 should remain unassigned: %#v", assignments)
	}
}

func TestAugustAnchorRestartsAfterEarlierMissingHistory(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "jul", month: "2025-07", clanTags: make([]string, 8)},
		{cwlID: "aug", month: "2025-08", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "sep", month: "2025-09", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{"2025-08": 48000015}, true)
	if assignments["jul"] != cwlUnrankedLeagueID || assignments["aug"] != 48000015 || assignments["sep"] != 48000016 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestAdditionalEventInSameMonthAdvancesInEventOrder(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "jun", season: "2026-06", month: "2026-06", leagueID: 48000017, rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "jun-extra", season: "2026-06-17", month: "2026-06", rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "jul", season: "2026-07", month: "2026-07", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{}, false)
	if assignments["jun-extra"] != 48000018 || assignments["jul"] != 48000019 {
		t.Fatalf("assignments = %#v", assignments)
	}
}

func TestSkippedMonthsKeepWalkingFromLastPlayedEvent(t *testing.T) {
	groups := []cwlLeagueBackfillGroup{
		{cwlID: "jan", season: "2026-01", month: "2026-01", leagueID: 48000016, rank: 1, complete: true, clanTags: make([]string, 8)},
		{cwlID: "apr", season: "2026-04", month: "2026-04", clanTags: make([]string, 8)},
	}
	assignments := cwlLeagueAssignments(groups, map[string]int{}, false)
	if assignments["apr"] != 48000017 {
		t.Fatalf("assignments = %#v", assignments)
	}
}
