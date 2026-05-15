//go:build integration

package integration_test

// Fix #298 — GET /v2/server/:id/links must return linked accounts for ALL members,
// including accounts created by the Go API (stored with internal UUIDs), not only
// those from the legacy Python bot (stored with Discord snowflake IDs).

import (
	"fmt"
	"testing"
)

func TestServerLinks_Shape(t *testing.T) {
	sid := serverID(t)
	status, body := do(t, "GET", fmt.Sprintf("/v2/server/%s/links", sid), nil)
	requireStatus(t, status, 200, body)

	getSlice(t, body, "members")
	getFloat(t, body, "total_members")
	getFloat(t, body, "members_with_links")
	getFloat(t, body, "total_linked_accounts")
	getFloat(t, body, "verified_accounts")
}

func TestServerLinks_MembersHaveLinkedAccounts(t *testing.T) {
	sid := serverID(t)
	_, body := do(t, "GET", fmt.Sprintf("/v2/server/%s/links", sid), nil)
	members := getSlice(t, body, "members")

	for _, raw := range members {
		m, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("member is not an object: %T", raw)
		}
		if _, ok := m["user_id"].(string); !ok {
			t.Fatalf("member missing string user_id: %v", m)
		}
		accounts, ok := m["linked_accounts"].([]any)
		if !ok {
			t.Fatalf("member missing linked_accounts array: %v", m)
		}
		accountCount, ok := m["account_count"].(float64)
		if !ok {
			t.Fatalf("member missing account_count: %v", m)
		}
		if int(accountCount) != len(accounts) {
			t.Errorf("account_count %d != len(linked_accounts) %d for user %v",
				int(accountCount), len(accounts), m["user_id"])
		}
	}
}

func TestServerLinks_AccountsHaveRequiredFields(t *testing.T) {
	sid := serverID(t)
	_, body := do(t, "GET", fmt.Sprintf("/v2/server/%s/links", sid), nil)
	members := getSlice(t, body, "members")

	for _, raw := range members {
		m := raw.(map[string]any)
		for _, rawAcc := range m["linked_accounts"].([]any) {
			acc, ok := rawAcc.(map[string]any)
			if !ok {
				t.Fatalf("linked_account is not an object: %T", rawAcc)
			}
			if _, ok := acc["player_tag"]; !ok {
				t.Errorf("linked_account missing player_tag: %v", acc)
			}
			if _, ok := acc["is_verified"].(bool); !ok {
				t.Errorf("linked_account missing bool is_verified: %v", acc)
			}
		}
	}
}

func TestServerLinks_SearchNoMatch(t *testing.T) {
	sid := serverID(t)
	status, body := do(t, "GET", fmt.Sprintf("/v2/server/%s/links?search=ZZZZZZZ_no_match", sid), nil)
	requireStatus(t, status, 200, body)

	members := getSlice(t, body, "members")
	if len(members) != 0 {
		t.Errorf("expected 0 results for no-match search, got %d", len(members))
	}
}

func TestServerLinks_Pagination(t *testing.T) {
	sid := serverID(t)
	_, b1 := do(t, "GET", fmt.Sprintf("/v2/server/%s/links?limit=2&offset=0", sid), nil)
	_, b2 := do(t, "GET", fmt.Sprintf("/v2/server/%s/links?limit=2&offset=2", sid), nil)

	total := int(getFloat(t, b1, "total_members"))
	if total <= 2 {
		t.Skip("not enough members to test pagination")
	}

	p1 := getSlice(t, b1, "members")
	p2 := getSlice(t, b2, "members")

	ids1 := map[string]bool{}
	for _, raw := range p1 {
		ids1[raw.(map[string]any)["user_id"].(string)] = true
	}
	for _, raw := range p2 {
		id := raw.(map[string]any)["user_id"].(string)
		if ids1[id] {
			t.Errorf("user_id %q appears in both pages — pagination broken", id)
		}
	}
}
