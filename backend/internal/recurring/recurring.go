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

// NextFire returns (newLastFireAt, newNextFireAt, newStatus). Stub for now.
func NextFire(rule Rule, occurrence time.Time) (time.Time, time.Time, Status) {
	return time.Time{}, time.Time{}, StatusActive
}
