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
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── ListGroupBalances ─────────────────────────────────────────────────────────

func TestBalances_ListGroup_ReflectsExpenses(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// Alice pays 90.00 SEK split equally → Alice: +45.00, Bob: -45.00
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 2)

	byMember := indexByMemberID(resp)
	assert.Equal(t, "45.00", byMember[aliceMemberID]["net_balance"])
	assert.Equal(t, "-45.00", byMember[bobMemberID]["net_balance"])
	assert.Equal(t, "SEK", byMember[aliceMemberID]["currency"])
}

func TestBalances_ListGroup_RequiresMembership(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)
	outsider := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "outsider"), "Outsider")
	token := env.MintToken(t, outsider.ID, outsider.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestBalances_ListGroup_EmptyWhenNoExpenses(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Empty(t, resp)
}

func TestBalances_ListGroup_IncludesMemberName(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Coffee", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.NotEmpty(t, resp)

	byMember := indexByMemberID(resp)
	assert.Equal(t, "Alice", byMember[aliceMemberID]["name"])
}

// ── Settle ────────────────────────────────────────────────────────────────────

func TestSettle_Create_RecordsSettlement(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, bobMemberID, resp["from_member_id"])
	assert.Equal(t, aliceMemberID, resp["to_member_id"])
	assert.Equal(t, "45.00", resp["amount"])
	assert.Equal(t, "SEK", resp["currency"])
	assert.NotEmpty(t, resp["id"])
}

func TestSettle_Create_BalanceReachesZero(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var balances []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&balances))
	for _, b := range balances {
		assert.Equal(t, "0.00", b["net_balance"])
	}
}

func TestSettle_Create_RequiresMembership(t *testing.T) {
	env, _, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	outsider := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "outsider"), "Outsider")
	token := env.MintToken(t, outsider.ID, outsider.Email)

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestSettle_Create_RejectsZeroAmount(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"0.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestSettle_Create_RejectsMemberFromAnotherGroup(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)

	carolU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	_, carolMem := testutil.CreateGroup(t, env.Pool, "Other Group", "SEK", carolU.ID, "Carol")

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"10.00","currency":"SEK"}`, carolMem.ID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// TestSettle_GenericMemberError guards against information disclosure: the
// response for a member ID from a different group must be identical to the
// response for a totally bogus ID, so a client can't probe whether a member
// exists anywhere in the system.
func TestSettle_GenericMemberError(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)

	carolU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	_, carolMem := testutil.CreateGroup(t, env.Pool, "Other Group", "SEK", carolU.ID, "Carol")

	bogusMemberID := "01HZZNONEXISTENT00000000"

	otherGroupBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"10.00","currency":"SEK"}`, carolMem.ID, aliceMemberID)
	otherGroupRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", otherGroupBody, alice.Token))

	bogusBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"10.00","currency":"SEK"}`, bogusMemberID, aliceMemberID)
	bogusRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", bogusBody, alice.Token))

	require.Equal(t, http.StatusBadRequest, otherGroupRR.Code)
	require.Equal(t, http.StatusBadRequest, bogusRR.Code)

	var otherGroupResp, bogusResp map[string]any
	require.NoError(t, json.NewDecoder(otherGroupRR.Body).Decode(&otherGroupResp))
	require.NoError(t, json.NewDecoder(bogusRR.Body).Decode(&bogusResp))
	assert.Equal(t, otherGroupResp["error"], bogusResp["error"],
		"settle error message must not differ between cross-group and non-existent member IDs")
}

// ── SuggestSettlements ────────────────────────────────────────────────────────

func TestSuggestSettlements_TwoParty(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	// Alice pays 90.00 SEK split equally → Bob owes Alice 45.00
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 1)
	assert.Equal(t, bobMemberID, resp[0]["from_member_id"])
	assert.Equal(t, aliceMemberID, resp[0]["to_member_id"])
	assert.Equal(t, "45.00", resp[0]["amount"])
	assert.Equal(t, "SEK", resp[0]["currency"])
}

func TestSuggestSettlements_RequiresMembership(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)
	outsider := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "outsider"), "Outsider")
	token := env.MintToken(t, outsider.ID, outsider.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestSuggestSettlements_EmptyWhenAllSettled(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Empty(t, resp)
}

func TestSuggestSettlements_EmptyAfterManualSettle(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Empty(t, resp)
}

func TestSuggestSettlements_ThreeMembers_AtMostNMinusOne(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	carolU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	carolMember := testutil.AddMember(t, env.Pool, groupID, carolU.ID, "Carol")

	// Alice pays 90 SEK split three ways → +60 Alice, -30 Bob, -30 Carol (odd-cent: 30/30/30)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID,
		[]string{aliceMemberID, bobMemberID, carolMember.ID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.LessOrEqual(t, len(resp), 2) // n-1 = 2 with n=3 members
	for _, s := range resp {
		assert.Equal(t, aliceMemberID, s["to_member_id"])
		assert.Equal(t, "30.00", s["amount"])
	}
}

func TestSuggestSettlements_MultiCurrency(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	// Alice pays 90 SEK split equally
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	// Bob pays 40 EUR split equally
	testutil.CreateExpense(t, env.Pool, groupID, "Lunch", 4000, "EUR", bobMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/settle-suggestions", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 2)

	byCurrency := map[string]map[string]any{}
	for _, s := range resp {
		byCurrency[s["currency"].(string)] = s
	}
	assert.Equal(t, "45.00", byCurrency["SEK"]["amount"])
	assert.Equal(t, bobMemberID, byCurrency["SEK"]["from_member_id"])
	assert.Equal(t, "20.00", byCurrency["EUR"]["amount"])
	assert.Equal(t, aliceMemberID, byCurrency["EUR"]["from_member_id"])
}

// ── ListMyBalances ────────────────────────────────────────────────────────────

func TestMyBalances_ReturnsBalancesAcrossGroups(t *testing.T) {
	env, alice, bob, groupID1, aliceMem1, bobMem1 := setupExpenseEnv(t)

	// Group 1: Alice pays 90 SEK, split equally → Alice: +45, Bob: -45
	testutil.CreateExpense(t, env.Pool, groupID1, "Dinner", 9000, "SEK", aliceMem1, alice.ID, []string{aliceMem1, bobMem1})

	// Group 2: Bob pays 60 SEK, split equally → Alice: -30, Bob: +30
	group2, aliceMem2 := testutil.CreateGroup(t, env.Pool, "Road Trip", "SEK", alice.ID, "Alice")
	bobMem2 := testutil.AddMember(t, env.Pool, group2.ID, bob.ID, "Bob")
	testutil.CreateExpense(t, env.Pool, group2.ID, "Gas", 6000, "SEK", bobMem2.ID, bob.ID, []string{aliceMem2.ID, bobMem2.ID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 2)

	byGroup := map[string]map[string]any{}
	for _, b := range resp {
		byGroup[b["group_id"].(string)] = b
	}

	assert.Equal(t, "45.00", byGroup[groupID1]["net_balance"])
	assert.Equal(t, "-30.00", byGroup[group2.ID]["net_balance"])
}

func TestMyBalances_EmptyWhenNoExpenses(t *testing.T) {
	env, alice, _, _, _, _ := setupExpenseEnv(t)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Empty(t, resp)
}

func TestMyBalances_IncludesGroupName(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 1)

	assert.Equal(t, "Sweden Trip", resp[0]["group_name"])
}

// ── ListMyBalances: last_balance_change_at ────────────────────────────────────

func TestMyBalances_LastChangeAt_SetByExpense(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	before := time.Now().Add(-2 * time.Second)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	resp := fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)

	ts := parseLastChangeAt(t, resp[0])
	assert.True(t, ts.After(before), "last_balance_change_at %s should be after expense creation %s", ts, before)
}

func TestMyBalances_LastChangeAt_BumpedBySettlement(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	resp := fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)
	afterExpense := parseLastChangeAt(t, resp[0])

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	settleRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, settleRR.Code)

	resp = fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)
	afterSettle := parseLastChangeAt(t, resp[0])

	assert.True(t, afterSettle.After(afterExpense),
		"settlement should bump last_balance_change_at: %s should be after %s", afterSettle, afterExpense)
}

func TestMyBalances_LastChangeAt_IgnoresExpensesNotInvolvingUser(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	carolU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	carolMember := testutil.AddMember(t, env.Pool, groupID, carolU.ID, "Carol")

	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	resp := fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)
	afterOwn := parseLastChangeAt(t, resp[0])

	// Bob pays, split Bob+Carol only — cannot change Alice's balance.
	testutil.CreateExpense(t, env.Pool, groupID, "Taxi", 3000, "SEK", bobMemberID, bob.ID, []string{bobMemberID, carolMember.ID})

	resp = fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)
	afterUnrelated := parseLastChangeAt(t, resp[0])

	assert.True(t, afterUnrelated.Equal(afterOwn),
		"unrelated expense must not bump last_balance_change_at: got %s, want %s", afterUnrelated, afterOwn)
}

func TestMyBalances_LastChangeAt_AbsentWhenNoEventsInvolveUser(t *testing.T) {
	env, alice, bob, groupID, _, bobMemberID := setupExpenseEnv(t)

	// Bob pays an expense split only on himself — Alice gets a (zero) balance
	// row but no event ever touched her balance.
	testutil.CreateExpense(t, env.Pool, groupID, "Solo snack", 1000, "SEK", bobMemberID, bob.ID, []string{bobMemberID})

	resp := fetchMyBalances(t, env, alice.Token)
	require.Len(t, resp, 1)
	assert.Equal(t, "0.00", resp[0]["net_balance"])

	_, present := resp[0]["last_balance_change_at"]
	assert.False(t, present, "last_balance_change_at should be absent when no balance events involve the user")
}

// ── helpers ───────────────────────────────────────────────────────────────────

func fetchMyBalances(t *testing.T, env *testutil.Env, token string) []map[string]any {
	t.Helper()
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/balances", "", token))
	require.Equal(t, http.StatusOK, rr.Code)
	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	return resp
}

func parseLastChangeAt(t *testing.T, item map[string]any) time.Time {
	t.Helper()
	raw, ok := item["last_balance_change_at"].(string)
	require.True(t, ok, "last_balance_change_at missing or not a string in %v", item)
	ts, err := time.Parse(time.RFC3339, raw)
	require.NoError(t, err)
	return ts
}

func indexByMemberID(items []map[string]any) map[string]map[string]any {
	out := make(map[string]map[string]any, len(items))
	for _, item := range items {
		if id, ok := item["member_id"].(string); ok {
			out[id] = item
		}
	}
	return out
}

// ── Settlement method ─────────────────────────────────────────────────────────

func TestSettle_Create_WithSwishMethod_PersistsAndReflectsInBalance(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK","method":"swish"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "swish", resp["method"])

	// Balance reflects the settlement.
	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)
	var balances []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&balances))
	for _, b := range balances {
		assert.Equal(t, "0.00", b["net_balance"])
	}
}

func TestSettle_Create_RejectsBogusMethod(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"10.00","currency":"SEK","method":"bogus"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestSettle_Create_DefaultsToManualMethod(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"10.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "manual", resp["method"])
}

// ── Settlement FX snapshot ────────────────────────────────────────────────────

func TestSettle_Create_PersistsFxSnapshot(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Bob owes 45 SEK; settles by paying 4.20 EUR at a stored rate of
	// 10.7142857 SEK per EUR. The canonical settlement is still 45 SEK
	// (so balance math doesn't change); the FX snapshot preserves what
	// Bob actually moved.
	body := fmt.Sprintf(
		`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK","original_amount":"4.20","original_currency":"EUR","fx_rate":"10.7142857","fx_as_of":"2026-05-21"}`,
		bobMemberID, aliceMemberID,
	)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "45.00", resp["amount"])
	assert.Equal(t, "SEK", resp["currency"])
	assert.Equal(t, "4.20", resp["original_amount"])
	assert.Equal(t, "EUR", resp["original_currency"])
	assert.Equal(t, "2026-05-21", resp["fx_as_of"])
	// fx_rate is rendered to 8 fractional digits to match the expense
	// response convention.
	assert.Equal(t, "10.71428570", resp["fx_rate"])
}

func TestSettle_Create_OmitsFxFieldsWhenAbsent(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	_, hasOriginal := resp["original_amount"]
	_, hasRate := resp["fx_rate"]
	assert.False(t, hasOriginal, "original_amount should be omitted when absent")
	assert.False(t, hasRate, "fx_rate should be omitted when absent")
}

func TestSettle_Create_RejectsPartialFxSnapshot(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{
			name: "missing fx_rate",
			body: `"original_amount":"4.20","original_currency":"EUR","fx_as_of":"2026-05-21"`,
		},
		{
			name: "missing fx_as_of",
			body: `"original_amount":"4.20","original_currency":"EUR","fx_rate":"10.7142857"`,
		},
		{
			name: "missing original_currency",
			body: `"original_amount":"4.20","fx_rate":"10.7142857","fx_as_of":"2026-05-21"`,
		},
		{
			name: "missing original_amount",
			body: `"original_currency":"EUR","fx_rate":"10.7142857","fx_as_of":"2026-05-21"`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env, _, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
			body := fmt.Sprintf(
				`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK",%s}`,
				bobMemberID, aliceMemberID, tc.body,
			)
			rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
			assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
		})
	}
}

func TestSettle_Create_RejectsMalformedFxFields(t *testing.T) {
	env, _, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(
		`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK","original_amount":"4.20","original_currency":"EUR","fx_rate":"not-a-number","fx_as_of":"2026-05-21"}`,
		bobMemberID, aliceMemberID,
	)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
}

// ── /api/me/net (home-currency aggregate) ─────────────────────────────────────

func TestMyNet_RequiresInQueryParam(t *testing.T) {
	env, alice, _, _, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net", "", alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMyNet_RejectsBogusCurrency(t *testing.T) {
	env, alice, _, _, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=foobar", "", alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMyNet_SameCurrencyAsHome_IsIdentity(t *testing.T) {
	// Alice paid 90.00 SEK for dinner split with Bob (45.00 each). With
	// home=SEK, the aggregate equals her per-currency net (45.00) exactly.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	_ = bobMemberID
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=SEK", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "SEK", resp["home_currency"])
	assert.Equal(t, "45.00", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
}

func TestMyNet_CrossCurrency_UsesEcbAtLegDate(t *testing.T) {
	// SEK group: Alice paid 90 SEK; we ask the aggregate in EUR.
	// Seed an ECB rate of 1 EUR = 11.30 SEK on a fixed date and create the
	// expense on that date — the aggregate should be 45/11.30 = 3.98... ≈ €3.98.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	d := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, d)
	testutil.CreateExpenseOn(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID}, d)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "EUR", resp["home_currency"])
	// 4500 / 11.30 = 398.23... → "3.98"
	assert.Equal(t, "3.98", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
}

func TestMyNet_StableUnderMarketMoves(t *testing.T) {
	// The home aggregate must be invariant under FX moves AFTER the expense
	// was created. We compute the aggregate, seed a later (different) rate
	// for "today", recompute, and assert the number is unchanged.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	legDate := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, legDate)
	testutil.CreateExpenseOn(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID}, legDate)

	rr1 := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr1.Code)
	var before map[string]any
	require.NoError(t, json.NewDecoder(rr1.Body).Decode(&before))

	// Simulate a market move: a much later (different) rate for the same
	// pair. fx.Convert picks the closest by |diff|, but the leg's date is
	// pinned so 2026-05-15 still wins.
	testutil.SeedFxRate(t, env.Pool, "SEK", 13.50, legDate.AddDate(0, 0, 7))

	rr2 := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr2.Code)
	var after map[string]any
	require.NoError(t, json.NewDecoder(rr2.Body).Decode(&after))

	assert.Equal(t, before["net_minor"], after["net_minor"],
		"aggregate must not move when no transaction occurred")
}

func TestMyNet_EstimatedWhenRateMissing(t *testing.T) {
	// Expense exists; no ECB rate for SEK at any date. The leg is counted
	// as estimated, excluded from the sum, and the response surfaces the
	// estimated_legs field so the UI can show an asterisk.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	// Two legs (Alice's paid leg + Alice's share leg) both in SEK with no
	// EUR rate → both estimated. Net is 0.
	assert.Equal(t, "0.00", resp["net_minor"])
	assert.Greater(t, resp["estimated_legs"], float64(0))
}

func TestMyNet_SettlementsReduceNet(t *testing.T) {
	// Bob owes Alice 45 SEK. Bob pays. Aggregate for Alice (in SEK home)
	// returns to 0.00.
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=SEK", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "0.00", resp["net_minor"])
}

func TestMyNet_RevertedSettlementsExcluded(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)
	var settled map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&settled))
	sid := settled["id"].(string)

	// Revert the settlement → Alice is back to being owed 45 SEK.
	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+sid+"/revert", "", alice.Token))
	require.True(t, rr.Code == http.StatusOK || rr.Code == http.StatusNoContent, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=SEK", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "45.00", resp["net_minor"])
}

func TestMyNet_MixedCurrencyAcrossTwoGroups(t *testing.T) {
	// Alice in two groups: a SEK group (paid 90, owes 45) and a EUR group
	// (paid 20, owes 10). Each expense lands on its own date with its own
	// seeded ECB rate, so we also verify the leg uses *its own* date's
	// rate, not today's.
	//
	// In EUR home:
	//   SEK group: paid leg +9000 SEK / 11.30 = +796; share -4500 / 11.30 = -398 → +398
	//   EUR group (same-currency identity): +2000 + (-1000) = +1000
	//   Total = 1398 minor EUR → "13.98".
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)

	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_mn"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_mn"), "Bob")
	aliceTok := env.MintToken(t, alice.ID, alice.Email)

	sekGroup, aliceSekMem := testutil.CreateGroup(t, env.Pool, "Sweden", "SEK", alice.ID, "Alice")
	bobSekMem := testutil.AddMember(t, env.Pool, sekGroup.ID, bob.ID, "Bob")
	eurGroup, aliceEurMem := testutil.CreateGroup(t, env.Pool, "Berlin", "EUR", alice.ID, "Alice")
	bobEurMem := testutil.AddMember(t, env.Pool, eurGroup.ID, bob.ID, "Bob")

	dSek := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	dEur := time.Date(2026, 5, 12, 0, 0, 0, 0, time.UTC)
	// Wildly different rate on the EUR-expense date — if the SEK group's
	// legs accidentally used dEur's rate, the answer would diverge.
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, dSek)
	testutil.SeedFxRate(t, env.Pool, "SEK", 99.00, dEur)

	testutil.CreateExpenseOn(t, env.Pool, sekGroup.ID, "Dinner", 9000, "SEK",
		aliceSekMem.ID, alice.ID, []string{aliceSekMem.ID, bobSekMem.ID}, dSek)
	testutil.CreateExpenseOn(t, env.Pool, eurGroup.ID, "Beer", 2000, "EUR",
		aliceEurMem.ID, alice.ID, []string{aliceEurMem.ID, bobEurMem.ID}, dEur)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", aliceTok))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "EUR", resp["home_currency"])
	assert.Equal(t, "13.98", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
	assert.Equal(t, float64(2), resp["contributing_groups"])
}

func TestMyNet_ThreeDifferentCurrencyGroups(t *testing.T) {
	// SEK, EUR, JPY — Alice contributes in all three. Home=EUR.
	//   SEK (rate 11.30): legs +9000, -4500 → +796, -398 = +398
	//   EUR (identity):    +2000, -1000              = +1000
	//   JPY (rate 100):    +100000, -50000 → +1000, -500 = +500
	//   Total = 1898 → "18.98". (Picked rates that divide cleanly so
	//   big.Float precision can't nudge a round-to-nearest edge case.)
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)

	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_3c"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_3c"), "Bob")
	aliceTok := env.MintToken(t, alice.ID, alice.Email)

	sekG, aliceSek := testutil.CreateGroup(t, env.Pool, "SE", "SEK", alice.ID, "Alice")
	bobSek := testutil.AddMember(t, env.Pool, sekG.ID, bob.ID, "Bob")
	eurG, aliceEur := testutil.CreateGroup(t, env.Pool, "EU", "EUR", alice.ID, "Alice")
	bobEur := testutil.AddMember(t, env.Pool, eurG.ID, bob.ID, "Bob")
	jpyG, aliceJpy := testutil.CreateGroup(t, env.Pool, "JP", "JPY", alice.ID, "Alice")
	bobJpy := testutil.AddMember(t, env.Pool, jpyG.ID, bob.ID, "Bob")

	d := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, d)
	testutil.SeedFxRate(t, env.Pool, "JPY", 100.00, d)

	testutil.CreateExpenseOn(t, env.Pool, sekG.ID, "Dinner", 9000, "SEK",
		aliceSek.ID, alice.ID, []string{aliceSek.ID, bobSek.ID}, d)
	testutil.CreateExpenseOn(t, env.Pool, eurG.ID, "Beer", 2000, "EUR",
		aliceEur.ID, alice.ID, []string{aliceEur.ID, bobEur.ID}, d)
	testutil.CreateExpenseOn(t, env.Pool, jpyG.ID, "Ramen", 100000, "JPY",
		aliceJpy.ID, alice.ID, []string{aliceJpy.ID, bobJpy.ID}, d)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", aliceTok))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "18.98", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
	assert.Equal(t, float64(3), resp["contributing_groups"])
}

func TestMyNet_PerExpenseFxRateHonoredViaCanonicalAmount(t *testing.T) {
	// Create a foreign-currency expense via the HTTP endpoint so the
	// backend converts 10.00 EUR → SEK at the seeded rate and stores the
	// canonical SEK amount + the FX snapshot. Then ask /api/me/net?in=EUR
	// and assert the aggregate round-trips to Alice's share of the
	// original 10 EUR (5.00 EUR), confirming the captured rate flowed
	// through correctly.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	d := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, d)

	body := fmt.Sprintf(`{
		"title": "Beer",
		"amount": "10.00",
		"currency": "EUR",
		"paid_by_id": %q,
		"split_method": "equal",
		"expense_date": "2026-05-15",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	// Alice paid 10 EUR, owes half → net = +5.00 EUR. The canonical
	// amount stored is the SEK conversion at 11.30; the aggregate
	// converts back at the same date's rate.
	assert.Equal(t, "5.00", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
}

func TestMyNet_SettlementWithFxSnapshotUsesCanonicalForAggregate(t *testing.T) {
	// Alice paid 90 SEK in a SEK group (Bob owes her 45). Bob settles 45
	// SEK by paying 4.20 EUR (FX snapshot on the settlement is metadata).
	// In EUR home with rate 11.30:
	//   Expense legs:    +9000/11.30 + (-4500/11.30) = +796 - 398 = +398
	//   Settlement leg: -4500/11.30 (Alice is to_member)           = -398
	//   Total = 0 → "0.00". The snapshot is NOT used; canonical SEK is.
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	d := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.30, d)
	testutil.CreateExpenseOn(t, env.Pool, groupID, "Dinner", 9000, "SEK",
		aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID}, d)

	body := fmt.Sprintf(
		`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK","original_amount":"4.20","original_currency":"EUR","fx_rate":"10.7142857","fx_as_of":"2026-05-15"}`,
		bobMemberID, aliceMemberID,
	)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "0.00", resp["net_minor"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
}

func TestMyNet_EmptyUserReturnsZero(t *testing.T) {
	// A user with no group membership has no legs at all. The endpoint
	// must still 200 with a clean zero aggregate (not error, not 404).
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	loner := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "loner"), "Loner")
	tok := env.MintToken(t, loner.ID, loner.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=EUR", "", tok))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "0.00", resp["net_minor"])
	assert.Equal(t, float64(0), resp["total_legs"])
	assert.Equal(t, float64(0), resp["estimated_legs"])
	assert.Equal(t, float64(0), resp["contributing_groups"])
}

func TestMyNet_ReimbursementExpensesExcluded(t *testing.T) {
	// Reimbursements are balance-neutral by definition (member_balances
	// skips them) — the home aggregate must do the same. Insert a
	// reimbursement directly so we can flip the flag, then assert it
	// does not move the aggregate.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	ctx := context.Background()
	_, err := env.Pool.Exec(ctx, `
		INSERT INTO expenses (id, group_id, title, amount, currency, paid_by_id,
			split_method, category, expense_date, is_reimbursement, created_by_id)
		VALUES ($1, $2, 'Reimburse', 9000, 'SEK', $3, 'equal', 'general', NOW()::date, TRUE, $4)
	`, ulid.New(), groupID, aliceMemberID, alice.ID)
	require.NoError(t, err)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=SEK", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "0.00", resp["net_minor"],
		"reimbursement expense must not contribute to the home aggregate")
	assert.Equal(t, float64(0), resp["total_legs"],
		"reimbursement expense must not even appear as a leg")
	_ = bobMemberID
}

func TestMyNet_DeletedExpensesExcluded(t *testing.T) {
	// A soft-deleted expense (is_deleted=true) must not contribute. Create
	// it normally, flip the flag, and confirm the aggregate ignores it.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	exp := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK",
		aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	_, err := env.Pool.Exec(context.Background(),
		"UPDATE expenses SET is_deleted = TRUE WHERE id = $1", exp.Expense.ID)
	require.NoError(t, err)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/me/net?in=SEK", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "0.00", resp["net_minor"])
	assert.Equal(t, float64(0), resp["total_legs"])
}

// ── Settlement revert ─────────────────────────────────────────────────────────

func revertCreateSettlement(t *testing.T, env *testutil.Env, groupID, fromMember, toMember, token string) string {
	t.Helper()
	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK","method":"swish"}`, fromMember, toMember)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	id, ok := resp["id"].(string)
	require.True(t, ok)
	return id
}

func TestSettle_Revert_ByFromMemberZeroesBalanceChange(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	// Now revert (bob is from_member's user).
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", bob.Token))
	assert.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	// Balances revert to pre-settle (Bob owes Alice 45).
	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)
	var balances []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&balances))
	byMember := indexByMemberID(balances)
	assert.Equal(t, "45.00", byMember[aliceMemberID]["net_balance"])
	assert.Equal(t, "-45.00", byMember[bobMemberID]["net_balance"])
}

func TestSettle_Revert_ByToMemberZeroesBalanceChange(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	// Alice is to_member's user.
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", alice.Token))
	assert.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/balances", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)
	var balances []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&balances))
	byMember := indexByMemberID(balances)
	assert.Equal(t, "45.00", byMember[aliceMemberID]["net_balance"])
	assert.Equal(t, "-45.00", byMember[bobMemberID]["net_balance"])
}

func TestSettle_Revert_ByUnrelatedGroupMemberIsForbidden(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	carolU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "carol"), "Carol")
	testutil.AddMember(t, env.Pool, groupID, carolU.ID, "Carol")
	carolToken := env.MintToken(t, carolU.ID, carolU.Email)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", carolToken))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestSettle_Revert_OlderThan24hReturnsConflict(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	// Backdate created_at past the 24h window.
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE settlements SET created_at = NOW() - INTERVAL '25 hours' WHERE id = $1", settlementID)
	require.NoError(t, err)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", bob.Token))
	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestSettle_Revert_TwiceReturnsConflict(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", bob.Token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", bob.Token))
	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestSettle_Revert_NonExistentReturnsNotFound(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/01HZZNONEXISTENT00000000/revert", "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestSettle_Revert_WritesActivityLog(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settlementID := revertCreateSettlement(t, env, groupID, bobMemberID, aliceMemberID, bob.Token)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settlements/"+settlementID+"/revert", "", bob.Token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID,
		Limit:   50,
		Offset:  0,
	})
	require.NoError(t, err)
	found := false
	for _, a := range activity {
		if a.EventType == "settlement_reverted" && a.EntityID.String == settlementID {
			found = true
			require.NotEmpty(t, a.Payload, "settlement_reverted must carry payload")
			var env1 struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					FromMemberID string `json:"from_member_id"`
					ToMemberID   string `json:"to_member_id"`
					Amount       int64  `json:"amount"`
					Currency     string `json:"currency"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &env1))
			assert.Equal(t, "settlement", env1.EntityType)
			assert.Equal(t, bobMemberID, env1.Snapshot.FromMemberID)
			assert.Equal(t, aliceMemberID, env1.Snapshot.ToMemberID)
			assert.Equal(t, "SEK", env1.Snapshot.Currency)
			assert.Greater(t, env1.Snapshot.Amount, int64(0))
		}
	}
	assert.True(t, found, "expected settlement_reverted activity entry")
}

func TestSettle_Create_WritesActivityWithPayload(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", body, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID, Limit: 50, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "settlement_added" {
			found = true
			require.NotEmpty(t, a.Payload, "settlement_added must carry payload")
			var env1 struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					FromMemberID string `json:"from_member_id"`
					ToMemberID   string `json:"to_member_id"`
					Amount       int64  `json:"amount"`
					Currency     string `json:"currency"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &env1))
			assert.Equal(t, "settlement", env1.EntityType)
			assert.Equal(t, bobMemberID, env1.Snapshot.FromMemberID)
			assert.Equal(t, aliceMemberID, env1.Snapshot.ToMemberID)
			assert.Equal(t, int64(4500), env1.Snapshot.Amount)
			assert.Equal(t, "SEK", env1.Snapshot.Currency)
		}
	}
	assert.True(t, found, "expected settlement_added activity entry")
}
