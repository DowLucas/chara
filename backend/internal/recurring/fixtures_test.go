package recurring_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/recurring"
)

type fixtureCase struct {
	Name string `json:"name"`
	Rule struct {
		FreqUnit      string  `json:"freq_unit"`
		FreqInterval  int     `json:"freq_interval"`
		StartDate     string  `json:"start_date"`
		EndDate       *string `json:"end_date"`
		Timezone      string  `json:"timezone"`
		FireLocalTime string  `json:"fire_local_time"`
	} `json:"rule"`
	Occurrence       string `json:"occurrence"`
	ExpectedNextFire string `json:"expected_next_fire"`
	ExpectedStatus   string `json:"expected_status"`
}

type fixtureFile struct {
	Version int           `json:"version"`
	Cases   []fixtureCase `json:"cases"`
}

func loadFixtures(t *testing.T) fixtureFile {
	t.Helper()
	path := filepath.Join("testdata", "recurring-fixtures.json")
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var f fixtureFile
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if f.Version != 1 {
		t.Fatalf("unexpected fixture version %d", f.Version)
	}
	return f
}

func TestNextFire_Fixtures(t *testing.T) {
	for _, c := range loadFixtures(t).Cases {
		t.Run(c.Name, func(t *testing.T) {
			startDate, err := time.Parse("2006-01-02", c.Rule.StartDate)
			if err != nil {
				t.Fatalf("parse start_date: %v", err)
			}
			var endDate *time.Time
			if c.Rule.EndDate != nil {
				d, err := time.Parse("2006-01-02", *c.Rule.EndDate)
				if err != nil {
					t.Fatalf("parse end_date: %v", err)
				}
				endDate = &d
			}
			occ, err := time.Parse(time.RFC3339, c.Occurrence)
			if err != nil {
				t.Fatalf("parse occurrence: %v", err)
			}
			expected, err := time.Parse(time.RFC3339, c.ExpectedNextFire)
			if err != nil {
				t.Fatalf("parse expected_next_fire: %v", err)
			}

			_, next, status := recurring.NextFire(recurring.Rule{
				FreqUnit:      c.Rule.FreqUnit,
				FreqInterval:  c.Rule.FreqInterval,
				StartDate:     startDate,
				EndDate:       endDate,
				Timezone:      c.Rule.Timezone,
				FireLocalTime: c.Rule.FireLocalTime,
			}, occ)

			if !next.Equal(expected) {
				t.Errorf("next_fire: want %s, got %s", expected, next)
			}
			if string(status) != c.ExpectedStatus {
				t.Errorf("status: want %s, got %s", c.ExpectedStatus, status)
			}
		})
	}
}
