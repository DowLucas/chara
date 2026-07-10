//go:build integration

package handler_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertest"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// expenseMakesBobOweAlice posts an equal-split expense paid by Alice so Bob
// ends up owing her — the precondition for Alice reminding Bob.
func expenseMakesBobOweAlice(t *testing.T, env *testutil.Env, aliceToken, groupID, aliceMemberID, bobMemberID string) {
	t.Helper()
	body := fmt.Sprintf(`{
		"title": "Dinner",
		"amount": "100.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, aliceToken))
	require.Equal(t, http.StatusCreated, rr.Code)
}

func TestSettleReminders_EnqueuesForDebtors(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	expenseMakesBobOweAlice(t, env, alice.Token, groupID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle-reminders", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	job := rivertest.RequireInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.SettleReminderArgs{}, nil)
	require.Equal(t, groupID, job.Args.GroupID)
	require.Equal(t, "Alice", job.Args.CreditorName)
	require.Equal(t, []string{bob.ID}, job.Args.RecipientUserIDs)
}

func TestSettleReminders_ThrottledWithin48h(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	expenseMakesBobOweAlice(t, env, alice.Token, groupID, aliceMemberID, bobMemberID)

	first := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle-reminders", "", alice.Token))
	require.Equal(t, http.StatusOK, first.Code)

	second := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle-reminders", "", alice.Token))
	require.Equal(t, http.StatusTooManyRequests, second.Code)
}

func TestSettleReminders_NoDebtors(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	// No expenses → nobody owes Alice.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle-reminders", "", alice.Token))
	require.Equal(t, http.StatusUnprocessableEntity, rr.Code)

	rivertest.RequireNotInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.SettleReminderArgs{}, nil)
}

func TestSettleReminders_RequiresMembership(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	expenseMakesBobOweAlice(t, env, alice.Token, groupID, aliceMemberID, bobMemberID)

	carol := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	carolToken := env.MintToken(t, carol.ID, carol.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle-reminders", "", carolToken))
	require.Equal(t, http.StatusForbidden, rr.Code)
}
