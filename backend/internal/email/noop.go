package email

import (
	"context"
	"log/slog"
)

// NoopSender is the fallback when no SMTP/Resend transport is configured.
// It logs each attempted send at INFO so operators can audit what would
// have gone out, but returns nil — callers should treat email delivery as
// best-effort and not fail user-visible flows when no backend exists.
type NoopSender struct{}

func (NoopSender) Send(_ context.Context, msg Message) error {
	slog.Info("email: noop sender (no backend configured)",
		"to", msg.To,
		"subject", msg.Subject,
	)
	return nil
}
