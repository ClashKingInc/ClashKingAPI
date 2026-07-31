package routes

import "testing"

func TestNormalizeDiscohookURLUsesNarrowShareAPI(t *testing.T) {
	resolved, err := normalizeDiscohookURL("https://discohook.app/?share=abc_123-Z")
	if err != nil {
		t.Fatalf("normalize share URL: %v", err)
	}
	if got, want := resolved.String(), "https://discohook.app/api/v1/share/abc_123-Z"; got != want {
		t.Fatalf("resolved URL = %q, want %q", got, want)
	}
}

func TestNormalizeDiscohookURLRejectsOpenProxyInputs(t *testing.T) {
	for _, input := range []string{
		"http://discohook.app/?share=abc",
		"https://attacker.example/?share=abc",
		"https://discohook.app/?share=../../admin",
		"https://user:password@discohook.app/?share=abc",
	} {
		if _, err := normalizeDiscohookURL(input); err == nil {
			t.Fatalf("expected %q to be rejected", input)
		}
	}
}
