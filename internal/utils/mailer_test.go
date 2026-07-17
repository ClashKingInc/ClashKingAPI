package utils

import (
	"net/mail"
	"strings"
	"testing"
)

func TestRenderAuthEmailEscapesUserContent(t *testing.T) {
	body, err := renderAuthEmail(AuthEmail{
		Title:    "Verify your email",
		Greeting: `<script>alert("x")</script>`,
		Body:     "Use this code.",
		Code:     "123456",
	})
	if err != nil {
		t.Fatalf("render email: %v", err)
	}
	if strings.Contains(body, "<script>") {
		t.Fatal("rendered email contained unescaped HTML")
	}
	if !strings.Contains(body, "123456") || !strings.Contains(body, authEmailLogoURL) {
		t.Fatal("rendered email is missing the code or brand logo")
	}
}

func TestBuildMIMEMessageIncludesTextAndHTML(t *testing.T) {
	from := &mail.Address{Name: "ClashKing", Address: "noreply@clashk.ing"}
	to := &mail.Address{Address: "user@example.com"}
	replyTo := &mail.Address{Address: "support@clashk.ing"}
	message, err := buildMIMEMessage(from, to, replyTo, "Verification code", "plain code 123456", "<p>html code 123456</p>")
	if err != nil {
		t.Fatalf("build MIME message: %v", err)
	}
	raw := string(message)
	for _, expected := range []string{"multipart/alternative", "text/plain", "text/html", "support@clashk.ing"} {
		if !strings.Contains(raw, expected) {
			t.Fatalf("MIME message missing %q", expected)
		}
	}
}
