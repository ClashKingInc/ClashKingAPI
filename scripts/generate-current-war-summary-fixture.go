//go:build ignore

// Generate a deterministic reference from the existing Go implementation, without network or SQL.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ClashKingInc/ClashKingAPI/internal/routes"
)

func main() {
	input, err := os.ReadFile("workers/api/test/fixtures/current-war-summary.input.json")
	if err != nil {
		panic(err)
	}
	var fixture struct {
		Group map[string]any   `json:"group"`
		Wars  []map[string]any `json:"wars"`
	}
	if err := json.Unmarshal(input, &fixture); err != nil {
		panic(err)
	}
	expected := routes.EnrichLeagueInfoForTest(fixture.Group, fixture.Wars)
	output, err := json.MarshalIndent(expected, "", "  ")
	if err != nil {
		panic(err)
	}
	path, err := filepath.Abs("workers/api/test/fixtures/current-war-summary.expected.json")
	if err != nil {
		panic(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "--check" {
		stored, err := os.ReadFile(path)
		if err != nil {
			panic(err)
		}
		if !bytes.Equal(bytes.TrimSpace(stored), output) {
			panic("Go current-war fixture is stale")
		}
		fmt.Println("Go current-war fixture matches the implementation")
		return
	}
	fmt.Println("*** Begin Patch")
	fmt.Println("*** Add File: " + path)
	for _, line := range strings.Split(string(output), "\n") {
		fmt.Println("+" + line)
	}
	fmt.Println("*** End Patch")
}
