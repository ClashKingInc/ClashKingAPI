package utils

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"github.com/ClashKingInc/ClashKingAPI/locales"
)

const authEmailLogoURL = "https://assets.clashk.ing/logos/crown-arrow-dark-bg/ClashKing-1.png"

type Mailer struct {
	cfg Config
}

type AuthEmail struct {
	Title       string
	Preheader   string
	Greeting    string
	Body        string
	Code        string
	Expiry      string
	Security    string
	Subject     string
	PlainAction string
	CodeLabel   string
	Footer      string
	Locale      string
}

func NewMailer(cfg Config) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) SendVerification(ctx context.Context, recipient, username, code, locale string) error {
	return m.sendAuthEmail(ctx, recipient, localizedAuthEmail(locale, username, code, "verification"))
}

func (m *Mailer) SendPasswordReset(ctx context.Context, recipient, username, code, locale string) error {
	return m.sendAuthEmail(ctx, recipient, localizedAuthEmail(locale, username, code, "password_reset"))
}

func localizedAuthEmail(locale, username, code, kind string) AuthEmail {
	catalog, err := locales.Default()
	if err != nil {
		panic(err)
	}
	locale = catalog.Resolve(locale)
	text := func(key string, params map[string]string) string { return catalog.Text(locale, key, params) }
	greetingKey := "email.common.greeting"
	params := map[string]string(nil)
	if username = strings.TrimSpace(username); username != "" {
		greetingKey = "email.common.greeting_named"
		params = map[string]string{"name": username}
	}
	prefix := "email." + kind + "."
	return AuthEmail{
		Subject:     text(prefix+"subject", nil),
		Title:       text(prefix+"heading", nil),
		Preheader:   text(prefix+"preheader", nil),
		Greeting:    text(greetingKey, params),
		Body:        text(prefix+"body", nil),
		Code:        code,
		Expiry:      text(prefix+"expiry", nil),
		Security:    text(prefix+"security", nil),
		PlainAction: text(prefix+"plain_action", nil),
		CodeLabel:   text("email.common.code_label", nil),
		Footer:      text("email.common.footer", nil),
		Locale:      locale,
	}
}

func (m *Mailer) sendAuthEmail(ctx context.Context, recipient string, content AuthEmail) error {
	if m == nil || (m.cfg.Local && strings.TrimSpace(m.cfg.SMTPUsername) == "") {
		return nil
	}
	recipientAddress, err := mail.ParseAddress(recipient)
	if err != nil {
		return fmt.Errorf("invalid recipient: %w", err)
	}
	senderAddress, err := mail.ParseAddress(m.cfg.SMTPFrom)
	if err != nil {
		return fmt.Errorf("invalid SMTP_FROM_ADDRESS: %w", err)
	}
	replyTo, err := mail.ParseAddress(m.cfg.SMTPReplyTo)
	if err != nil {
		return fmt.Errorf("invalid SMTP_REPLY_TO: %w", err)
	}

	htmlBody, err := renderAuthEmail(content)
	if err != nil {
		return err
	}
	plainBody := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s: %s\n\n%s\n\n%s\n\n%s\n", content.Title, content.Greeting, content.PlainAction, content.CodeLabel, content.Code, content.Expiry, content.Security, content.Footer)
	message, err := buildMIMEMessage(senderAddress, recipientAddress, replyTo, content.Subject, plainBody, htmlBody)
	if err != nil {
		return err
	}
	return m.deliver(ctx, senderAddress.Address, recipientAddress.Address, message)
}

func (m *Mailer) deliver(ctx context.Context, from, to string, message []byte) error {
	address := net.JoinHostPort(m.cfg.SMTPServer, fmt.Sprintf("%d", m.cfg.SMTPPort))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("connect to SMTP server: %w", err)
	}
	defer conn.Close()
	deadline := time.Now().Add(20 * time.Second)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	_ = conn.SetDeadline(deadline)

	tlsConfig := &tls.Config{ServerName: m.cfg.SMTPServer, MinVersion: tls.VersionTLS12}
	if m.cfg.SMTPSSLTLS {
		tlsConn := tls.Client(conn, tlsConfig)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return fmt.Errorf("establish SMTP TLS: %w", err)
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, m.cfg.SMTPServer)
	if err != nil {
		return fmt.Errorf("create SMTP client: %w", err)
	}
	defer client.Close()
	if m.cfg.SMTPStartTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("start SMTP TLS: %w", err)
		}
	}
	if m.cfg.SMTPUsername != "" {
		if err := client.Auth(smtp.PlainAuth("", m.cfg.SMTPUsername, m.cfg.SMTPPassword, m.cfg.SMTPServer)); err != nil {
			return fmt.Errorf("authenticate to SMTP server: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("set SMTP sender: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("set SMTP recipient: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("open SMTP message: %w", err)
	}
	if _, err := w.Write(message); err != nil {
		_ = w.Close()
		return fmt.Errorf("write SMTP message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("finish SMTP message: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("finish SMTP session: %w", err)
	}
	return nil
}

func buildMIMEMessage(from, to, replyTo *mail.Address, subject, plainBody, htmlBody string) ([]byte, error) {
	var body bytes.Buffer
	mixed := multipart.NewWriter(&body)
	fmt.Fprintf(&body, "From: %s\r\n", from.String())
	fmt.Fprintf(&body, "To: %s\r\n", to.String())
	fmt.Fprintf(&body, "Reply-To: %s\r\n", replyTo.String())
	fmt.Fprintf(&body, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", subject))
	fmt.Fprintf(&body, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&body, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", mixed.Boundary())
	for _, part := range []struct {
		contentType string
		body        string
	}{
		{"text/plain; charset=UTF-8", plainBody},
		{"text/html; charset=UTF-8", htmlBody},
	} {
		header := textproto.MIMEHeader{}
		header.Set("Content-Type", part.contentType)
		header.Set("Content-Transfer-Encoding", "quoted-printable")
		writer, err := mixed.CreatePart(header)
		if err != nil {
			return nil, err
		}
		quoted := quotedprintable.NewWriter(writer)
		if _, err := io.WriteString(quoted, part.body); err != nil {
			return nil, err
		}
		if err := quoted.Close(); err != nil {
			return nil, err
		}
	}
	if err := mixed.Close(); err != nil {
		return nil, err
	}
	return body.Bytes(), nil
}

func renderAuthEmail(content AuthEmail) (string, error) {
	var output bytes.Buffer
	err := authEmailTemplate.Execute(&output, content)
	return output.String(), err
}

var authEmailTemplate = template.Must(template.New("auth-email").Parse(`<!doctype html>
<html lang="{{.Locale}}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{.Title}}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;color:#171719;font-family:Roboto,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{.Preheader}}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dedee2;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0b0b0c;padding:22px 28px;border-bottom:4px solid #d90709;"><img src="` + authEmailLogoURL + `" width="174" alt="ClashKing" style="display:block;width:174px;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:32px 28px 12px;"><h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:0;color:#171719;">{{.Title}}</h1></td></tr>
<tr><td style="padding:8px 28px 0;font-size:16px;line-height:1.6;color:#333338;"><p style="margin:0 0 12px;">{{.Greeting}}</p><p style="margin:0;">{{.Body}}</p></td></tr>
<tr><td align="center" style="padding:28px;"><div style="display:inline-block;padding:18px 24px;border:2px solid #bf0000;border-radius:12px;background:#fff6f6;color:#a90000;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">{{.Code}}</div></td></tr>
<tr><td style="padding:0 28px 16px;font-size:14px;line-height:1.5;color:#55555c;"><p style="margin:0;font-weight:700;">{{.Expiry}}</p></td></tr>
<tr><td style="padding:0 28px 32px;font-size:14px;line-height:1.55;color:#55555c;"><div style="padding:14px 16px;background:#f2f7fb;border-left:4px solid #026cc2;border-radius:8px;">{{.Security}}</div></td></tr>
<tr><td style="padding:20px 28px;background:#f7f7f8;border-top:1px solid #e5e5e8;font-size:12px;line-height:1.5;color:#6a6a72;">{{.Footer}}</td></tr>
</table>
</td></tr></table>
</body></html>`))
