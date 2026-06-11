// Package push delivers push notifications to mobile devices via the Expo
// Push Service.
//
// The package is intentionally provider-agnostic at the call site: jobs
// depend on the [Sender] interface so the implementation can be swapped or
// stubbed in tests.
package push

import "context"

// Message is a single push notification addressed to one device.
type Message struct {
	// To is the recipient's Expo push token, e.g. "ExponentPushToken[xxx]".
	To string
	// Title and Body are the visible notification text.
	Title string
	Body  string
	// Data is a key/value payload delivered alongside the notification.
	// Chara uses it to carry the deep link, e.g. {"url": "chara://..."} —
	// the URL embeds the originating serverUrl per the multi-server design.
	Data map[string]string
}

// Result reports per-message outcomes of a Send call.
type Result struct {
	// DeviceNotRegistered lists the push tokens Expo reported as no longer
	// valid (app uninstalled, token expired). Callers should delete these
	// from the push_tokens table; retrying them is pointless.
	DeviceNotRegistered []string
}

// Sender delivers push notifications. Transport and HTTP-level failures
// surface as errors — implementations do not retry internally; the River
// job layer owns retries. Per-message rejections surface in [Result].
type Sender interface {
	Send(ctx context.Context, msgs []Message) (*Result, error)
}
