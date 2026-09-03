package config

import (
	"strings"
	"testing"

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
// The default is the zone Chara Cloud's users actually live in, not UTC.
// With a UTC default an unset SUMMARY_TZ ships the push at 11:00 Stockholm
// in summer and 10:00 in winter — the one thing the spec fixed at 09:00
// local. Nothing in deploy/ sets the variable, so the default is what
// production gets.
func TestSummaryLocation_DefaultsToStockholm(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = ""
	require.NoError(t, c.validate())
	assert.Equal(t, DefaultSummaryTZ, c.SummaryLocation().String())
	assert.Equal(t, "Europe/Stockholm", c.SummaryLocation().String())
}

func TestSummaryLocation_ResolvesTheConfiguredZone(t *testing.T) {
	c := baseHosted()
	c.SummaryTZ = "Europe/Stockholm"
	require.NoError(t, c.validate())
	assert.Equal(t, "Europe/Stockholm", c.SummaryLocation().String())
}
