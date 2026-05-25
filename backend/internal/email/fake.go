package email

import (
	"context"
	"sync"
)

// FakeSender is a Sender test double that records every Send call. It is
// goroutine-safe so tests can fan out a few handler requests without
// synchronising themselves.
//
// If Err is set, Send returns it after recording the message — useful for
// asserting that callers handle delivery failures gracefully (e.g. the
// magic-link handler still mints the token even when SMTP is down).
type FakeSender struct {
	mu       sync.Mutex
	Messages []Message
	Err      error
}

func (f *FakeSender) Send(_ context.Context, msg Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Messages = append(f.Messages, msg)
	return f.Err
}

// Reset clears recorded messages (but keeps Err).
func (f *FakeSender) Reset() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Messages = nil
}
