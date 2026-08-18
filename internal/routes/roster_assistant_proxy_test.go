package routes

import "testing"

func TestRosterAIUsageCost(t *testing.T) {
	input, output, total := rosterAIUsageCost(100_000, 20_000, 10_000, 10_000)
	if input != "0.01690000" || output != "0.01200000" || total != "0.02890000" {
		t.Fatalf("unexpected Luna cost: input=%s output=%s total=%s", input, output, total)
	}
}

func TestRosterAIUsageCostLongContext(t *testing.T) {
	input, output, total := rosterAIUsageCost(300_000, 0, 0, 10_000)
	if input != "0.12000000" || output != "0.01800000" || total != "0.13800000" {
		t.Fatalf("unexpected long-context Luna cost: input=%s output=%s total=%s", input, output, total)
	}
}
