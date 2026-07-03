package category

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefault_StartsWithGeneralEndsWithOther(t *testing.T) {
	d := Default()
	require.NotEmpty(t, d)
	assert.Equal(t, "general", d[0])
	assert.Equal(t, "other", d[len(d)-1])
}

func TestDefault_ReturnsACopy(t *testing.T) {
	// Mutating the result must not corrupt the package's internal catalog.
	d := Default()
	d[0] = "corrupted"
	assert.Equal(t, "general", Default()[0])
}

func TestIsValid(t *testing.T) {
	assert.True(t, IsValid("food"))
	assert.True(t, IsValid("FOOD"))
	assert.True(t, IsValid(" food "))
	assert.False(t, IsValid("electronics-store"))
	assert.False(t, IsValid(""))
}

func TestValidate_HappyPath(t *testing.T) {
	got, err := Validate([]string{"food", "drinks", "rent"})
	require.NoError(t, err)
	assert.Equal(t, []string{"food", "drinks", "rent"}, got)
}

func TestValidate_NormalisesCase(t *testing.T) {
	got, err := Validate([]string{" Food ", "DRINKS"})
	require.NoError(t, err)
	assert.Equal(t, []string{"food", "drinks"}, got)
}

func TestValidate_DedupesPreservingFirstOccurrence(t *testing.T) {
	got, err := Validate([]string{"food", "drinks", "food"})
	require.NoError(t, err)
	assert.Equal(t, []string{"food", "drinks"}, got)
}

func TestValidate_RejectsUnknownSlug(t *testing.T) {
	_, err := Validate([]string{"food", "electronics-store"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "electronics-store")
}

func TestValidate_RejectsEmpty(t *testing.T) {
	_, err := Validate(nil)
	require.Error(t, err)
	_, err = Validate([]string{})
	require.Error(t, err)
}
