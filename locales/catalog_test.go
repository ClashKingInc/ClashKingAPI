package locales

import (
	"testing"
	"testing/fstest"
)

func TestCatalogLocaleResolutionInterpolationAndFallback(t *testing.T) {
	catalog, err := Load(fstest.MapFS{
		"en.json": &fstest.MapFile{Data: []byte(`{"hello":"Hello {{name}}","fallback":"English only"}`)},
		"fr.json": &fstest.MapFile{Data: []byte(`{"hello":"Bonjour {{name}}"}`)},
	})
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}
	if got := catalog.Text("en-US", "hello", map[string]string{"name": "Ada"}); got != "Hello Ada" {
		t.Fatalf("English interpolation = %q", got)
	}
	if got := catalog.Text("fr_CA", "hello", map[string]string{"name": "Ada"}); got != "Bonjour Ada" {
		t.Fatalf("French locale normalization/interpolation = %q", got)
	}
	if got := catalog.Text("fr", "fallback", nil); got != "English only" {
		t.Fatalf("missing-key fallback = %q", got)
	}
	if got := catalog.Text("zz-ZZ", "hello", map[string]string{"name": "Ada"}); got != "Hello Ada" {
		t.Fatalf("unsupported-locale fallback = %q", got)
	}
}

func TestDefaultEnglishCatalogLoads(t *testing.T) {
	catalog, err := Default()
	if err != nil {
		t.Fatalf("load embedded catalog: %v", err)
	}
	if got := catalog.Text("en", "email.verification.subject", nil); got != "Your ClashKing verification code" {
		t.Fatalf("verification subject = %q", got)
	}
}
