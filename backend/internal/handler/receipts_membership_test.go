//go:build integration

package handler_test

import (
	"context"
	"testing"

	"github.com/DowLucas/chara/internal/handler"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/testutil"
)

// These exercise the real DB-backed GroupCategoriesLookup (handler.NewGroupCategoriesLookup),
// which POST /api/receipts/scan uses to scope AI category suggestions to a
// group — specifically that it enforces the caller is actually a member of
// the group_id they supply, not just that the group exists.

func TestGroupCategoriesLookup_MemberCanResolve(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_catlookup_member"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	lookup := handler.NewGroupCategoriesLookup(env.Queries)
	slugs, err := lookup.GetGroupCategorySlugs(context.Background(), group.ID, alice.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, slugs)
	assert.Equal(t, "general", slugs[0])
}

func TestGroupCategoriesLookup_NonMemberIsRejected(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_catlookup_nonmember"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_catlookup_nonmember"), "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	// bob is intentionally never added as a member of the group.

	lookup := handler.NewGroupCategoriesLookup(env.Queries)
	_, err := lookup.GetGroupCategorySlugs(context.Background(), group.ID, bob.ID)
	require.Error(t, err)
	assert.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestGroupCategoriesLookup_UnknownGroupIsRejected(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_catlookup_unknowngroup"), "Alice")

	lookup := handler.NewGroupCategoriesLookup(env.Queries)
	_, err := lookup.GetGroupCategorySlugs(context.Background(), "01NONEXISTENT00000000000000", alice.ID)
	require.Error(t, err)
}
