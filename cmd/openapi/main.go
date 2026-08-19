package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/ClashKingInc/ClashKingAPI/internal/openapigen"
)

func main() {
	jsonDocument, yamlDocument, err := openapigen.Generate()
	if err != nil {
		fatal(err)
	}
	scalarDocument, err := openapigen.ScalarAdapter(jsonDocument)
	if err != nil {
		fatal(err)
	}

	for path, contents := range map[string][]byte{
		"internal/swaggerdocs/openapi.json":        jsonDocument,
		"internal/swaggerdocs/openapi.yaml":        yamlDocument,
		"internal/swaggerdocs/openapi.scalar.json": scalarDocument,
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			fatal(fmt.Errorf("create output directory for %s: %w", path, err))
		}
		if err := os.WriteFile(path, contents, 0o644); err != nil {
			fatal(fmt.Errorf("write %s: %w", path, err))
		}
		fmt.Println("generated", path)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "openapi:", err)
	os.Exit(1)
}
