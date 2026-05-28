package importer_test

import (
	"testing"

	"github.com/DowLucas/chara/internal/importer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMergeStandings_CollapsesSameNameKeepsHigherConfidence(t *testing.T) {
	in := []importer.Standing{
		{Name: "Anna", Direction: importer.DirectionOwesYou, Amount: "340.00", Confidence: 0.5},
		{Name: "anna", Direction: importer.DirectionOwesYou, Amount: "340.00", Confidence: 0.9},
	}
	out := importer.MergeStandings(in)
	require.Len(t, out, 1)
	assert.InDelta(t, 0.9, out[0].Confidence, 0.0001)
}

func TestMergeStandings_KeepsFirstWhenConfidenceNotHigher(t *testing.T) {
	in := []importer.Standing{
		{Name: "Anna", Amount: "340.00", Confidence: 0.9},
		{Name: " anna ", Amount: "999.00", Confidence: 0.4},
	}
	out := importer.MergeStandings(in)
	require.Len(t, out, 1)
	assert.Equal(t, "340.00", out[0].Amount)
}

func TestMergeStandings_KeepsDistinctNames(t *testing.T) {
	in := []importer.Standing{
		{Name: "Anna", Amount: "340.00"},
		{Name: "Sven", Amount: "90.00"},
	}
	out := importer.MergeStandings(in)
	assert.Len(t, out, 2)
}

func TestMergeStandings_PreservesOrderAndDropsBlank(t *testing.T) {
	in := []importer.Standing{
		{Name: "A", Amount: "10.00"},
		{Name: "   ", Amount: "5.00"},
		{Name: "B", Amount: "20.00"},
		{Name: "a", Amount: "10.00"}, // dup of first
	}
	out := importer.MergeStandings(in)
	require.Len(t, out, 2)
	assert.Equal(t, "A", out[0].Name)
	assert.Equal(t, "B", out[1].Name)
}

func TestMergeStandings_Empty(t *testing.T) {
	assert.Empty(t, importer.MergeStandings(nil))
}
