//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mergeBody(title string, ids ...string) string {
	b, _ := json.Marshal(map[string]any{
		"title":              title,
		"source_expense_ids": ids,
	})
	return string(b)
}

// mergeResp is the relevant subset of the merge endpoint's expense response.
type mergeResp struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Amount      string `json:"amount"`
	Currency    string `json:"currency"`
	SplitMethod string `json:"split_method"`
	PaidByID    string `json:"paid_by_id"`
	Category    string `json:"category"`
	ExpenseDate string `json:"expense_date"`
	Splits      []struct {
		MemberID string `json:"member_id"`
		Share    string `json:"share"`
	} `json:"splits"`
}

func (m mergeResp) shareByMember() map[string]string {
	out := map[string]string{}
	for _, s := range m.Splits {
		out[s.MemberID] = s.Share
	}
	return out
}

// balancesByMember returns member_id → net_balance (decimal string). Single
// currency in these tests, so one row per member.
func balancesByMember(t *testing.T, env *testutil.Env, groupID, token string) map[string]string {
	t.Helper()
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", token))
	require.Equal(t, http.StatusOK, rr.Code)
	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	out := map[string]string{}
	for _, b := range resp {
		out[b["member_id"].(string)] = b["net_balance"].(string)
	}
	return out
}

func TestExpenses_Merge_CombinesAmountsAndSplits(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// Two equal-split expenses paid by Alice: 10.00 and 6.00.
	dinner := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	lunch := testutil.CreateExpense(t, env.Pool, groupID, "Lunch", 600, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Trip food", dinner.Expense.ID, lunch.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		Amount      string `json:"amount"`
		SplitMethod string `json:"split_method"`
		PaidByID    string `json:"paid_by_id"`
		Splits      []struct {
			MemberID string `json:"member_id"`
			Share    string `json:"share"`
		} `json:"splits"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))

	assert.Equal(t, "Trip food", resp.Title)
	assert.Equal(t, "16.00", resp.Amount) // 10.00 + 6.00
	assert.Equal(t, "exact", resp.SplitMethod)
	assert.Equal(t, aliceMemberID, resp.PaidByID)
	assert.NotEqual(t, dinner.Expense.ID, resp.ID)

	shares := map[string]string{}
	for _, s := range resp.Splits {
		shares[s.MemberID] = s.Share
	}
	// 500+300 each → 8.00 each.
	assert.Equal(t, "8.00", shares[aliceMemberID])
	assert.Equal(t, "8.00", shares[bobMemberID])

	// Both sources are soft-deleted; the merged expense is live.
	for _, id := range []string{dinner.Expense.ID, lunch.Expense.ID} {
		var isDeleted bool
		require.NoError(t, env.Pool.QueryRow(context.Background(),
			"SELECT is_deleted FROM expenses WHERE id = $1", id).Scan(&isDeleted))
		assert.True(t, isDeleted, "source %s should be soft-deleted", id)
	}
	var mergedDeleted bool
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", resp.ID).Scan(&mergedDeleted))
	assert.False(t, mergedDeleted)
}

func TestExpenses_Merge_RejectsDifferentPayers(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// Both authored by Alice (so the author gate passes) but different payers.
	e1 := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "Lunch", 600, "SEK", bobMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", e1.Expense.ID, e2.Expense.ID), alice.Token))
	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code, rr.Body.String())

	// Nothing deleted.
	var isDeleted bool
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", e1.Expense.ID).Scan(&isDeleted))
	assert.False(t, isDeleted)
}

func TestExpenses_Merge_RejectsNonAuthoredSource(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	mine := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	bobs := testutil.CreateExpense(t, env.Pool, groupID, "Lunch", 600, "SEK", aliceMemberID, bob.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", mine.Expense.ID, bobs.Expense.ID), alice.Token))
	assert.Equal(t, http.StatusForbidden, rr.Code, rr.Body.String())
}

func TestExpenses_Merge_RequiresTwoExpenses(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	only := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Same id twice de-dupes to one → 400.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", only.Expense.ID, only.Expense.ID), alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
}

func TestExpenses_Merge_NonMemberForbidden(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	e1 := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "Lunch", 600, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", e1.Expense.ID, e2.Expense.ID), token))
	assert.Equal(t, http.StatusForbidden, rr.Code, rr.Body.String())
}

// ── Edge cases ────────────────────────────────────────────────────────────────

// Merging must be balance-neutral: same payer, and per-member shares sum, so
// nobody's net position changes. This is the core correctness property.
func TestExpenses_Merge_PreservesBalances(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	carol := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	carolMID := testutil.AddMember(t, env.Pool, groupID, carol.ID, "Carol").ID

	// Alice pays three expenses across varying participant sets; 3001 forces a
	// remainder so the penny distribution is exercised.
	e1 := testutil.CreateExpense(t, env.Pool, groupID, "A", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID, carolMID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "B", 6000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e3 := testutil.CreateExpense(t, env.Pool, groupID, "C", 3001, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID, carolMID})

	before := balancesByMember(t, env, groupID, alice.Token)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Merged", e1.Expense.ID, e2.Expense.ID, e3.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	after := balancesByMember(t, env, groupID, alice.Token)
	assert.Equal(t, before, after, "merging must not change anyone's net balance")
}

// Different participant sets must union; the shared member's shares add.
func TestExpenses_Merge_CombinesDisjointParticipants(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	carol := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	carolMID := testutil.AddMember(t, env.Pool, groupID, carol.ID, "Carol").ID

	e1 := testutil.CreateExpense(t, env.Pool, groupID, "AB", 10000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "AC", 10000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, carolMID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", e1.Expense.ID, e2.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp mergeResp
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	shares := resp.shareByMember()
	assert.Equal(t, "200.00", resp.Amount) // 100 + 100
	assert.Equal(t, "100.00", shares[aliceMemberID]) // 50 + 50 (shared member)
	assert.Equal(t, "50.00", shares[bobMemberID])
	assert.Equal(t, "50.00", shares[carolMID])
}

// Any mix of source split methods resolves to a single exact split.
func TestExpenses_Merge_NormalizesMixedSplitMethodsToExact(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// One exact (70/30) via the API, one equal (30/30) via the fixture.
	exactBody := fmt.Sprintf(`{"title":"Exact","amount":"100.00","currency":"SEK","paid_by_id":%q,"split_method":"exact","splits":[{"member_id":%q,"share":"70.00"},{"member_id":%q,"share":"30.00"}]}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	cr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", exactBody, alice.Token))
	require.Equal(t, http.StatusCreated, cr.Code, cr.Body.String())
	var exact mergeResp
	require.NoError(t, json.NewDecoder(cr.Body).Decode(&exact))

	eq := testutil.CreateExpense(t, env.Pool, groupID, "Equal", 6000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", exact.ID, eq.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp mergeResp
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	shares := resp.shareByMember()
	assert.Equal(t, "exact", resp.SplitMethod)
	assert.Equal(t, "160.00", resp.Amount)
	assert.Equal(t, "100.00", shares[aliceMemberID]) // 70 + 30
	assert.Equal(t, "60.00", shares[bobMemberID])    // 30 + 30
}

// Merging an FX-snapshot expense yields a plain group-currency expense whose
// amount is the sum of canonical amounts, with no FX fields — and balances
// (computed from canonical amounts) are unchanged.
func TestExpenses_Merge_DropsFxSnapshotKeepsCanonicalAmount(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	fxBody := fmt.Sprintf(`{"title":"Hotel","amount":"330.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q,%q],"original_amount":"30.00","original_currency":"EUR","fx_rate":"11.00","fx_as_of":"2026-05-21","fx_source":"manual"}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	cr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", fxBody, alice.Token))
	require.Equal(t, http.StatusCreated, cr.Code, cr.Body.String())
	var fx map[string]any
	require.NoError(t, json.NewDecoder(cr.Body).Decode(&fx))
	require.NotEmpty(t, fx["fx_rate"], "precondition: source carries an FX snapshot")
	fxID := fx["id"].(string)

	plain := testutil.CreateExpense(t, env.Pool, groupID, "Taxi", 7000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	before := balancesByMember(t, env, groupID, alice.Token)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Trip", fxID, plain.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "400.00", resp["amount"]) // 330 + 70 canonical
	assert.Equal(t, "SEK", resp["currency"])
	for _, k := range []string{"original_amount", "original_currency", "fx_rate", "fx_as_of", "fx_source"} {
		_, ok := resp[k]
		assert.False(t, ok, "merged expense must not carry %s", k)
	}

	after := balancesByMember(t, env, groupID, alice.Token)
	assert.Equal(t, before, after, "FX merge must be balance-neutral")
}

// The merged expense takes the earliest source date; an empty title falls back
// to the first source's title.
func TestExpenses_Merge_TakesEarliestDateAndDefaultTitle(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	older := testutil.CreateExpenseOn(t, env.Pool, groupID, "Older", 5000, "SEK", aliceMemberID, alice.ID,
		[]string{aliceMemberID, bobMemberID}, time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC))
	newer := testutil.CreateExpenseOn(t, env.Pool, groupID, "Newer", 5000, "SEK", aliceMemberID, alice.ID,
		[]string{aliceMemberID, bobMemberID}, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC))

	// Pass the newer one first to prove the date comes from min(), not order,
	// while the default title comes from the first id.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("", newer.Expense.ID, older.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp mergeResp
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "2026-01-10", resp.ExpenseDate)
	assert.Equal(t, "Newer", resp.Title) // first id's title
}

// Merge writes one expense_added (for the new row) and one expense_deleted per
// source. Fixture-created sources write no activity, so the merge's events are
// the only ones present.
func TestExpenses_Merge_WritesAddedAndDeletedActivity(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	e1 := testutil.CreateExpense(t, env.Pool, groupID, "A", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "B", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Merged", e1.Expense.ID, e2.Expense.ID), alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())
	var resp mergeResp
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID, Limit: 50, Offset: 0,
	})
	require.NoError(t, err)

	deleted := map[string]bool{}
	added := 0
	for _, a := range activity {
		switch a.EventType {
		case "expense_added":
			if a.EntityID.String == resp.ID {
				added++
			}
		case "expense_deleted":
			deleted[a.EntityID.String] = true
		}
	}
	assert.Equal(t, 1, added, "one expense_added for the merged row")
	assert.True(t, deleted[e1.Expense.ID] && deleted[e2.Expense.ID], "both sources logged as deleted")
}

// Merge is a write op and must respect the group lock.
func TestExpenses_Merge_LockedGroupReturns409(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	e1 := testutil.CreateExpense(t, env.Pool, groupID, "A", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	e2 := testutil.CreateExpense(t, env.Pool, groupID, "B", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	lr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/lock", "", alice.Token))
	require.Equal(t, http.StatusOK, lr.Code, lr.Body.String())

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Merged", e1.Expense.ID, e2.Expense.ID), alice.Token))
	require.Equal(t, http.StatusConflict, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "group_locked", resp["code"])

	// Nothing got deleted.
	var isDeleted bool
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", e1.Expense.ID).Scan(&isDeleted))
	assert.False(t, isDeleted)
}

// A source from another group can't be merged in (scoped lookup → 404), even
// for a user who belongs to both groups.
func TestExpenses_Merge_SourceFromOtherGroupNotFound(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	otherGroup, otherAliceMID := testutil.CreateGroup(t, env.Pool, "Other", "SEK", alice.ID, "Alice")

	mine := testutil.CreateExpense(t, env.Pool, groupID, "Mine", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	elsewhere := testutil.CreateExpense(t, env.Pool, otherGroup.ID, "Elsewhere", 5000, "SEK", otherAliceMID.ID, alice.ID, []string{otherAliceMID.ID})

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses/merge",
		mergeBody("Merged", mine.Expense.ID, elsewhere.Expense.ID), alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code, rr.Body.String())
}
