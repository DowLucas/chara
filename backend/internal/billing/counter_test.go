package billing

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeStore lets us drive Counter unit tests without a real database. The
// methods record arguments and return canned results so the test reads as
// "given the SQL returned X, the package should do Y."
type fakeStore struct {
	reserveResult db.UsageCounter
	reserveErr    error
	refundErr     error
	getResult     db.UsageCounter
	getErr        error

	gotReserve []db.ReserveUsageSlotParams
	gotRefund  []db.RefundUsageSlotParams
	gotGet     []db.GetUsageCounterParams
}

func (f *fakeStore) ReserveUsageSlot(_ context.Context, arg db.ReserveUsageSlotParams) (db.UsageCounter, error) {
	f.gotReserve = append(f.gotReserve, arg)
	return f.reserveResult, f.reserveErr
}

func (f *fakeStore) RefundUsageSlot(_ context.Context, arg db.RefundUsageSlotParams) error {
	f.gotRefund = append(f.gotRefund, arg)
	return f.refundErr
}

func (f *fakeStore) GetUsageCounter(_ context.Context, arg db.GetUsageCounterParams) (db.UsageCounter, error) {
	f.gotGet = append(f.gotGet, arg)
	return f.getResult, f.getErr
}

func mustDate(t *testing.T, s string) pgtype.Date {
	t.Helper()
	tt, err := time.Parse("2006-01-02", s)
	require.NoError(t, err)
	return pgtype.Date{Time: tt, Valid: true}
}

func TestPeriodStartUTC_IsFirstOfMonth(t *testing.T) {
	cases := []struct {
		now  time.Time
		want time.Time
	}{
		{time.Date(2026, 5, 24, 14, 30, 0, 0, time.UTC), time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 12, 31, 23, 59, 59, 999_000_000, time.UTC), time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)},
		// A non-UTC moment still anchors to the UTC month — Jan 1 02:00 Stockholm = Jan 1 01:00 UTC, still January.
		{time.Date(2026, 1, 1, 2, 0, 0, 0, time.FixedZone("CET", 3600)), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		// Sao Paulo midnight Jan 1 is Jan 1 03:00 UTC — still January.
		{time.Date(2026, 1, 1, 0, 30, 0, 0, time.FixedZone("BRT", -3*3600)), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		// Stockholm midnight Jan 1 is Dec 31 23:00 UTC — still December.
		{time.Date(2026, 1, 1, 0, 30, 0, 0, time.FixedZone("CET", 3600)), time.Date(2025, 12, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, c := range cases {
		got := periodStartUTC(c.now)
		assert.Equal(t, c.want, got, "now=%s", c.now)
	}
}

func TestPeriodResetsAtUTC_IsFirstOfNextMonth(t *testing.T) {
	cases := []struct {
		now  time.Time
		want time.Time
	}{
		{time.Date(2026, 5, 24, 14, 30, 0, 0, time.UTC), time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC), time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 12, 31, 23, 59, 59, 999_000_000, time.UTC), time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, c := range cases {
		got := periodResetsAtUTC(c.now)
		assert.Equal(t, c.want, got, "now=%s", c.now)
	}
}

func TestReserve_AllowedReturnsReservationAndRemaining(t *testing.T) {
	now := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	monthStart := mustDate(t, "2026-05-01")
	store := &fakeStore{
		reserveResult: db.UsageCounter{
			UserID: "u_1", Feature: "ocr", PeriodStart: monthStart, Used: 2,
		},
	}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	res, err := c.Reserve(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.True(t, res.Allowed)
	require.NotNil(t, res.Reservation)
	assert.Equal(t, "u_1", res.Reservation.UserID)
	assert.Equal(t, "ocr", res.Reservation.Feature)
	assert.Equal(t, monthStart, res.Reservation.PeriodStart)
	assert.Equal(t, 2, res.Used)
	assert.Equal(t, 3, res.Cap)
	assert.Equal(t, 1, res.Remaining) // cap 3 - used 2 = 1 remaining after this scan
	assert.Equal(t, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), res.PeriodResetsAt)

	require.Len(t, store.gotReserve, 1)
	assert.Equal(t, "u_1", store.gotReserve[0].UserID)
	assert.Equal(t, "ocr", store.gotReserve[0].Feature)
	assert.EqualValues(t, 3, store.gotReserve[0].Cap)
	assert.Equal(t, monthStart, store.gotReserve[0].PeriodStart)
}

func TestReserve_CapReachedReadsCurrentStatusAndReturnsZeroRemaining(t *testing.T) {
	now := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	monthStart := mustDate(t, "2026-05-01")
	store := &fakeStore{
		reserveErr: pgx.ErrNoRows, // SQL filtered out the UPDATE; cap reached
		getResult: db.UsageCounter{
			UserID: "u_1", Feature: "ocr", PeriodStart: monthStart, Used: 3,
		},
	}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	res, err := c.Reserve(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.False(t, res.Allowed)
	assert.Nil(t, res.Reservation)
	assert.Equal(t, 3, res.Used)
	assert.Equal(t, 3, res.Cap)
	assert.Equal(t, 0, res.Remaining)
	assert.Equal(t, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), res.PeriodResetsAt)
}

func TestReserve_DatabaseErrorPropagates(t *testing.T) {
	store := &fakeStore{reserveErr: errors.New("connection refused")}
	c := NewCounter(store)

	_, err := c.Reserve(context.Background(), "u_1", "ocr", 3)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "connection refused")
}

func TestRefund_UsesReservationPeriodStart(t *testing.T) {
	monthStart := mustDate(t, "2026-05-01")
	store := &fakeStore{}
	c := NewCounter(store)

	err := c.Refund(context.Background(), Reservation{
		UserID:      "u_1",
		Feature:     "ocr",
		PeriodStart: monthStart,
	})
	require.NoError(t, err)
	require.Len(t, store.gotRefund, 1)
	assert.Equal(t, "u_1", store.gotRefund[0].UserID)
	assert.Equal(t, "ocr", store.gotRefund[0].Feature)
	assert.Equal(t, monthStart, store.gotRefund[0].PeriodStart)
}

func TestStatus_NoRowMeansFreshUser(t *testing.T) {
	now := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{getErr: pgx.ErrNoRows}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	st, err := c.Status(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.Equal(t, 0, st.Used)
	assert.Equal(t, 3, st.Cap)
	assert.Equal(t, 3, st.Remaining)
	assert.Equal(t, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), st.PeriodResetsAt)
}

func TestStatus_StalePeriodIsReportedAsZeroUsed(t *testing.T) {
	// User scanned 3 times in April; we're now May 1. The lazy-reset hasn't
	// fired yet (no Reserve call this period). Status() must surface the
	// state as it WILL be after the next Reserve, not the literal DB value,
	// so the You-tab counter doesn't lie to free users on the 1st of the
	// month.
	now := time.Date(2026, 5, 1, 8, 0, 0, 0, time.UTC)
	store := &fakeStore{
		getResult: db.UsageCounter{
			UserID: "u_1", Feature: "ocr",
			PeriodStart: mustDate(t, "2026-04-01"), Used: 3,
		},
	}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	st, err := c.Status(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.Equal(t, 0, st.Used)
	assert.Equal(t, 3, st.Remaining)
	assert.Equal(t, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), st.PeriodResetsAt)
}

func TestStatus_CurrentPeriodPassesThroughUsed(t *testing.T) {
	now := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		getResult: db.UsageCounter{
			UserID: "u_1", Feature: "ocr",
			PeriodStart: mustDate(t, "2026-05-01"), Used: 2,
		},
	}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	st, err := c.Status(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.Equal(t, 2, st.Used)
	assert.Equal(t, 1, st.Remaining)
}

func TestStatus_RemainingClampsToZero(t *testing.T) {
	// Shouldn't happen in practice (SQL refuses to over-increment), but if
	// data ever gets into used > cap (e.g. cap was lowered) we report 0
	// remaining rather than negative.
	now := time.Date(2026, 5, 24, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{
		getResult: db.UsageCounter{
			UserID: "u_1", Feature: "ocr",
			PeriodStart: mustDate(t, "2026-05-01"), Used: 5,
		},
	}
	c := NewCounter(store).WithNow(func() time.Time { return now })

	st, err := c.Status(context.Background(), "u_1", "ocr", 3)
	require.NoError(t, err)
	assert.Equal(t, 5, st.Used)
	assert.Equal(t, 0, st.Remaining)
}
