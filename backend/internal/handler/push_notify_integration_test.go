//go:build integration

package handler_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertest"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// newInsertOnlyRiverClient builds a real River client against the test pool.
// It is never Start()ed — Insert only requires the driver's pool, not a
// running client — which keeps these tests from racing a background worker.
func newInsertOnlyRiverClient(t *testing.T, env *testutil.Env) *river.Client[pgx.Tx] {
	t.Helper()
	workers := jobs.RegisterWorkers(env.Pool, env.Queries, env.Config.BaseURL, nil)
	rc, err := jobs.New(env.Pool, workers)
	require.NoError(t, err)
	return rc
}

func TestExpenses_Create_EnqueuesPushNotification(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	body := fmt.Sprintf(`{
		"title": "Dinner",
		"amount": "90.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	job := rivertest.RequireInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.PushNotifyArgs{}, nil)
	require.Equal(t, "expense_added", job.Args.EventKind)
	require.Equal(t, groupID, job.Args.GroupID)
	require.Equal(t, alice.ID, job.Args.ActorUserID)
	require.Equal(t, "Dinner", job.Args.Title)
	require.Equal(t, int64(9000), job.Args.AmountMinor)
	require.Equal(t, "SEK", job.Args.Currency)
}

func TestExpenses_Create_NoPushWhenRiverClientNil(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	// setupExpenseEnv already wires env.Router with a nil river client.

	body := fmt.Sprintf(`{
		"title": "Dinner",
		"amount": "90.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	rivertest.RequireNotInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.PushNotifyArgs{}, nil)
}

func TestBalances_Settle_EnqueuesPushNotification(t *testing.T) {
	env, _, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	body := fmt.Sprintf(`{
		"from_member_id": %q,
		"to_member_id": %q,
		"amount": "10.00",
		"currency": "SEK"
	}`, bobMemberID, aliceMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	job := rivertest.RequireInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.PushNotifyArgs{}, nil)
	require.Equal(t, "settlement_recorded", job.Args.EventKind)
	require.Equal(t, groupID, job.Args.GroupID)
	require.Equal(t, bob.ID, job.Args.ActorUserID)
	require.Equal(t, int64(1000), job.Args.AmountMinor)
	require.Equal(t, "SEK", job.Args.Currency)
}
