package email

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"

	"github.com/DowLucas/chara/internal/config"
)

func TestFakeSender_RecordsMessages(t *testing.T) {
	f := &FakeSender{}
	ctx := context.Background()
	msg1 := Message{To: "a@example.com", Subject: "s1", TextBody: "b1"}
	msg2 := Message{To: "b@example.com", Subject: "s2", TextBody: "b2"}

	if err := f.Send(ctx, msg1); err != nil {
		t.Fatalf("Send msg1: %v", err)
	}
	if err := f.Send(ctx, msg2); err != nil {
		t.Fatalf("Send msg2: %v", err)
	}
	if got := len(f.Messages); got != 2 {
		t.Fatalf("Messages len = %d, want 2", got)
	}
	if f.Messages[0].To != "a@example.com" || f.Messages[1].Subject != "s2" {
		t.Errorf("recorded messages do not match: %+v", f.Messages)
	}
	f.Reset()
	if len(f.Messages) != 0 {
		t.Errorf("Reset did not clear messages: %+v", f.Messages)
	}
}

func TestFakeSender_ReturnsConfiguredError(t *testing.T) {
	want := errors.New("boom")
	f := &FakeSender{Err: want}
	if err := f.Send(context.Background(), Message{To: "a@example.com"}); !errors.Is(err, want) {
		t.Fatalf("Send err = %v, want %v", err, want)
	}
	// Even on error, the message should still be recorded so tests can assert
	// what we attempted to send.
	if len(f.Messages) != 1 {
		t.Errorf("Messages len = %d, want 1", len(f.Messages))
	}
}

func TestNoopSender_LogsButReturnsNil(t *testing.T) {
	n := NoopSender{}
	if err := n.Send(context.Background(), Message{To: "x@example.com", Subject: "s"}); err != nil {
		t.Errorf("NoopSender.Send returned %v, want nil", err)
	}
}

func TestNewSenderFromConfig_PicksSMTP(t *testing.T) {
	cfg := &config.Config{SMTPHost: "smtp.example.com", SMTPPort: 587, SMTPFrom: "noreply@example.com"}
	s := NewSenderFromConfig(cfg)
	if _, ok := s.(*SMTPSender); !ok {
		t.Fatalf("expected *SMTPSender, got %T", s)
	}
}

func TestNewSenderFromConfig_FallsBackToNoop(t *testing.T) {
	cfg := &config.Config{}
	s := NewSenderFromConfig(cfg)
	if _, ok := s.(NoopSender); !ok {
		t.Fatalf("expected NoopSender, got %T", s)
	}
}

func TestNewSenderFromConfig_ResendStubsToNoopWithWarning(t *testing.T) {
	// Resend isn't implemented yet — config with only RESEND_API_KEY set must
	// fall through to NoopSender (with a warning log) rather than crash.
	cfg := &config.Config{ResendAPIKey: "rk_test"}
	s := NewSenderFromConfig(cfg)
	if _, ok := s.(NoopSender); !ok {
		t.Fatalf("expected NoopSender (resend not implemented), got %T", s)
	}
}

func TestSMTPSender_BuildsValidMessage_TextOnly(t *testing.T) {
	s := &SMTPSender{From: "noreply@example.com", host: "smtp.example.com"}
	raw, err := s.buildMessage(Message{
		To:       "user@example.com",
		Subject:  "Hello",
		TextBody: "Hi there.\n",
	})
	if err != nil {
		t.Fatalf("buildMessage: %v", err)
	}
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("ReadMessage: %v\nraw:\n%s", err, raw)
	}
	if got := m.Header.Get("From"); got != "noreply@example.com" {
		t.Errorf("From = %q", got)
	}
	if got := m.Header.Get("To"); got != "user@example.com" {
		t.Errorf("To = %q", got)
	}
	if got := m.Header.Get("Subject"); got != "Hello" {
		t.Errorf("Subject = %q", got)
	}
	if m.Header.Get("Date") == "" {
		t.Errorf("Date missing")
	}
	if mid := m.Header.Get("Message-ID"); mid == "" || !strings.Contains(mid, "@example.com") {
		t.Errorf("Message-ID = %q", mid)
	}
	if got := m.Header.Get("MIME-Version"); got != "1.0" {
		t.Errorf("MIME-Version = %q", got)
	}
	ct := m.Header.Get("Content-Type")
	mt, _, err := mime.ParseMediaType(ct)
	if err != nil {
		t.Fatalf("ParseMediaType: %v", err)
	}
	if mt != "text/plain" {
		t.Errorf("Content-Type media type = %q, want text/plain", mt)
	}
	body, _ := io.ReadAll(m.Body)
	if !strings.Contains(string(body), "Hi there.") {
		t.Errorf("body = %q", body)
	}
}

func TestSMTPSender_BuildsValidMessage_MultipartAlternative(t *testing.T) {
	s := &SMTPSender{From: "noreply@example.com", host: "smtp.example.com"}
	raw, err := s.buildMessage(Message{
		To:       "user@example.com",
		Subject:  "Hello",
		TextBody: "plain text body",
		HTMLBody: "<p>html body</p>",
	})
	if err != nil {
		t.Fatalf("buildMessage: %v", err)
	}
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("ReadMessage: %v\nraw:\n%s", err, raw)
	}
	ct := m.Header.Get("Content-Type")
	mt, params, err := mime.ParseMediaType(ct)
	if err != nil {
		t.Fatalf("ParseMediaType: %v", err)
	}
	if mt != "multipart/alternative" {
		t.Fatalf("Content-Type media type = %q, want multipart/alternative", mt)
	}
	boundary := params["boundary"]
	if boundary == "" {
		t.Fatalf("missing boundary param")
	}
	mr := multipart.NewReader(m.Body, boundary)
	var parts []struct {
		ContentType string
		Body        string
	}
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("NextPart: %v", err)
		}
		b, _ := io.ReadAll(p)
		parts = append(parts, struct {
			ContentType string
			Body        string
		}{p.Header.Get("Content-Type"), string(b)})
	}
	if len(parts) != 2 {
		t.Fatalf("got %d parts, want 2: %+v", len(parts), parts)
	}
	if !strings.HasPrefix(parts[0].ContentType, "text/plain") {
		t.Errorf("part 0 ContentType = %q, want text/plain first (RFC 2046)", parts[0].ContentType)
	}
	if !strings.HasPrefix(parts[1].ContentType, "text/html") {
		t.Errorf("part 1 ContentType = %q, want text/html", parts[1].ContentType)
	}
	if !strings.Contains(parts[0].Body, "plain text body") {
		t.Errorf("text part body = %q", parts[0].Body)
	}
	if !strings.Contains(parts[1].Body, "<p>html body</p>") {
		t.Errorf("html part body = %q", parts[1].Body)
	}
}

func TestMagicLinkTemplate_ContainsLinkAndExpiry(t *testing.T) {
	link := "https://chara.example/api/auth/verify?token=abc123"
	text, html := MagicLinkBody(link, 15)
	if !strings.Contains(text, link) {
		t.Errorf("text body missing link: %s", text)
	}
	if !strings.Contains(text, "15 minutes") {
		t.Errorf("text body missing TTL: %s", text)
	}
	if !strings.Contains(html, link) {
		t.Errorf("html body missing link: %s", html)
	}
	if !strings.Contains(html, "15 minutes") {
		t.Errorf("html body missing TTL: %s", html)
	}
}
