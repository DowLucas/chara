// Package billing implements the per-user, per-feature metered-usage
// counter used by the hosted instance. v1.0 only uses it for the free
// OCR cap (3/month, anti-abuse); v1.2+ will reuse the same primitive for
// paid-tier caps (e.g. 500 OCR/month for Chara Hosted subscribers).
//
// The counter is server-authoritative. The client may show a cached
// value for UI snappiness, but every gating decision flows through
// Reserve(). Refund() makes the reservation crash-safe — call it when
// the downstream side effect (e.g. Gemini scan) fails.
//
// See docs/superpowers/specs/2026-05-24-pro-billing-design.md.
package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Store is the narrow database surface Counter depends on. *db.Queries
// satisfies it for production; tests inject fakes.
type Store interface {
	ReserveUsageSlot(ctx context.Context, arg db.ReserveUsageSlotParams) (db.UsageCounter, error)
	RefundUsageSlot(ctx context.Context, arg db.RefundUsageSlotParams) error
	GetUsageCounter(ctx context.Context, arg db.GetUsageCounterParams) (db.UsageCounter, error)
}

// Counter is the public entry point. It is safe for concurrent use; all
// atomicity is enforced in SQL.
type Counter struct {
	store Store
	now   func() time.Time
}

// NewCounter wires a Counter to the given Store.
func NewCounter(store Store) *Counter {
	return &Counter{store: store, now: time.Now}
}

// WithNow overrides the clock. Tests use this to inject month boundaries
// deterministically. Returns the receiver for chaining.
func (c *Counter) WithNow(fn func() time.Time) *Counter {
	c.now = fn
	return c
}

// Reservation is the receipt of a successful Reserve(). Pass it back to
// Refund() to release the slot. PeriodStart is critical: a refund that
// crosses a month boundary must not decrement the freshly-reset row.
type Reservation struct {
	UserID      string
	Feature     string
	PeriodStart pgtype.Date
}

// Result is what Reserve() returns. Allowed=false means the user is at
// cap; Used / Remaining / PeriodResetsAt are populated either way so the
// handler can build a complete 429 payload without an extra round-trip.
type Result struct {
	Allowed        bool
	Reservation    *Reservation
	Used           int
	Cap            int
	Remaining      int
	PeriodResetsAt time.Time
}

// Reserve atomically takes one slot if the user is under cap. On
// cap-reached it follows up with a Status read so the caller has accurate
// numbers for the response payload. The follow-up read can race with
// other concurrent scans; we accept that — the client cache is best-effort
// and the next scan attempt will produce the authoritative state.
func (c *Counter) Reserve(ctx context.Context, userID, feature string, cap int) (Result, error) {
	if cap < 0 {
		return Result{}, fmt.Errorf("billing: negative cap %d", cap)
	}

	now := c.now().UTC()
	monthStart := pgDate(periodStartUTC(now))
	resetsAt := periodResetsAtUTC(now)

	// cap == 0 means "always denied." The SQL would otherwise INSERT a
	// fresh row at used=1 because the WHERE on ON CONFLICT only gates
	// updates, not inserts. Short-circuit so the response shape matches
	// the regular cap-reached path.
	if cap == 0 {
		return Result{Allowed: false, Cap: 0, PeriodResetsAt: resetsAt}, nil
	}

	row, err := c.store.ReserveUsageSlot(ctx, db.ReserveUsageSlotParams{
		UserID:      userID,
		Feature:     feature,
		Cap:         int32(cap),
		PeriodStart: monthStart,
	})
	if err == nil {
		// Slot reserved. Remaining is what's left AFTER this scan.
		used := int(row.Used)
		remaining := cap - used
		if remaining < 0 {
			remaining = 0
		}
		return Result{
			Allowed: true,
			Reservation: &Reservation{
				UserID:      userID,
				Feature:     feature,
				PeriodStart: row.PeriodStart,
			},
			Used:           used,
			Cap:            cap,
			Remaining:      remaining,
			PeriodResetsAt: resetsAt,
		}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Result{}, fmt.Errorf("billing: reserve slot: %w", err)
	}

	// Cap reached — fetch current row for accurate numbers in the response.
	st, statusErr := c.Status(ctx, userID, feature, cap)
	if statusErr != nil {
		// Don't leak the follow-up error to the caller — they hit the cap,
		// that's the important fact. Return zeroed numbers as a safe default.
		return Result{Allowed: false, Cap: cap, PeriodResetsAt: resetsAt}, nil
	}
	return Result{
		Allowed:        false,
		Used:           st.Used,
		Cap:            cap,
		Remaining:      st.Remaining,
		PeriodResetsAt: resetsAt,
	}, nil
}

// Refund decrements the counter. Safe to call multiple times: the SQL
// uses `used > 0` so a double-refund won't underflow.
func (c *Counter) Refund(ctx context.Context, r Reservation) error {
	if err := c.store.RefundUsageSlot(ctx, db.RefundUsageSlotParams{
		UserID:      r.UserID,
		Feature:     r.Feature,
		PeriodStart: r.PeriodStart,
	}); err != nil {
		return fmt.Errorf("billing: refund slot: %w", err)
	}
	return nil
}

// Status reads the current counter for display. Treats a stale period
// (last-month row) as zero used — that's what the user WILL see after
// their next Reserve call, and showing the stale value would be lying.
func (c *Counter) Status(ctx context.Context, userID, feature string, cap int) (Result, error) {
	now := c.now().UTC()
	monthStart := periodStartUTC(now)
	resetsAt := periodResetsAtUTC(now)

	row, err := c.store.GetUsageCounter(ctx, db.GetUsageCounterParams{
		UserID:  userID,
		Feature: feature,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Result{
			Used:           0,
			Cap:            cap,
			Remaining:      cap,
			PeriodResetsAt: resetsAt,
		}, nil
	}
	if err != nil {
		return Result{}, fmt.Errorf("billing: get counter: %w", err)
	}

	used := int(row.Used)
	if row.PeriodStart.Valid && row.PeriodStart.Time.Before(monthStart) {
		// Stale row from a previous month; the lazy reset on next Reserve
		// will zero it. Surface that future state.
		used = 0
	}
	remaining := cap - used
	if remaining < 0 {
		remaining = 0
	}
	return Result{
		Used:           used,
		Cap:            cap,
		Remaining:      remaining,
		PeriodResetsAt: resetsAt,
	}, nil
}

// periodStartUTC returns the first instant of the UTC month containing t.
func periodStartUTC(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// periodResetsAtUTC returns the first instant of the UTC month AFTER t.
func periodResetsAtUTC(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, time.UTC)
}

func pgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}
