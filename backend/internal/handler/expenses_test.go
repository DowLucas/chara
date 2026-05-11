//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/server"
	"github.com/DowLucas/quits/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// groupEnv is a common setup: group with Alice (owner) + Bob (member).
type groupEnv struct {
	env         *testutil.Env
	aliceUser   interface{ GetID() string }
	bobUser     interface{ GetID() string }
	group       interface{ GetID() string }
	aliceMember interface{ GetID() string }
	bobMember   interface{ GetID() string }
	aliceToken  string
	bobToken    string
}

func setupExpenseEnv(t *testing.T) (env *testutil.Env, alice, bob testUserEnv, groupID, aliceMemberID, bobMemberID string) {
	t.Helper()
	env = testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT)

	aliceU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	bobU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Sweden Trip", "SEK", aliceU.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, group.ID, bobU.ID, "Bob")

	alice = testUserEnv{ID: aliceU.ID, Email: aliceU.Email, Token: env.MintToken(t, aliceU.ID, aliceU.Email)}
	bob = testUserEnv{ID: bobU.ID, Email: bobU.Email, Token: env.MintToken(t, bobU.ID, bobU.Email)}
	return env, alice, bob, group.ID, aliceMem.ID, bobMem.ID
}

type testUserEnv struct {
	ID    string
	Email string
	Token string
}

var emailCounter int

func uniqueEmail(t *testing.T, prefix string) string {
	t.Helper()
	emailCounter++
	return fmt.Sprintf("%s%d@example.com", prefix, emailCounter)
}

// ── Create ────────────────────────────────────────────────────────────────────

func TestExpenses_Create_EqualSplit(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	body := fmt.Sprintf(`{
		"title": "Dinner",
		"amount": "90.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusCreated, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Dinner", resp["title"])
	assert.Equal(t, "90.00", resp["amount"])
	splits := resp["splits"].([]any)
	assert.Len(t, splits, 2)

	// DB: splits must sum to 9000 minor units
	expenseID := resp["id"].(string)
	dbSplits, err := env.Queries.ListSplitsByExpense(context.Background(), expenseID)
	require.NoError(t, err)
	require.Len(t, dbSplits, 2)
	var sum int64
	for _, s := range dbSplits {
		sum += s.Share
	}
	assert.Equal(t, int64(9000), sum)

	// DB: activity log written
	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID,
		Limit:   10,
		Offset:  0,
	})
	require.NoError(t, err)
	require.Len(t, activity, 1)
	assert.Equal(t, "expense_added", activity[0].EventType)
	assert.Equal(t, expenseID, activity[0].EntityID.String)
	_ = bob
}

func TestExpenses_Create_EqualSplit_RemainderDistributed(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// 100.03 across 3 members: splits must sum to exactly 10003
	charlieU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	charlieMem := testutil.AddMember(t, env.Pool, groupID, charlieU.ID, "Charlie")

	body := fmt.Sprintf(`{
		"title": "Brunch",
		"amount": "100.03",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q, %q]
	}`, aliceMemberID, aliceMemberID, bobMemberID, charlieMem.ID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	expenseID := resp["id"].(string)

	dbSplits, err := env.Queries.ListSplitsByExpense(context.Background(), expenseID)
	require.NoError(t, err)
	var sum int64
	for _, s := range dbSplits {
		sum += s.Share
	}
	assert.Equal(t, int64(10003), sum, "splits must sum to exactly the total")
}

func TestExpenses_Create_ExactSplit(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	body := fmt.Sprintf(`{
		"title": "Hotel",
		"amount": "100.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "exact",
		"splits": [
			{"member_id": %q, "share": "60.00"},
			{"member_id": %q, "share": "40.00"}
		]
	}`, aliceMemberID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusCreated, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	expenseID := resp["id"].(string)

	dbSplits, err := env.Queries.ListSplitsByExpense(context.Background(), expenseID)
	require.NoError(t, err)
	shareByMember := map[string]int64{}
	for _, s := range dbSplits {
		shareByMember[s.MemberID] = s.Share
	}
	assert.Equal(t, int64(6000), shareByMember[aliceMemberID])
	assert.Equal(t, int64(4000), shareByMember[bobMemberID])
}

func TestExpenses_Create_PercentageSplit(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	body := fmt.Sprintf(`{
		"title": "Taxi",
		"amount": "100.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "percentage",
		"splits": [
			{"member_id": %q, "basis_points": 7500},
			{"member_id": %q, "basis_points": 2500}
		]
	}`, aliceMemberID, aliceMemberID, bobMemberID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusCreated, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	expenseID := resp["id"].(string)

	dbSplits, err := env.Queries.ListSplitsByExpense(context.Background(), expenseID)
	require.NoError(t, err)
	var sum int64
	for _, s := range dbSplits {
		sum += s.Share
	}
	assert.Equal(t, int64(10000), sum)
}

func TestExpenses_Create_MissingTitle(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"amount":"10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q,%q]}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_ZeroAmount(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"title":"X","amount":"0.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q,%q]}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_NegativeAmount(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"title":"X","amount":"-10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q,%q]}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_AmountNotDecimalString(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{"title":"X","amount":100,"currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q,%q]}`,
		aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_PaidByID_NotInGroup(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)

	// Create a member in a DIFFERENT group
	otherGroup, otherMember := testutil.CreateGroup(t, env.Pool, "Other Group", "SEK", alice.ID, "Alice")
	_ = otherGroup

	body := fmt.Sprintf(`{"title":"X","amount":"10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q]}`,
		otherMember.ID, otherMember.ID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_Exact_SplitsDontSumToTotal(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{
		"title":"X","amount":"100.00","currency":"SEK","paid_by_id":%q,
		"split_method":"exact",
		"splits":[{"member_id":%q,"share":"50.00"},{"member_id":%q,"share":"40.00"}]
	}`, aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_Percentage_BpNotSumTo10000(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	body := fmt.Sprintf(`{
		"title":"X","amount":"100.00","currency":"SEK","paid_by_id":%q,
		"split_method":"percentage",
		"splits":[{"member_id":%q,"basis_points":5000},{"member_id":%q,"basis_points":4000}]
	}`, aliceMemberID, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestExpenses_Create_NonMember_Forbidden(t *testing.T) {
	env, _, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	charlieU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	charlieToken := env.MintToken(t, charlieU.ID, charlieU.Email)

	body := fmt.Sprintf(`{"title":"X","amount":"10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q]}`,
		aliceMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, charlieToken))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestExpenses_Create_Unauthenticated(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)
	req, _ := http.NewRequest("POST", "/api/groups/"+groupID+"/expenses", nil)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestExpenses_List_Empty(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses", "", alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code)
	var body []any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Empty(t, body)
}

func TestExpenses_List_ReturnsExpenses(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	testutil.CreateExpense(t, env.Pool, groupID, "Taxi", 5000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses", "", alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code)
	var body []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Len(t, body, 2)
	// Amounts must be decimal strings (order is non-deterministic when dates are equal)
	var amounts []string
	for _, item := range body {
		amounts = append(amounts, item["amount"].(string))
	}
	assert.Contains(t, amounts, "90.00")
	assert.Contains(t, amounts, "50.00")
}

func TestExpenses_List_ExcludesSoftDeleted(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	live := testutil.CreateExpense(t, env.Pool, groupID, "Live", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	deleted := testutil.CreateExpense(t, env.Pool, groupID, "Deleted", 2000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	require.NoError(t, env.Queries.SoftDeleteExpense(context.Background(), deleted.Expense.ID))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses", "", alice.Token))
	var body []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	require.Len(t, body, 1)
	assert.Equal(t, live.Expense.ID, body[0]["id"])
}

func TestExpenses_List_Pagination(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	for i := 0; i < 12; i++ {
		testutil.CreateExpense(t, env.Pool, groupID, fmt.Sprintf("Expense %d", i), 1000, "SEK",
			aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	}

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses?limit=10&offset=0", "", alice.Token))
	var page1 []any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&page1))
	assert.Len(t, page1, 10)

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses?limit=10&offset=10", "", alice.Token))
	var page2 []any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&page2))
	assert.Len(t, page2, 2)
}

func TestExpenses_List_NonMember_Forbidden(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)
	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses", "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestExpenses_Get_HappyPath(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, fix.Expense.ID, body["id"])
	assert.Equal(t, "90.00", body["amount"])

	splits := body["splits"].([]any)
	assert.Len(t, splits, 2)
	// Each split share must be a decimal string
	split0 := splits[0].(map[string]any)
	assert.NotEmpty(t, split0["share"])
	assert.Contains(t, split0["share"].(string), ".")
}

func TestExpenses_Get_NotFound(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses/01NOTEXIST0000000000000000", "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestExpenses_Get_SoftDeleted_Returns404(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Gone", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	require.NoError(t, env.Queries.SoftDeleteExpense(context.Background(), fix.Expense.ID))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestExpenses_Get_WrongGroup_Returns404(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	// Create expense in a different group
	otherGroup, otherMember := testutil.CreateGroup(t, env.Pool, "Other", "SEK", alice.ID, "Alice")
	fix := testutil.CreateExpense(t, env.Pool, otherGroup.ID, "Other Expense", 1000, "SEK",
		otherMember.ID, alice.ID, []string{otherMember.ID})

	// Accessing via original group's URL
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
	_ = aliceMemberID
}

func TestExpenses_Get_NonMember_Forbidden(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestExpenses_Update_Title(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Old Title", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	body := `{"title":"New Title"}`
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, body, alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "New Title", resp["title"])
	assert.Equal(t, "90.00", resp["amount"]) // unchanged
}

func TestExpenses_Update_RecalculatesSplits(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Update amount and supply new equal splits
	body := fmt.Sprintf(`{
		"amount": "120.00",
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, bobMemberID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, body, alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code)

	// DB: old splits replaced, new splits sum to 12000
	dbSplits, err := env.Queries.ListSplitsByExpense(context.Background(), fix.Expense.ID)
	require.NoError(t, err)
	var sum int64
	for _, s := range dbSplits {
		sum += s.Share
	}
	assert.Equal(t, int64(12000), sum)
}

func TestExpenses_Update_MemberCanUpdate(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Bob (non-creator member) can update
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed by Bob"}`, bob.Token))
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestExpenses_Update_NonMember_Forbidden(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Hacked"}`, token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestExpenses_Update_NewPaidByID_NotInGroup(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	otherGroup, otherMember := testutil.CreateGroup(t, env.Pool, "Other", "SEK", alice.ID, "Alice")
	_ = otherGroup
	body := fmt.Sprintf(`{"paid_by_id": %q}`, otherMember.ID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// ── Delete ────────────────────────────────────────────────────────────────────

func TestExpenses_Delete_IsSoftNotHard(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	assert.Equal(t, http.StatusNoContent, rr.Code)

	// DB: row still exists but is_deleted = true
	var isDeleted bool
	err := env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", fix.Expense.ID).Scan(&isDeleted)
	require.NoError(t, err)
	assert.True(t, isDeleted)
}

func TestExpenses_Delete_ActivityLogWritten(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "expense_deleted" && a.EntityID.String == fix.Expense.ID {
			found = true
		}
	}
	assert.True(t, found, "expected expense_deleted activity log entry")
}

func TestExpenses_Delete_NonMember_Forbidden(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)

	// DB: still not deleted
	var isDeleted bool
	err := env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", fix.Expense.ID).Scan(&isDeleted)
	require.NoError(t, err)
	assert.False(t, isDeleted)
}

func TestExpenses_Delete_AnyMemberCanDelete(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Bob (non-creator) can delete
	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", bob.Token))
	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestExpenses_Delete_NotFound(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/01NOTEXIST0000000000000000", "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}
