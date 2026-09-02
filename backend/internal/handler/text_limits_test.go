package handler

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateText_AcceptsNormalInput(t *testing.T) {
	require.NoError(t, validateText("Dinner at Ekstedt", maxTitleLen, "title"))
	require.NoError(t, validateText("", maxNotesLen, "notes"))
}

func TestValidateText_CountsRunesNotBytes(t *testing.T) {
	// 200 emoji is 200 characters but 800 bytes. A byte-based limit would
	// reject a legitimate title; a rune-based one accepts it.
	require.NoError(t, validateText(strings.Repeat("🧾", maxTitleLen), maxTitleLen, "title"))
}

func TestValidateText_RejectsOverLimit(t *testing.T) {
	err := validateText(strings.Repeat("a", maxTitleLen+1), maxTitleLen, "title")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "title")
}

func TestValidateText_RejectsMultiMegabyteString(t *testing.T) {
	// The case that motivated the limit: a member stores a multi-MB note that
	// then rides along in every list response and push notification body.
	err := validateText(strings.Repeat("a", 4<<20), maxNotesLen, "notes")
	require.Error(t, err)
}
