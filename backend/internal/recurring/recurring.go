// Package recurring is the pure-Go domain for recurring-expense rules.
// No DB, no HTTP. See docs/superpowers/specs/2026-05-24-recurring-expenses-design.md.
package recurring

import "time"

// Rule is the subset of recurring_expenses needed to compute NextFire.
type Rule struct {
	FreqUnit      string     // "day" | "week" | "month" | "year"
	FreqInterval  int        // 1..365
	StartDate     time.Time  // date-only (00:00 in the rule's tz)
	EndDate       *time.Time // nil = open-ended
	Timezone      string     // IANA, e.g. "Europe/Stockholm"
	FireLocalTime string     // "HH:MM"
}

// Status is the runtime state returned alongside NextFire.
type Status string

const (
	StatusActive Status = "active"
	StatusEnded  Status = "ended"
)

// NextFire computes (newLastFireAt, newNextFireAt, newStatus) after the rule
// fires for `occurrence`. All datetime math is in rule.Timezone (an IANA zone
// name). Month-end clamping follows Go's time.AddDate semantics (Jan 31 + 1
// month = Feb 28/29).
func NextFire(rule Rule, occurrence time.Time) (time.Time, time.Time, Status) {
	loc, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		// Caller should have validated; fall back to UTC so we never panic
		// inside a tx. Callers MUST treat this as a bug and surface it.
		loc = time.UTC
	}

	occLocal := occurrence.In(loc)
	hour, min := parseHHMM(rule.FireLocalTime)
	occAtFireTime := time.Date(
		occLocal.Year(), occLocal.Month(), occLocal.Day(),
		hour, min, 0, 0, loc,
	)

	var next time.Time
	switch rule.FreqUnit {
	case "day":
		next = occAtFireTime.AddDate(0, 0, rule.FreqInterval)
	case "week":
		next = occAtFireTime.AddDate(0, 0, 7*rule.FreqInterval)
	case "month":
		next = addMonthsClamped(occAtFireTime, rule.FreqInterval, hour, min, loc)
	case "year":
		next = addYearsClamped(occAtFireTime, rule.FreqInterval, hour, min, loc)
	default:
		// Validated upstream; mirror "no advance" so the caller can pause.
		next = occAtFireTime
	}

	status := StatusActive
	if rule.EndDate != nil {
		// Compare dates in the rule's timezone — never compare UTC dates
		// against a wall-clock end_date.
		nextDateInTZ := next.In(loc)
		endLocal := time.Date(
			rule.EndDate.Year(), rule.EndDate.Month(), rule.EndDate.Day(),
			23, 59, 59, 0, loc,
		)
		if nextDateInTZ.After(endLocal) {
			status = StatusEnded
			next = occurrence // do not advance past end_date
		}
	}

	return occurrence, next.UTC(), status
}

// addMonthsClamped adds n months to t in loc, clamping to the last day of
// the target month if the source day-of-month doesn't exist there (e.g.
// Jan 31 + 1 month -> Feb 28). Go's time.AddDate normalizes overflow
// instead of clamping; this helper enforces the "anniversary day, last
// day if missing" semantic the fixtures (and most calendar UIs) expect.
func addMonthsClamped(t time.Time, n, hour, min int, loc *time.Location) time.Time {
	year := t.Year()
	month := int(t.Month()) + n
	// Normalize month/year.
	year += (month - 1) / 12
	month = ((month-1)%12 + 12) % 12 + 1
	day := t.Day()
	last := daysInMonth(year, time.Month(month))
	if day > last {
		day = last
	}
	return time.Date(year, time.Month(month), day, hour, min, 0, 0, loc)
}

// addYearsClamped is the year-granularity equivalent (Feb 29 -> Feb 28
// in non-leap years).
func addYearsClamped(t time.Time, n, hour, min int, loc *time.Location) time.Time {
	year := t.Year() + n
	month := t.Month()
	day := t.Day()
	last := daysInMonth(year, month)
	if day > last {
		day = last
	}
	return time.Date(year, month, day, hour, min, 0, 0, loc)
}

func daysInMonth(year int, month time.Month) int {
	// time.Date with day=0 of next month -> last day of `month` in UTC,
	// which is fine because we only read .Day().
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func parseHHMM(s string) (int, int) {
	if len(s) != 5 || s[2] != ':' {
		return 9, 0
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	return h, m
}
