package utils

import (
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/fernet/fernet-go"
)

var encryptionState struct {
	sync.RWMutex
	keys []*fernet.Key
}

func InitEncryption(encodedKey string) error {
	keys, err := fernet.DecodeKeys(strings.TrimSpace(encodedKey))
	if err != nil {
		return err
	}
	encryptionState.Lock()
	encryptionState.keys = keys
	encryptionState.Unlock()
	return nil
}

// EncryptToString preserves the historical Python storage format: a Fernet
// token wrapped in URL-safe base64 for text-only database columns.
func EncryptToString(value string) string {
	keys := encryptionKeys()
	if len(keys) == 0 {
		panic("encryption is not initialized")
	}
	token, err := fernet.EncryptAndSign([]byte(value), keys[0])
	if err != nil {
		panic(err)
	}
	return base64.URLEncoding.EncodeToString(token)
}

func DecryptString(value string) (string, error) {
	keys := encryptionKeys()
	if len(keys) == 0 {
		return "", errors.New("encryption is not initialized")
	}

	encoded := []byte(strings.TrimSpace(value))
	if plaintext := fernet.VerifyAndDecrypt(encoded, 0, keys); plaintext != nil {
		return string(plaintext), nil
	}

	decoded, err := base64.URLEncoding.DecodeString(string(encoded))
	if err != nil {
		return "", errors.New("invalid encrypted value")
	}
	if plaintext := fernet.VerifyAndDecrypt(decoded, 0*time.Second, keys); plaintext != nil {
		return string(plaintext), nil
	}

	return "", errors.New("invalid encrypted value")
}

func encryptionKeys() []*fernet.Key {
	encryptionState.RLock()
	defer encryptionState.RUnlock()
	return append([]*fernet.Key(nil), encryptionState.keys...)
}
