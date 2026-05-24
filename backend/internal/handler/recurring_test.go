//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
)

// setupRecurringEnv mirrors setupExpenseEnv but is used by the recurring
// suite. Two members, owner == Alice.
func setupRecurringEnv(t *testing.T) (env *testutil.Env, alice, bob testUserEnv, groupID, aliceMID, bobMID string) {
	t.Helper()
	env = testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	aliceU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	bobU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Recurring trip", "SEK", aliceU.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, group.ID, bobU.ID, "Bob")
	alice = testUserEnv{ID: aliceU.ID, Email: aliceU.Email, Token: env.MintToken(t, aliceU.ID, aliceU.Email)}
	bob = testUserEnv{ID: bobU.ID, Email: bobU.Email, Token: env.MintToken(t, bobU.ID, bobU.Email)}
	return env, alice, bob, group.ID, aliceMem.ID, bobMem.ID
}

func tomorrowStr() string {
	return time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02")
}

func TestRecurring_Create_HappyPath(t *testing.T) {
	env, alice, _, groupID, aliceMID, bobMID := setupRecurringEnv(t)

	body := fmt.Sprintf(`{
		"title": "Rent",
		"amount_minor": 850000,
		"paid_by_id": %q,
		"split_method": "equal",
		"splits": [{"member_id": %q, "value": 0}, {"member_id": %q, "value": 0}],
		"freq_unit": "month",
		"freq_interval": 1,
		"start_date": %q,
		"timezone": "Europe/Stockholm",
		"fire_local_time": "09:00"
	}`, aliceMID, aliceMID, bobMID, tomorrowStr())

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Rent", resp["title"])
	assert.Equal(t, float64(850000), resp["amount_minor"])
	assert.Equal(t, "SEK", resp["currency"])
	assert.Equal(t, "active", resp["status"])
	assert.Equal(t, "month", resp["freq_unit"])
	splits := resp["splits"].([]any)
	require.Len(t, splits, 2)
}

func TestRecurring_Create_RejectsLockedGroup(t *testing.T) {
	env, alice, _, groupID, aliceMID, bobMID := setupRecurringEnv(t)
	_, err := env.Queries.SetGroupLocked(context.Background(), db.SetGroupLockedParams{
		ID: groupID, IsLocked: true,
	})
	require.NoError(t, err)

	body := fmt.Sprintf(`{
		"title": "Rent","amount_minor": 100,"paid_by_id": %q,"split_method": "equal",
		"splits":[{"member_id":%q,"value":0},{"member_id":%q,"value":0}],
		"freq_unit":"month","freq_interval":1,
		"start_date": %q,"timezone":"UTC","fire_local_time":"09:00"
	}`, aliceMID, aliceMID, bobMID, tomorrowStr())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring", body, alice.Token))
	require.Equal(t, http.StatusConflict, rr.Code)
}

func TestRecurring_Create_RejectsPastStartDate(t *testing.T) {
	env, alice, _, groupID, aliceMID, bobMID := setupRecurringEnv(t)
	past := time.Now().UTC().AddDate(0, 0, -3).Format("2006-01-02")
	body := fmt.Sprintf(`{
		"title": "Old","amount_minor": 100,"paid_by_id": %q,"split_method": "equal",
		"splits":[{"member_id":%q,"value":0},{"member_id":%q,"value":0}],
		"freq_unit":"month","freq_interval":1,
		"start_date": %q,"timezone":"UTC","fire_local_time":"09:00"
	}`, aliceMID, aliceMID, bobMID, past)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring", body, alice.Token))
	require.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestRecurring_Patch_RejectsCurrencyChange(t *testing.T) {
	env, alice, _, groupID, ruleID := seedRule(t)
	body := `{"currency": "EUR", "title":"x","amount_minor":1,"paid_by_id":"x","split_method":"equal","splits":[],"freq_unit":"month","freq_interval":1,"timezone":"UTC","fire_local_time":"09:00"}`
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/recurring/"+ruleID, body, alice.Token))
	require.Equal(t, http.StatusBadRequest, rr.Code)
	var resp map[string]string
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "currency_immutable", resp["code"])
}

func TestRecurring_Patch_RejectsStartDateChange(t *testing.T) {
	env, alice, _, groupID, ruleID := seedRule(t)
	body := fmt.Sprintf(`{"start_date": %q, "title":"x","amount_minor":1,"paid_by_id":"x","split_method":"equal","splits":[],"freq_unit":"month","freq_interval":1,"timezone":"UTC","fire_local_time":"09:00"}`, tomorrowStr())
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/recurring/"+ruleID, body, alice.Token))
	require.Equal(t, http.StatusBadRequest, rr.Code)
	var resp map[string]string
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "start_date_immutable", resp["code"])
}

// seedRule sets up env + alice/bob + a valid recurring rule and returns
// (env, alice, bob, groupID, ruleID).
func seedRule(t *testing.T) (*testutil.Env, testUserEnv, testUserEnv, string, string) {
	t.Helper()
	env, alice, bob, groupID, aliceMID, bobMID := setupRecurringEnv(t)
	body := fmt.Sprintf(`{
		"title": "Rent","amount_minor": 1000,"paid_by_id": %q,"split_method": "equal",
		"splits":[{"member_id":%q,"value":0},{"member_id":%q,"value":0}],
		"freq_unit":"month","freq_interval":1,
		"start_date": %q,"timezone":"UTC","fire_local_time":"09:00"
	}`, aliceMID, aliceMID, bobMID, tomorrowStr())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	return env, alice, bob, groupID, resp["id"].(string)
}

func TestRecurring_Patch_FutureOnly_DoesNotTouchPastExpenses(t *testing.T) {
	env, alice, _, groupID, ruleID := seedRule(t)

	// Materialize a first expense via the fire worker.
	rule, err := env.Queries.GetRecurringExpense(context.Background(), ruleID)
	require.NoError(t, err)
	w := &jobs.RecurringFireWorker{Pool: env.Pool, Queries: env.Queries}
	// Force NextFireAt back to NOW so the worker fires immediately.
	_, err = env.Pool.Exec(context.Background(),
		"UPDATE recurring_expenses SET next_fire_at = NOW() WHERE id = $1", ruleID)
	require.NoError(t, err)
	require.NoError(t, jobs.FireForTest(context.Background(), w, jobs.RecurringFireArgs{
		RecurringID: ruleID, FireAt: time.Now().UTC(),
	}))

	exps, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: rule.GroupID, Limit: 100, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, exps, 1)
	originalAmount := exps[0].Amount

	// PATCH the rule to a new amount.
	members, _ := env.Queries.ListGroupMembers(context.Background(), groupID)
	body := fmt.Sprintf(`{
		"title": "Rent v2","amount_minor": 9999,"paid_by_id": %q,"split_method":"equal",
		"splits":[{"member_id":%q,"value":0},{"member_id":%q,"value":0}],
		"freq_unit":"month","freq_interval":1,
		"timezone":"UTC","fire_local_time":"09:00"
	}`, members[0].ID, members[0].ID, members[1].ID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/recurring/"+ruleID, body, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	// Past expense untouched.
	exps2, _ := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: rule.GroupID, Limit: 100, Offset: 0,
	})
	require.Len(t, exps2, 1)
	require.Equal(t, originalAmount, exps2[0].Amount, "past expense must not be retroactively updated")
}

func TestRecurring_Delete_HardDeletesRule_KeepsHistoryRows(t *testing.T) {
	env, alice, _, groupID, ruleID := seedRule(t)

	// Materialize an expense first.
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE recurring_expenses SET next_fire_at = NOW() WHERE id = $1", ruleID)
	require.NoError(t, err)
	w := &jobs.RecurringFireWorker{Pool: env.Pool, Queries: env.Queries}
	require.NoError(t, jobs.FireForTest(context.Background(), w, jobs.RecurringFireArgs{
		RecurringID: ruleID, FireAt: time.Now().UTC(),
	}))

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/recurring/"+ruleID, "", alice.Token))
	require.Equal(t, http.StatusNoContent, rr.Code)

	// Rule gone.
	_, err = env.Queries.GetRecurringExpense(context.Background(), ruleID)
	require.Error(t, err)

	// History row remains (source_kind/source_id stay; the FK on
	// expenses.source_id is intentionally not declared so deletion is
	// allowed).
	exps, _ := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{
		GroupID: groupID, Limit: 100, Offset: 0,
	})
	require.Len(t, exps, 1, "materialized expense must survive rule deletion")
}

func TestRecurring_Pause_ThenResume_RecomputesNextFireAtNow(t *testing.T) {
	env, alice, _, groupID, ruleID := seedRule(t)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring/"+ruleID+"/pause", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	// Shove next_fire_at far in the past to simulate a paused rule.
	past := time.Now().UTC().AddDate(0, -6, 0)
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE recurring_expenses SET next_fire_at = $2 WHERE id = $1", ruleID, past)
	require.NoError(t, err)

	beforeResume := time.Now().UTC()
	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring/"+ruleID+"/resume", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	after, _ := env.Queries.GetRecurringExpense(context.Background(), ruleID)
	assert.Equal(t, "active", after.Status)
	assert.False(t, after.PausedReason.Valid, "paused_reason cleared on resume")
	assert.True(t, after.NextFireAt.Time.After(beforeResume.Add(-time.Second)),
		"next_fire_at should be reset to ~NOW (was %v, beforeResume %v)", after.NextFireAt.Time, beforeResume)
}

func TestRecurring_ResumeAllAfterUnlock_OnlyResumesGroupLockedAndOnlyForCreator(t *testing.T) {
	env, alice, bob, groupID, aliceMID, bobMID := setupRecurringEnv(t)

	// Alice creates one rule; Bob creates another. Both will be marked
	// group_locked-paused; only Alice's should resume from her call.
	for _, who := range []struct {
		token string
	}{{alice.Token}, {bob.Token}} {
		body := fmt.Sprintf(`{
			"title":"R","amount_minor":100,"paid_by_id":%q,"split_method":"equal",
			"splits":[{"member_id":%q,"value":0},{"member_id":%q,"value":0}],
			"freq_unit":"month","freq_interval":1,
			"start_date": %q,"timezone":"UTC","fire_local_time":"09:00"
		}`, aliceMID, aliceMID, bobMID, tomorrowStr())
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/recurring", body, who.token))
		require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Manually mark them paused / group_locked.
	rules, err := env.Queries.ListRecurringExpensesByGroup(context.Background(), groupID)
	require.NoError(t, err)
	require.Len(t, rules, 2)
	for _, r := range rules {
		_, err := env.Queries.SetRecurringStatus(context.Background(), db.SetRecurringStatusParams{
			ID: r.ID, Status: "paused",
			PausedReason: pgtype.Text{String: "group_locked", Valid: true},
		})
		require.NoError(t, err)
	}

	// One Alice rule paused with a different reason — must stay paused.
	manualPaused := rules[0]
	if manualPaused.CreatedByID != alice.ID {
		manualPaused = rules[1]
	}
	_, err = env.Queries.SetRecurringStatus(context.Background(), db.SetRecurringStatusParams{
		ID: manualPaused.ID, Status: "paused",
		PausedReason: pgtype.Text{String: "manual", Valid: true},
	})
	require.NoError(t, err)

	rr := env.Do(t, env.AuthRequest(t, "POST",
		"/api/groups/"+groupID+"/recurring/resume-all-after-unlock", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	// After: every Bob rule still paused, every Alice "group_locked" rule
	// active, manual-paused Alice rule still paused.
	after, _ := env.Queries.ListRecurringExpensesByGroup(context.Background(), groupID)
	for _, r := range after {
		switch {
		case r.CreatedByID == bob.ID:
			assert.Equal(t, "paused", r.Status, "bob rules untouched")
		case r.ID == manualPaused.ID:
			assert.Equal(t, "paused", r.Status, "alice manual-paused rule untouched")
		default:
			assert.Equal(t, "active", r.Status, "alice group_locked rule resumed")
		}
	}
}
