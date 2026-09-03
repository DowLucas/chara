package config

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A typo'd zone must fail at boot rather than silently becoming UTC and
// pushing the monthly summary at the wrong hour for everyone.
func TestValidate_RejectsUnknownSummaryTZ(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = "Europe/Stockholmm"
	err := c.validate()
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "summary_tz")
}

func TestValidate_AcceptsKnownSummaryTZ(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = "Europe/Stockholm"
	require.NoError(t, c.validate())
}

// Empty means UTC — the zone is an operator preference, not a requirement,
// so an unset variable must not block startup.
func TestSummaryLocation_DefaultsToUTC(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = ""
	require.NoError(t, c.validate())
	assert.Equal(t, time.UTC, c.SummaryLocation())
}

func TestSummaryLocation_ResolvesTheConfiguredZone(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = "Europe/Stockholm"
	require.NoError(t, c.validate())
	assert.Equal(t, "Europe/Stockholm", c.SummaryLocation().String())
}
