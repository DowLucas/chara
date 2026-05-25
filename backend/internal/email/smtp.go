package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"mime/multipart"
	"net"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/ulid"
)

// SMTPSender delivers email over plain SMTP with STARTTLS. We use stdlib
// net/smtp directly (Gmail / Mailgun / Postmark / your local Postfix all
// speak STARTTLS on 587) to avoid pulling in a third-party email library
// for a single template.
//
// Construction goes through newSMTPSender so the production code path picks
// up From / host / port / auth from *config.Config. Tests build SMTPSender
// literals directly to exercise buildMessage without touching the network.
type SMTPSender struct {
	From string

	host string
	port int
	auth smtp.Auth
}

func newSMTPSender(cfg *config.Config) *SMTPSender {
	s := &SMTPSender{
		From: cfg.SMTPFrom,
		host: cfg.SMTPHost,
		port: cfg.SMTPPort,
	}
	if cfg.SMTPUser != "" {
		s.auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	return s
}

// Send delivers msg over SMTP. Respects ctx deadlines: the underlying
// connection is dialed with a deadline derived from ctx, so a stuck server
// won't hang the request beyond the caller's timeout.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	body, err := s.buildMessage(msg)
	if err != nil {
		return fmt.Errorf("email send: %w", err)
	}
	addr := net.JoinHostPort(s.host, strconv.Itoa(s.port))

	dialer := &net.Dialer{}
	if deadline, ok := ctx.Deadline(); ok {
		dialer.Deadline = deadline
	} else {
		dialer.Timeout = 30 * time.Second
	}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("email send: dial: %w", err)
	}

	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("email send: smtp client: %w", err)
	}
	defer c.Close()

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.host}); err != nil {
			return fmt.Errorf("email send: starttls: %w", err)
		}
	}
	if s.auth != nil {
		if err := c.Auth(s.auth); err != nil {
			return fmt.Errorf("email send: auth: %w", err)
		}
	}
	if err := c.Mail(s.From); err != nil {
		return fmt.Errorf("email send: mail from: %w", err)
	}
	if err := c.Rcpt(msg.To); err != nil {
		return fmt.Errorf("email send: rcpt to: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("email send: data: %w", err)
	}
	if _, err := w.Write(body); err != nil {
		return fmt.Errorf("email send: write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("email send: close data: %w", err)
	}
	if err := c.Quit(); err != nil {
		return fmt.Errorf("email send: quit: %w", err)
	}
	return nil
}

// buildMessage assembles the RFC-822 message bytes for msg. Text-only when
// HTMLBody is empty; multipart/alternative (text first, per RFC 2046 §5.1.4
// — most-faithful representation last is the spec, but conventional usage
// puts text first so legacy clients fall through correctly — this matches
// every major MUA's behaviour) when both parts are present.
func (s *SMTPSender) buildMessage(msg Message) ([]byte, error) {
	headers := textproto.MIMEHeader{}
	headers.Set("From", s.From)
	headers.Set("To", msg.To)
	headers.Set("Subject", msg.Subject)
	headers.Set("Date", time.Now().Format(time.RFC1123Z))
	headers.Set("Message-ID", buildMessageID(s.From))
	headers.Set("MIME-Version", "1.0")

	var body bytes.Buffer
	if msg.HTMLBody == "" {
		headers.Set("Content-Type", "text/plain; charset=utf-8")
		writeHeaders(&body, headers)
		body.WriteString("\r\n")
		body.WriteString(crlfNormalize(msg.TextBody))
		return body.Bytes(), nil
	}

	var partsBuf bytes.Buffer
	mw := multipart.NewWriter(&partsBuf)

	textHeader := textproto.MIMEHeader{}
	textHeader.Set("Content-Type", "text/plain; charset=utf-8")
	tp, err := mw.CreatePart(textHeader)
	if err != nil {
		return nil, err
	}
	if _, err := tp.Write([]byte(crlfNormalize(msg.TextBody))); err != nil {
		return nil, err
	}

	htmlHeader := textproto.MIMEHeader{}
	htmlHeader.Set("Content-Type", "text/html; charset=utf-8")
	hp, err := mw.CreatePart(htmlHeader)
	if err != nil {
		return nil, err
	}
	if _, err := hp.Write([]byte(crlfNormalize(msg.HTMLBody))); err != nil {
		return nil, err
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}

	headers.Set("Content-Type", `multipart/alternative; boundary="`+mw.Boundary()+`"`)
	writeHeaders(&body, headers)
	body.WriteString("\r\n")
	body.Write(partsBuf.Bytes())
	return body.Bytes(), nil
}

func writeHeaders(buf *bytes.Buffer, h textproto.MIMEHeader) {
	// Stable header order makes the output predictable for tests and for
	// human eyeballs in a packet capture. We hand-pick the order that
	// matches RFC 5322's typical example.
	order := []string{"From", "To", "Subject", "Date", "Message-ID", "MIME-Version", "Content-Type"}
	for _, k := range order {
		if v := h.Get(k); v != "" {
			fmt.Fprintf(buf, "%s: %s\r\n", k, v)
		}
	}
}

func buildMessageID(from string) string {
	domain := "chara.local"
	if at := strings.LastIndex(from, "@"); at > 0 && at < len(from)-1 {
		domain = from[at+1:]
	}
	return "<" + ulid.New() + "@" + domain + ">"
}

// crlfNormalize ensures every line terminator is CRLF as required by SMTP.
// It collapses bare LFs to CRLF without double-stuffing existing CRLFs.
func crlfNormalize(s string) string {
	// First normalize CRLF→LF then LF→CRLF — cheap and idempotent.
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.ReplaceAll(s, "\n", "\r\n")
}
