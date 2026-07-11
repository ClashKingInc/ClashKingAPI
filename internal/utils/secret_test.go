package utils

import "testing"

func TestEncryptSecretRoundTrip(t *testing.T) {
	const token = "firebase-token-value-for-test"
	encrypted, err := EncryptSecret(token, "local-test-key")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if encrypted == token {
		t.Fatal("encrypted token must not equal plaintext")
	}
	decrypted, err := DecryptSecret(encrypted, "local-test-key")
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if decrypted != token {
		t.Fatalf("round trip mismatch: got %q", decrypted)
	}
}

func TestDecryptSecretRejectsWrongKey(t *testing.T) {
	encrypted, err := EncryptSecret("firebase-token-value-for-test", "correct-key")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if _, err := DecryptSecret(encrypted, "wrong-key"); err == nil {
		t.Fatal("expected decryption with wrong key to fail")
	}
}
