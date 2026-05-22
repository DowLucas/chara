//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
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
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)

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
	assert.Equal(t, "expense", activity[0].EntityType.String)
	// Payload must be a non-empty JSON envelope describing the snapshot so the
	// activity feed can render the row without re-querying the expense.
	require.NotEmpty(t, activity[0].Payload, "expense_added must carry payload")
	var env1 struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			Title         string `json:"title"`
			Amount        int64  `json:"amount"`
			Currency      string `json:"currency"`
			PayerMemberID string `json:"payer_member_id"`
		} `json:"snapshot"`
	}
	require.NoError(t, json.Unmarshal(activity[0].Payload, &env1))
	assert.Equal(t, "expense", env1.EntityType)
	assert.Equal(t, "Dinner", env1.Snapshot.Title)
	assert.Equal(t, int64(9000), env1.Snapshot.Amount)
	assert.Equal(t, "SEK", env1.Snapshot.Currency)
	assert.Equal(t, aliceMemberID, env1.Snapshot.PayerMemberID)
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

// TestExpenses_Create_PaidByID_GenericError guards against information
// disclosure: cross-group and non-existent paid_by_id values must produce an
// identical response so callers can't probe member existence.
func TestExpenses_Create_PaidByID_GenericError(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)

	_, otherMember := testutil.CreateGroup(t, env.Pool, "Other Group", "SEK", alice.ID, "Alice")
	bogusMemberID := "01HZZNONEXISTENT00000000"

	otherBody := fmt.Sprintf(`{"title":"X","amount":"10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q]}`,
		otherMember.ID, aliceMemberID)
	otherRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", otherBody, alice.Token))

	bogusBody := fmt.Sprintf(`{"title":"X","amount":"10.00","currency":"SEK","paid_by_id":%q,"split_method":"equal","participants":[%q]}`,
		bogusMemberID, aliceMemberID)
	bogusRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", bogusBody, alice.Token))

	require.Equal(t, http.StatusBadRequest, otherRR.Code)
	require.Equal(t, http.StatusBadRequest, bogusRR.Code)

	var otherResp, bogusResp map[string]any
	require.NoError(t, json.NewDecoder(otherRR.Body).Decode(&otherResp))
	require.NoError(t, json.NewDecoder(bogusRR.Body).Decode(&bogusResp))
	assert.Equal(t, otherResp["error"], bogusResp["error"],
		"paid_by_id error message must not differ between cross-group and non-existent IDs")
}

func TestCreateExpense_RejectsSplitMemberFromOtherGroup(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// Bob exists in group B (a different group from groupID/group A).
	bobOtherU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_other"), "BobOther")
	_, bobOtherMember := testutil.CreateGroup(t, env.Pool, "Other Group", "SEK", bobOtherU.ID, "BobOther")

	// Alice (in group A) submits an expense whose split references bobOtherMember
	// (a member of group B). This must be rejected with 400.
	body := fmt.Sprintf(`{
		"title": "IDOR Attempt",
		"amount": "100.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "exact",
		"splits": [
			{"member_id": %q, "share": "50.00"},
			{"member_id": %q, "share": "50.00"}
		]
	}`, aliceMemberID, aliceMemberID, bobOtherMember.ID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, "expected 400 when split member belongs to a different group, got %d: %s", rr.Code, rr.Body.String())

	// DB: no expense_splits row was written referencing the cross-group member.
	var count int
	err := env.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM expense_splits WHERE member_id = $1", bobOtherMember.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "no split row should have been written for the cross-group member")

	_ = bobMemberID
}

func TestCreateExpense_RejectsParticipantFromOtherGroup(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)

	bobOtherU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_other2"), "BobOther2")
	_, bobOtherMember := testutil.CreateGroup(t, env.Pool, "Other Group 2", "SEK", bobOtherU.ID, "BobOther2")

	body := fmt.Sprintf(`{
		"title": "IDOR Participant",
		"amount": "100.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q, %q]
	}`, aliceMemberID, aliceMemberID, bobOtherMember.ID)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, "expected 400 when participant belongs to a different group, got %d: %s", rr.Code, rr.Body.String())

	var count int
	err := env.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM expense_splits WHERE member_id = $1", bobOtherMember.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestUpdateExpense_RejectsSplitMemberFromOtherGroup(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	bobOtherU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_other3"), "BobOther3")
	_, bobOtherMember := testutil.CreateGroup(t, env.Pool, "Other Group 3", "SEK", bobOtherU.ID, "BobOther3")

	body := fmt.Sprintf(`{
		"amount": "100.00",
		"split_method": "exact",
		"splits": [
			{"member_id": %q, "share": "50.00"},
			{"member_id": %q, "share": "50.00"}
		]
	}`, aliceMemberID, bobOtherMember.ID)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, "expected 400 when update splits reference a cross-group member, got %d: %s", rr.Code, rr.Body.String())

	var count int
	err := env.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM expense_splits WHERE member_id = $1", bobOtherMember.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count)
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

// TestUpdateExpense_AuthorCanEdit verifies the author of an expense can PATCH it.
func TestUpdateExpense_AuthorCanEdit(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed by Alice"}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Renamed by Alice", resp["title"])
}

// TestUpdateExpense_NonAuthorRejected: a member who is not the creator cannot
// PATCH the expense; the gate returns 403 (not 404) because they CAN see the
// expense — they just can't change it.
func TestUpdateExpense_NonAuthorRejected(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed by Bob"}`, bob.Token))
	assert.Equal(t, http.StatusForbidden, rr.Code, "body: %s", rr.Body.String())

	// DB: title unchanged
	var title string
	err := env.Pool.QueryRow(context.Background(),
		"SELECT title FROM expenses WHERE id = $1", fix.Expense.ID).Scan(&title)
	require.NoError(t, err)
	assert.Equal(t, "Alice's Expense", title)
}

// TestUpdateExpense_NonMemberRejected: a non-member gets 403 (existing
// membership gate fires before the author gate).
func TestUpdateExpense_NonMemberRejected(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Hacked"}`, token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
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

// ── Update: FX recomputation ─────────────────────────────────────────────────

// createFxExpenseFixture builds a SEK group with an EUR expense whose canonical
// amount has already been FX-converted via the POST /expenses handler so the
// FX snapshot columns are populated.
func createFxExpenseFixture(t *testing.T) (env *testutil.Env, alice testUserEnv, groupID, aliceMemberID, expenseID string) {
	t.Helper()
	env, alice, _, groupID, aliceMemberID, _ = setupExpenseEnv(t)

	// Seed ECB rates EUR→SEK and EUR→USD on a fixed date older than today
	// so GetClosestFxRate has something to match.
	asOf, _ := time.Parse("2006-01-02", "2026-05-21")
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.2825, asOf)
	testutil.SeedFxRate(t, env.Pool, "USD", 1.0824, asOf)

	body := fmt.Sprintf(`{
		"title": "Lunch in Berlin",
		"amount": "25.00",
		"currency": "EUR",
		"paid_by_id": %q,
		"split_method": "equal",
		"expense_date": "2026-05-21",
		"participants": [%q]
	}`, aliceMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, "create expense: %s", rr.Body.String())
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	expenseID = resp["id"].(string)
	return
}

func TestUpdateExpense_RecomputesFx_WhenCurrencyChanges(t *testing.T) {
	env, alice, groupID, aliceMemberID, expenseID := createFxExpenseFixture(t)

	body := fmt.Sprintf(`{
		"amount": "30.00",
		"currency": "USD",
		"participants": [%q]
	}`, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+expenseID, body, alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	// Group currency is SEK, original is USD.
	assert.Equal(t, "SEK", resp["currency"])
	assert.Equal(t, "30.00", resp["original_amount"])
	assert.Equal(t, "USD", resp["original_currency"])
	assert.NotEmpty(t, resp["fx_rate"])
	assert.Equal(t, "2026-05-21", resp["fx_as_of"])

	// 30 USD at rate(USD→SEK) = 11.2825/1.0824 ≈ 10.4236.. → 30 × ≈10.4236 ≈ 312.71 SEK
	amt := resp["amount"].(string)
	parsed, err := strconv.ParseFloat(amt, 64)
	require.NoError(t, err)
	assert.InDelta(t, 312.7, parsed, 1.0, "amount in SEK should be roughly USD * USD→SEK rate")

	// Splits should be in canonical (SEK) amounts.
	splits, err := env.Queries.ListSplitsByExpense(context.Background(), expenseID)
	require.NoError(t, err)
	var sum int64
	for _, s := range splits {
		sum += s.Share
	}
	assert.Equal(t, int64(parsed*100+0.5), sum, "splits sum to canonical amount in minor units")
}

func TestUpdateExpense_ClearsFx_WhenCurrencyMatchesGroup(t *testing.T) {
	env, alice, groupID, aliceMemberID, expenseID := createFxExpenseFixture(t)

	body := fmt.Sprintf(`{
		"amount": "300.00",
		"currency": "SEK",
		"participants": [%q]
	}`, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+expenseID, body, alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "SEK", resp["currency"])
	assert.Equal(t, "300.00", resp["amount"])
	_, hasOrigAmount := resp["original_amount"]
	assert.False(t, hasOrigAmount, "original_amount should be cleared")
	_, hasOrigCcy := resp["original_currency"]
	assert.False(t, hasOrigCcy, "original_currency should be cleared")
	_, hasRate := resp["fx_rate"]
	assert.False(t, hasRate, "fx_rate should be cleared")
	_, hasAsOf := resp["fx_as_of"]
	assert.False(t, hasAsOf, "fx_as_of should be cleared")
}

func TestUpdateExpense_KeepsFx_WhenAmountChangesSameCurrency(t *testing.T) {
	env, alice, groupID, aliceMemberID, expenseID := createFxExpenseFixture(t)

	body := fmt.Sprintf(`{
		"amount": "40.00",
		"currency": "EUR",
		"participants": [%q]
	}`, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+expenseID, body, alice.Token))
	assert.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "SEK", resp["currency"])
	assert.Equal(t, "40.00", resp["original_amount"])
	assert.Equal(t, "EUR", resp["original_currency"])
	assert.NotEmpty(t, resp["fx_rate"])
	// Re-snapshot at the same expense_date for reproducibility.
	assert.Equal(t, "2026-05-21", resp["fx_as_of"])

	// 40 EUR × 11.2825 ≈ 451.30 SEK
	amt := resp["amount"].(string)
	parsed, err := strconv.ParseFloat(amt, 64)
	require.NoError(t, err)
	assert.InDelta(t, 451.30, parsed, 0.5)
}

func TestUpdateExpense_FxRateUnavailable_Returns422(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	// No FX rates seeded — the group is SEK, expense currency is EUR which
	// would need EUR→SEK lookup. Use update path: first create a SEK expense
	// (no FX needed), then PATCH to EUR.
	body := fmt.Sprintf(`{
		"title": "Dinner",
		"amount": "200.00",
		"currency": "SEK",
		"paid_by_id": %q,
		"split_method": "equal",
		"participants": [%q]
	}`, aliceMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code)
	var resp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	expenseID := resp["id"].(string)

	patch := fmt.Sprintf(`{
		"amount": "20.00",
		"currency": "EUR",
		"participants": [%q]
	}`, aliceMemberID)
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+expenseID, patch, alice.Token))
	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
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
			require.NotEmpty(t, a.Payload, "expense_deleted must carry payload")
			var env1 struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					Title    string `json:"title"`
					Amount   int64  `json:"amount"`
					Currency string `json:"currency"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &env1))
			assert.Equal(t, "expense", env1.EntityType)
			assert.Equal(t, "Dinner", env1.Snapshot.Title)
			assert.Equal(t, int64(1000), env1.Snapshot.Amount)
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

// TestDeleteExpense_AuthorCanDelete: author of the expense can soft-delete it.
func TestDeleteExpense_AuthorCanDelete(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	assert.Equal(t, http.StatusNoContent, rr.Code)
}

// TestDeleteExpense_NonAuthorRejected: a group member who isn't the creator
// cannot delete the expense (403).
func TestDeleteExpense_NonAuthorRejected(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Alice's Expense", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", bob.Token))
	assert.Equal(t, http.StatusForbidden, rr.Code)

	var isDeleted bool
	err := env.Pool.QueryRow(context.Background(),
		"SELECT is_deleted FROM expenses WHERE id = $1", fix.Expense.ID).Scan(&isDeleted)
	require.NoError(t, err)
	assert.False(t, isDeleted, "non-author DELETE must not soft-delete the row")
}

// TestDeleteExpense_NonMemberRejected: non-member gets 403 (membership gate).
func TestDeleteExpense_NonMemberRejected(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 1000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	charlie := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "charlie"), "Charlie")
	token := env.MintToken(t, charlie.ID, charlie.Email)
	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", token))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestExpenses_Delete_NotFound(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/01NOTEXIST0000000000000000", "", alice.Token))
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

// ── Settlement-aware edit/delete correctness ─────────────────────────────────
//
// These tests are the integrity backbone: when an expense changes after a
// settlement has been recorded, the balance view must recompute the difference
// while leaving the settlement rows themselves untouched. The balance view is
// in `migrations/000014_update_balance_view.up.sql` — these tests guard its
// behaviour through the PATCH/DELETE handler path.

// balanceFor returns the net balance for a single (member, currency) pair.
// Returns 0 when there's no row (the view emits no row for currencies the
// member has never touched).
func balanceFor(t *testing.T, env *testutil.Env, groupID, memberID, currency string) int64 {
	t.Helper()
	balances, err := env.Queries.ListGroupBalances(context.Background(), groupID)
	require.NoError(t, err)
	for _, b := range balances {
		if b.MemberID == memberID && b.Currency.String == currency {
			return b.NetBalance
		}
	}
	return 0
}

func TestEditExpense_BalancesRecomputeAfterSettlement(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// 90.00 SEK, equal split → Alice +45, Bob -45
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Bob settles 45.00 fully → both at 0
	settleBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", settleBody, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code, "settle: %s", rr.Body.String())
	var settleResp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&settleResp))
	settlementID := settleResp["id"].(string)

	require.Equal(t, int64(0), balanceFor(t, env, groupID, aliceMemberID, "SEK"))
	require.Equal(t, int64(0), balanceFor(t, env, groupID, bobMemberID, "SEK"))

	// Alice edits the amount up to 120.00 → bob's new share is 60, but he's
	// already paid 45, so bob ends owing 15 more and alice is +15.
	patch := fmt.Sprintf(`{"amount":"120.00","split_method":"equal","participants":[%q,%q]}`, aliceMemberID, bobMemberID)
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "patch: %s", rr.Body.String())

	assert.Equal(t, int64(1500), balanceFor(t, env, groupID, aliceMemberID, "SEK"), "alice +15.00 SEK")
	assert.Equal(t, int64(-1500), balanceFor(t, env, groupID, bobMemberID, "SEK"), "bob -15.00 SEK")

	// Settlement row itself unchanged.
	var amount int64
	var revertedAt *time.Time
	err := env.Pool.QueryRow(context.Background(),
		"SELECT amount, reverted_at FROM settlements WHERE id = $1", settlementID).Scan(&amount, &revertedAt)
	require.NoError(t, err)
	assert.Equal(t, int64(4500), amount, "settlement amount unchanged")
	assert.Nil(t, revertedAt, "settlement must NOT be reverted by an edit")
}

func TestEditExpense_DeleteExpenseAfterSettlement(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settleBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", settleBody, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)
	var settleResp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&settleResp))
	settlementID := settleResp["id"].(string)

	// Soft-delete the expense. Settlement row must stay on record; the deleted
	// expense must no longer contribute the +45/-45 SEK numbers to the
	// balance view. The current view only emits per-currency rows that have
	// a matching live expense row, so the SEK row may drop out entirely —
	// what matters here is that the pre-delete numbers don't survive.
	rr = env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, "", alice.Token))
	require.Equal(t, http.StatusNoContent, rr.Code)

	aliceBal := balanceFor(t, env, groupID, aliceMemberID, "SEK")
	bobBal := balanceFor(t, env, groupID, bobMemberID, "SEK")
	assert.NotEqual(t, int64(4500), aliceBal, "alice must no longer be +45 SEK from the deleted expense")
	assert.NotEqual(t, int64(-4500), bobBal, "bob must no longer be -45 SEK from the deleted expense")

	// Settlement row still exists and is NOT reverted by the expense delete.
	var count int
	var revertedAt *time.Time
	err := env.Pool.QueryRow(context.Background(),
		"SELECT COUNT(*) OVER (), reverted_at FROM settlements WHERE id = $1", settlementID).Scan(&count, &revertedAt)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "settlement must remain on record after expense delete")
	assert.Nil(t, revertedAt, "settlement must NOT be reverted by an expense delete")
}

func TestEditExpense_PartialSettlement(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// 90.00 SEK split equally → bob owes 45.
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Bob pays half (22.50). After: alice +22.50, bob -22.50.
	settleBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"22.50","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", settleBody, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	require.Equal(t, int64(2250), balanceFor(t, env, groupID, aliceMemberID, "SEK"))
	require.Equal(t, int64(-2250), balanceFor(t, env, groupID, bobMemberID, "SEK"))

	// Alice bumps the expense to 120.00 → bob's new share is 60. Bob paid 22.50.
	// Bob's net = -60 + 22.50 = -37.50; Alice's net = (120 - 60) - 22.50 = 37.50.
	patch := fmt.Sprintf(`{"amount":"120.00","split_method":"equal","participants":[%q,%q]}`, aliceMemberID, bobMemberID)
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "patch: %s", rr.Body.String())

	assert.Equal(t, int64(3750), balanceFor(t, env, groupID, aliceMemberID, "SEK"))
	assert.Equal(t, int64(-3750), balanceFor(t, env, groupID, bobMemberID, "SEK"))
}

func TestEditExpense_RevertedSettlementsExcluded(t *testing.T) {
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	settleBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", settleBody, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)
	var settleResp map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&settleResp))
	settlementID := settleResp["id"].(string)

	// Manually mark the settlement as reverted (the revert endpoint has a 24h
	// time-gate that's fine to skip in tests by going through the DB directly).
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE settlements SET reverted_at = NOW() WHERE id = $1", settlementID)
	require.NoError(t, err)

	// PATCH the expense — the reverted settlement must be ignored by the
	// balance view → 120 equal split = +60/-60.
	patch := fmt.Sprintf(`{"amount":"120.00","split_method":"equal","participants":[%q,%q]}`, aliceMemberID, bobMemberID)
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "patch: %s", rr.Body.String())

	assert.Equal(t, int64(6000), balanceFor(t, env, groupID, aliceMemberID, "SEK"))
	assert.Equal(t, int64(-6000), balanceFor(t, env, groupID, bobMemberID, "SEK"))
	_ = bob
}

func TestEditExpense_CurrencyChangePreservesOldSettlements(t *testing.T) {
	// Group is SEK. Seed FX so we can switch the expense to EUR.
	env, alice, bob, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	asOf, _ := time.Parse("2006-01-02", "2026-05-21")
	testutil.SeedFxRate(t, env.Pool, "SEK", 11.0, asOf)
	testutil.SeedFxRate(t, env.Pool, "EUR", 1.0, asOf)

	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})
	settleBody := fmt.Sprintf(`{"from_member_id":%q,"to_member_id":%q,"amount":"45.00","currency":"SEK"}`, bobMemberID, aliceMemberID)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/settle", settleBody, bob.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	// Edit the expense to EUR. The canonical currency stays SEK (group
	// currency) but original_currency becomes EUR. The SEK settlement row
	// must stay on record in SEK regardless.
	patch := fmt.Sprintf(`{"amount":"10.00","currency":"EUR","participants":[%q,%q]}`, aliceMemberID, bobMemberID)
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "patch: %s", rr.Body.String())

	// Settlement row unchanged: still in SEK.
	var sCurrency string
	var sAmount int64
	err := env.Pool.QueryRow(context.Background(),
		"SELECT currency, amount FROM settlements WHERE group_id = $1", groupID).Scan(&sCurrency, &sAmount)
	require.NoError(t, err)
	assert.Equal(t, "SEK", sCurrency)
	assert.Equal(t, int64(4500), sAmount)
}

// ── Activity payload (changed_fields + collapsing) ───────────────────────────

// latestExpenseUpdatedActivity returns the most-recent expense_edited activity
// row for the given expense, or ok=false when none exists.
func latestExpenseUpdatedActivity(t *testing.T, env *testutil.Env, expenseID string) (id string, payload []byte, createdAt time.Time, ok bool) {
	t.Helper()
	row := env.Pool.QueryRow(context.Background(),
		`SELECT id, payload, created_at FROM activity
		 WHERE entity_id = $1 AND event_type = 'expense_edited'
		 ORDER BY created_at DESC LIMIT 1`, expenseID)
	if err := row.Scan(&id, &payload, &createdAt); err != nil {
		return "", nil, time.Time{}, false
	}
	return id, payload, createdAt, true
}

func TestUpdateExpense_ActivityRowIncludesChangedFields(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Old Title", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	patch := `{"title":"New Title","amount":"120.00"}`
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	_, payloadBytes, _, ok := latestExpenseUpdatedActivity(t, env, fix.Expense.ID)
	require.True(t, ok, "expected an expense_edited activity row")

	var payload map[string]any
	require.NoError(t, json.Unmarshal(payloadBytes, &payload))
	assert.Equal(t, fix.Expense.ID, payload["entity_id"])
	assert.Equal(t, "Alice", payload["actor_display_name"])

	cf, _ := payload["changed_fields"].([]any)
	changed := make(map[string]bool, len(cf))
	for _, f := range cf {
		changed[f.(string)] = true
	}
	assert.True(t, changed["title"], "title should be in changed_fields")
	assert.True(t, changed["amount"], "amount should be in changed_fields")
}

func TestUpdateExpense_NoOpProducesNoActivity(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// Empty PATCH body — must not write an activity row.
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM activity WHERE entity_id = $1 AND event_type = 'expense_edited'`,
		fix.Expense.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "no-op PATCH should write no expense_edited activity")
}

func TestUpdateExpense_NoOpSameValuesProducesNoActivity(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Dinner", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	// PATCH with identical values — must not write an activity row.
	patch := `{"title":"Dinner","amount":"90.00","currency":"SEK","split_method":"equal","category":"general"}`
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, patch, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM activity WHERE entity_id = $1 AND event_type = 'expense_edited'`,
		fix.Expense.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "identical-values PATCH should write no expense_edited activity")
}

func TestUpdateExpense_CollapsesWithinFiveMinutes(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Old Title", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed"}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	id1, _, _, ok := latestExpenseUpdatedActivity(t, env, fix.Expense.ID)
	require.True(t, ok)

	// Second edit immediately after — must merge into the same row.
	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"amount":"120.00"}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	id2, payloadBytes, _, ok := latestExpenseUpdatedActivity(t, env, fix.Expense.ID)
	require.True(t, ok)
	assert.Equal(t, id1, id2, "second edit must reuse the same activity row id")

	var count int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM activity WHERE entity_id = $1 AND event_type = 'expense_edited'`,
		fix.Expense.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "two edits within 5 min must collapse to one row")

	var payload map[string]any
	require.NoError(t, json.Unmarshal(payloadBytes, &payload))
	cf, _ := payload["changed_fields"].([]any)
	changed := make(map[string]bool, len(cf))
	for _, f := range cf {
		changed[f.(string)] = true
	}
	assert.True(t, changed["title"], "merged payload must keep title")
	assert.True(t, changed["amount"], "merged payload must add amount")
}

func TestUpdateExpense_DoesNotCollapseAfterFiveMinutes(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)
	fix := testutil.CreateExpense(t, env.Pool, groupID, "Old Title", 9000, "SEK", aliceMemberID, alice.ID, []string{aliceMemberID, bobMemberID})

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed Once"}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	// Backdate the first activity row by 6 minutes to escape the collapse
	// window. The handler's collapse query uses NOW() - 5 minutes.
	_, err := env.Pool.Exec(context.Background(),
		`UPDATE activity SET created_at = created_at - INTERVAL '6 minutes'
		 WHERE entity_id = $1 AND event_type = 'expense_edited'`, fix.Expense.ID)
	require.NoError(t, err)

	rr = env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+groupID+"/expenses/"+fix.Expense.ID, `{"title":"Renamed Twice"}`, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var count int
	err = env.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM activity WHERE entity_id = $1 AND event_type = 'expense_edited'`,
		fix.Expense.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 2, count, "edits >5 min apart must produce two rows")
}
