package jobs

import (
	"testing"
	"time"
)

func mustLoad(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("LoadLocation(%q): %v", name, err)
	}
	return loc
}

// The tick runs hourly; exactly one of those runs per month may fan out.
func TestShouldFireOnlyOnTheFirstAtNine(t *testing.T) {
	loc := mustLoad(t, "Europe/Stockholm")
	cases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{"the 1st at 09:00", time.Date(2026, 9, 1, 9, 0, 0, 0, loc), true},
		{"still inside the 09:00 hour", time.Date(2026, 9, 1, 9, 59, 59, 0, loc), true},
		{"an hour early", time.Date(2026, 9, 1, 8, 59, 59, 0, loc), false},
		{"an hour late", time.Date(2026, 9, 1, 10, 0, 0, 0, loc), false},
		{"midnight on the 1st", time.Date(2026, 9, 1, 0, 0, 0, 0, loc), false},
		{"09:00 on the 2nd", time.Date(2026, 9, 2, 9, 0, 0, 0, loc), false},
		{"09:00 on the last day of the month", time.Date(2026, 8, 31, 9, 0, 0, 0, loc), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, ok := shouldFire(tc.now, loc); ok != tc.want {
				t.Errorf("shouldFire(%s) ok = %v, want %v", tc.now, ok, tc.want)
			}
		})
	}
}

// The summary is about the month that just ended, never the one just begun.
func TestShouldFireReportsThePrecedingMonth(t *testing.T) {
	loc := mustLoad(t, "Europe/Stockholm")
	cases := map[string]time.Time{
		"2026-08": time.Date(2026, 9, 1, 9, 0, 0, 0, loc),
		// The year rollover is the case a naive month-1 gets wrong.
		"2025-12": time.Date(2026, 1, 1, 9, 0, 0, 0, loc),
		"2026-01": time.Date(2026, 2, 1, 9, 0, 0, 0, loc),
	}
	for want, now := range cases {
		got, ok := shouldFire(now, loc)
		if !ok {
			t.Fatalf("shouldFire(%s) = not ok", now)
		}
		if got != want {
			t.Errorf("shouldFire(%s) = %q, want %q", now, got, want)
		}
	}
}

// The tick is scheduled in UTC but the hour that matters is local, so a
// timestamp is judged after conversion. Stockholm is UTC+2 in September.
func TestShouldFireJudgesLocalTimeNotUTC(t *testing.T) {
	loc := mustLoad(t, "Europe/Stockholm")
	// 07:00 UTC on the 1st is 09:00 in Stockholm: fires.
	if _, ok := shouldFire(time.Date(2026, 9, 1, 7, 0, 0, 0, time.UTC), loc); !ok {
		t.Error("07:00Z on the 1st is 09:00 Stockholm; want fire")
	}
	// 09:00 UTC is 11:00 local: does not.
	if _, ok := shouldFire(time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC), loc); ok {
		t.Error("09:00Z on the 1st is 11:00 Stockholm; want no fire")
	}
	// And the last hour of the 31st in UTC is already the 1st locally.
	if _, ok := shouldFire(time.Date(2026, 8, 31, 23, 30, 0, 0, time.UTC), loc); ok {
		t.Error("01:30 local on the 1st is not the fire hour; want no fire")
	}
}

// The period the job carries must be the format the endpoint and the ledger
// both use, or a fan-out writes rows GET /api/me/summary can never match.
func TestShouldFirePeriodIsYYYYMM(t *testing.T) {
	loc := mustLoad(t, "UTC")
	got, ok := shouldFire(time.Date(2026, 3, 1, 9, 0, 0, 0, loc), loc)
	if !ok {
		t.Fatal("want fire")
	}
	if _, err := time.Parse("2006-01", got); err != nil {
		t.Errorf("period %q does not parse as YYYY-MM: %v", got, err)
	}
}

// The deep link names no server: the feature is hosted-only, and a link that
// cannot name a server cannot be made to point the app at an attacker's host.
func TestBuildSummaryDeepLink(t *testing.T) {
	got := buildSummaryDeepLink("2026-08")
	want := "chara://summary/2026-08"
	if got != want {
		t.Errorf("buildSummaryDeepLink = %q, want %q", got, want)
	}
}
