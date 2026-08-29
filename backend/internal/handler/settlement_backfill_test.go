//go:build integration

package handler_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// backfillSQL returns the contents of the settlement-method backfill
// migration so the test exercises the statement that actually ships rather
// than a copy of it. The migration is written to be idempotent, so re-running
// it here (the harness already migrated fully up) is safe.
func backfillSQL(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	require.True(t, ok)
	path := filepath.Join(filepath.Dir(thisFile), "..", "..", "migrations",
		"000055_backfill_settlement_method.up.sql")
	b, err := os.ReadFile(path)
	require.NoError(t, err)
	return string(b)
}

// TestBackfill_SettlementMethod_RecoversRailFromNote covers issue #102 B1:
// the app used to send the rail name in `note` because SettleInput had no
// `method` field, so historical rows read method='manual' with "swish" in
// the user-visible note.
func TestBackfill_SettlementMethod_RecoversRailFromNote(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	ctx := context.Background()

	seed := func(note, method string) string {
		id := ulid.New()
		testutil.CreateSettlementWithID(t, env.Pool, id, groupID, bobMemberID, aliceMemberID, 100, "SEK", alice.ID)
		_, err := env.Pool.Exec(ctx, `UPDATE settlements SET note = $2, method = $3 WHERE id = $1`, id, note, method)
		require.NoError(t, err)
		return id
	}

	legacySwish := seed("swish", "manual")
	legacyManual := seed("manual", "manual")
	realNote := seed("Pizza money", "manual")
	alreadyTagged := seed("swish", "vipps")

	_, err := env.Pool.Exec(ctx, backfillSQL(t))
	require.NoError(t, err)

	get := func(id string) (method string, note *string) {
		require.NoError(t, env.Pool.QueryRow(ctx,
			`SELECT method, note FROM settlements WHERE id = $1`, id).Scan(&method, &note))
		return
	}

	m, n := get(legacySwish)
	assert.Equal(t, "swish", m, "rail must be recovered from the note")
	assert.Nil(t, n, "the rail name was never user text — clear it")

	m, n = get(legacyManual)
	assert.Equal(t, "manual", m)
	assert.Nil(t, n, "'manual' in the note carried no information")

	m, n = get(realNote)
	assert.Equal(t, "manual", m)
	require.NotNil(t, n)
	assert.Equal(t, "Pizza money", *n, "a genuine user note must survive untouched")

	m, n = get(alreadyTagged)
	assert.Equal(t, "vipps", m, "a row that already carries a method must not be rewritten")
	require.NotNil(t, n)
	assert.Equal(t, "swish", *n)
}
