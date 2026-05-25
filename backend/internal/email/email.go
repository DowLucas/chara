// Package email is the outbound transactional-mail abstraction for Chara.
//
// Today the only message we send is the magic-link sign-in email. The package
// exposes a small Sender interface so callers (handlers, background jobs) can
// depend on a stable contract and test against FakeSender, while the
// production implementation talks to SMTP (Gmail / Mailgun / etc.) over
// stdlib net/smtp — no third-party dep.
//
// Backend selection is centralised in NewSenderFromConfig: a configured SMTP
// host wins; otherwise we return NoopSender so the server keeps booting in
// dev mode (where the magic-link is also returned in the response body and
// the email is incidental). A Resend implementation may land later; for now
// RESEND_API_KEY falls through to Noop with a warning so misconfigured prod
// instances are obvious in the logs.
package email

import (
	"context"
	"log/slog"

	"github.com/DowLucas/chara/internal/config"
)

// Sender is the abstraction every email producer depends on.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// Message is a single transactional email. HTMLBody is optional — when empty
// the SMTP sender produces a text-only message instead of multipart.
type Message struct {
	To       string
	Subject  string
	TextBody string
	HTMLBody string
}

// NewSenderFromConfig picks the concrete Sender implementation based on
// configured credentials. See package doc for selection rules.
func NewSenderFromConfig(cfg *config.Config) Sender {
	if cfg == nil {
		return NoopSender{}
	}
	if cfg.ResendAPIKey != "" {
		// TODO(email): implement Resend transport. Until then, surface the
		// misconfig loudly so operators notice that RESEND_API_KEY is set
		// but no email is actually being delivered.
		slog.Warn("email: RESEND_API_KEY is set but the Resend transport is not implemented yet; falling back to next backend")
		if cfg.SMTPHost != "" {
			return newSMTPSender(cfg)
		}
		return NoopSender{}
	}
	if cfg.SMTPHost != "" {
		return newSMTPSender(cfg)
	}
	slog.Warn("email: no transport configured (RESEND_API_KEY / SMTP_HOST unset); outbound mail will be dropped")
	return NoopSender{}
}
