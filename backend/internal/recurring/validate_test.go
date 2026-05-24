package recurring_test

import (
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/recurring"
)

func TestValidate_AcceptsHappyPath(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Stockholm")
	r := recurring.Rule{
		FreqUnit: "month", FreqInterval: 1,
		StartDate:     time.Date(2026, 6, 1, 0, 0, 0, 0, loc),
		Timezone:      "Europe/Stockholm",
		FireLocalTime: "09:00",
	}
	if err := recurring.Validate(r); err != nil {
		t.Fatalf("happy path rejected: %v", err)
	}
}

func TestValidate_RejectsBadInputs(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Stockholm")
	base := recurring.Rule{
		FreqUnit: "month", FreqInterval: 1,
		StartDate:     time.Date(2026, 6, 1, 0, 0, 0, 0, loc),
		Timezone:      "Europe/Stockholm",
		FireLocalTime: "09:00",
	}

	cases := []struct {
		name string
		mut  func(r *recurring.Rule)
	}{
		{"bad unit", func(r *recurring.Rule) { r.FreqUnit = "fortnight" }},
		{"zero interval", func(r *recurring.Rule) { r.FreqInterval = 0 }},
		{"too-large interval", func(r *recurring.Rule) { r.FreqInterval = 999 }},
		{"end before start", func(r *recurring.Rule) {
			e := r.StartDate.AddDate(0, 0, -1)
			r.EndDate = &e
		}},
		{"bad tz", func(r *recurring.Rule) { r.Timezone = "Mars/Olympus" }},
		{"bad fire time", func(r *recurring.Rule) { r.FireLocalTime = "9am" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := base
			c.mut(&r)
			if err := recurring.Validate(r); err == nil {
				t.Fatalf("expected error")
			}
		})
	}
}
