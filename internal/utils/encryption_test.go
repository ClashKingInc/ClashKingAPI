package utils

import (
	"encoding/base64"
	"strings"
	"testing"
)

const testEncryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

func TestEncryptionReadsHistoricalPythonFernetFormat(t *testing.T) {
	if err := InitEncryption(testEncryptionKey); err != nil {
		t.Fatalf("initialize encryption: %v", err)
	}
	const historical = "Z0FBQUFBQmxVX0VBUkRHcFlDZE9nTUNCNE9KMUJQQ3d5d0FQem1xdFBhN0FORkVuUEM3UlNZSWo0RjZBaFVwMGtjU3JOR3hjZkxJVEdBS3V3eXV0R1R4Yi1OZXIyQ01aQzh1a1REOWQwT1dpbHl6bzhwQW94ZkU9"
	got, err := DecryptString(historical)
	if err != nil {
		t.Fatalf("decrypt historical value: %v", err)
	}
	if got != "user@example.com" {
		t.Fatalf("unexpected plaintext %q", got)
	}
}

func TestEncryptionRoundTrip(t *testing.T) {
	if err := InitEncryption(testEncryptionKey); err != nil {
		t.Fatalf("initialize encryption: %v", err)
	}
	ciphertext := EncryptToString("refresh-token")
	if strings.Contains(ciphertext, "refresh-token") {
		t.Fatal("ciphertext exposed plaintext")
	}
	got, err := DecryptString(ciphertext)
	if err != nil {
		t.Fatalf("decrypt value: %v", err)
	}
	if got != "refresh-token" {
		t.Fatalf("unexpected plaintext %q", got)
	}
}

func TestEncryptionRejectsBase64Plaintext(t *testing.T) {
	if err := InitEncryption(testEncryptionKey); err != nil {
		t.Fatalf("initialize encryption: %v", err)
	}
	plaintext := base64.URLEncoding.EncodeToString([]byte("not-encrypted"))
	if _, err := DecryptString(plaintext); err == nil {
		t.Fatal("expected base64 plaintext to be rejected")
	}
}
