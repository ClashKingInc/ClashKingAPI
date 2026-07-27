package routes

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLiveActivitiesAreAbsentFromAPISourceAndPrivacyDocs(t *testing.T) {
	roots := []string{"..", "../../docs"}
	stale := []string{
		"mobile_" + "live_activities",
		"live_activity_" + "enabled",
		"live activit" + "ies",
	}

	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				if entry.Name() == ".git" {
					return filepath.SkipDir
				}
				return nil
			}
			if strings.HasSuffix(path, "_test.go") {
				return nil
			}
			switch filepath.Ext(path) {
			case ".go", ".md", ".json", ".yaml":
			default:
				return nil
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			source := strings.ToLower(string(raw))
			for _, term := range stale {
				if strings.Contains(source, term) {
					t.Errorf("%s retains removed Live Activity reference %q", path, term)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}
