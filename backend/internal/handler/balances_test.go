//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/testutil"
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

// ── helpers ───────────────────────────────────────────────────────────────────

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
		}
	}
	assert.True(t, found, "expected settlement_reverted activity entry")
}
