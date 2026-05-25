//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil)
	return env
}

// ── Create ────────────────────────────────────────────────────────────────────

func TestGroups_Create_HappyPath(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice@example.com", "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "POST", "/api/groups", `{"name":"Sweden Trip","currency":"SEK"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "Sweden Trip", body["name"])
	assert.Equal(t, "SEK", body["currency"])
	assert.NotEmpty(t, body["id"])
	assert.NotEmpty(t, body["invite_token"])

	// DB: creator should be the owner member
	groupID := body["id"].(string)
	members, err := env.Queries.ListGroupMembers(context.Background(), groupID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, alice.ID, members[0].UserID.String)
	assert.Equal(t, "owner", members[0].Role)
}

func TestGroups_Create_DefaultCurrency(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice2@example.com", "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "POST", "/api/groups", `{"name":"Trip"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "SEK", body["currency"]) // default
}

func TestGroups_Create_MissingName(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice3@example.com", "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "POST", "/api/groups", `{"currency":"SEK"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestGroups_Create_Unauthenticated(t *testing.T) {
	env := setupEnv(t)
	req, _ := http.NewRequest("POST", "/api/groups", nil)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestGroups_List_Empty(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice4@example.com", "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "GET", "/api/groups", "", token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body []any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Empty(t, body)
}

func TestGroups_List_OnlyReturnsOwnGroups(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice5@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob@example.com", "Bob")

	testutil.CreateGroup(t, env.Pool, "Alice Group", "SEK", alice.ID, "Alice")
	testutil.CreateGroup(t, env.Pool, "Bob Group", "NOK", bob.ID, "Bob")

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "GET", "/api/groups", "", aliceToken)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	require.Len(t, body, 1)
	assert.Equal(t, "Alice Group", body[0]["name"])
}

func TestGroups_List_IncludesGroupsWhereUserIsMember(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice6@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob2@example.com", "Bob")

	bobGroup, _ := testutil.CreateGroup(t, env.Pool, "Bob Group", "SEK", bob.ID, "Bob")
	testutil.AddMember(t, env.Pool, bobGroup.ID, alice.ID, "Alice")

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "GET", "/api/groups", "", aliceToken)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Len(t, body, 1)
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestGroups_Get_HappyPath(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice7@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob3@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Sweden Trip", "SEK", alice.ID, "Alice")
	testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "GET", "/api/groups/"+group.ID, "", token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, group.ID, body["id"])
	assert.Equal(t, "Sweden Trip", body["name"])

	members := body["members"].([]any)
	assert.Len(t, members, 2)
}

func TestGroups_Get_NotFound(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice8@example.com", "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "GET", "/api/groups/01NONEXISTENT00000000000000", "", token)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestGroups_Get_ForbiddenForNonMember(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice9@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob4@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Alice Only", "SEK", alice.ID, "Alice")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "GET", "/api/groups/"+group.ID, "", bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestGroups_Update_OwnerCanRename(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice10@example.com", "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Old Name", "SEK", alice.ID, "Alice")

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"New Name"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "New Name", body["name"])
	assert.Equal(t, "SEK", body["currency"]) // unchanged

	// Verify in DB
	updated, err := env.Queries.GetGroupByID(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Equal(t, "New Name", updated.Name)
}

func TestGroups_Update_MemberCannotUpdate(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice11@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob5@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Alice's Group", "SEK", alice.ID, "Alice")
	testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"Hijacked"}`, bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestGroups_Update_NonMemberCannotUpdate(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice12@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob6@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Alice's Group", "SEK", alice.ID, "Alice")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"Hijacked"}`, bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Update: currency lock once expenses exist ────────────────────────────────

func TestUpdateGroup_AllowsCurrencyChange_WhenNoExpenses(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_fxlock_empty"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"currency":"EUR"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "EUR", body["currency"])

	updated, err := env.Queries.GetGroupByID(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Equal(t, "EUR", updated.Currency)
}

func TestUpdateGroup_RefusesCurrencyChange_WhenExpensesExist(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_fxlock_with"), "Alice")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	testutil.CreateExpense(t, env.Pool, group.ID, "Dinner", 9000, "SEK", aliceMem.ID, alice.ID, []string{aliceMem.ID})

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"currency":"EUR"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "group_currency_locked", body["code"])

	updated, err := env.Queries.GetGroupByID(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Equal(t, "SEK", updated.Currency)
}

func TestUpdateGroup_RefusesCurrencyChange_IgnoresSoftDeletedExpenses(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_fxlock_softdel"), "Alice")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	fix := testutil.CreateExpense(t, env.Pool, group.ID, "Dinner", 9000, "SEK", aliceMem.ID, alice.ID, []string{aliceMem.ID})

	token := env.MintToken(t, alice.ID, alice.Email)
	delRR := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID+"/expenses/"+fix.Expense.ID, "", token))
	require.Equal(t, http.StatusNoContent, delRR.Code)

	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"currency":"EUR"}`, token)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestUpdateGroup_AllowsOtherEdits_WhenExpensesExist(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_fxlock_other"), "Alice")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	testutil.CreateExpense(t, env.Pool, group.ID, "Dinner", 9000, "SEK", aliceMem.ID, alice.ID, []string{aliceMem.ID})

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"Sweden Trip","language":"sv"}`, token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "Sweden Trip", body["name"])
	assert.Equal(t, "sv", body["language"])
	assert.Equal(t, "SEK", body["currency"])
}

func TestUpdateGroup_AllowsCurrencyToSameValue_WhenExpensesExist(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_fxlock_same"), "Alice")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	testutil.CreateExpense(t, env.Pool, group.ID, "Dinner", 9000, "SEK", aliceMem.ID, alice.ID, []string{aliceMem.ID})

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"currency":"SEK"}`, token)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

// ── Archive ───────────────────────────────────────────────────────────────────

func TestGroups_Archive_OwnerCanArchive(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice13@example.com", "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "To Archive", "SEK", alice.ID, "Alice")

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID, "", token)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify archived in DB
	updated, err := env.Queries.GetGroupByID(context.Background(), group.ID)
	require.NoError(t, err)
	assert.True(t, updated.IsArchived)
}

func TestGroups_Archive_ArchivedGroupHiddenFromList(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice14@example.com", "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "To Archive", "SEK", alice.ID, "Alice")

	token := env.MintToken(t, alice.ID, alice.Email)
	env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID, "", token))

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups", "", token))
	var body []any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Empty(t, body)
}

func TestGroups_Archive_MemberCannotArchive(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice15@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob7@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Alice's Group", "SEK", alice.ID, "Alice")
	testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID, "", bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Invite link ───────────────────────────────────────────────────────────────

func TestGroups_InviteLink_MemberCanGet(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice16@example.com", "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	token := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "GET", "/api/groups/"+group.ID+"/invite-link", "", token)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	inviteURL := body["invite_url"].(string)
	assert.Contains(t, inviteURL, group.InviteToken)
	// Universal link form: <baseURL>/i/<token>. The old /api/groups/join/<token>
	// form was an API endpoint, not a shareable link — see invite-deep-links spec.
	assert.Regexp(t, `^https?://[^/]+/i/[^/]+$`, inviteURL)
	assert.Equal(t, env.Config.BaseURL+"/i/"+group.InviteToken, inviteURL)
}

// The /i/{token} 501 stub from Wave 1 has been replaced by the real
// landing-page handler — see invites_test.go for the full state matrix.

func TestGroups_InviteLink_NonMemberCannotGet(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice17@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob8@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "GET", "/api/groups/"+group.ID+"/invite-link", "", bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Join via invite token ──────────────────────────────────────────────────────

func TestGroups_Join_HappyPath(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice18@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob9@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "POST", fmt.Sprintf("/api/groups/join/%s", group.InviteToken), "", bobToken)
	rr := env.Do(t, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	// Verify Bob is now a member
	members, err := env.Queries.ListGroupMembers(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)

	var bobMember *interface{ GetUserID() string }
	for _, m := range members {
		if m.UserID.String == bob.ID {
			assert.Equal(t, "member", m.Role)
			bobMember = nil
			_ = bobMember
			break
		}
	}
}

func TestGroups_Join_InvalidToken(t *testing.T) {
	env := setupEnv(t)
	bob := testutil.CreateUser(t, env.Pool, "bob10@example.com", "Bob")
	bobToken := env.MintToken(t, bob.ID, bob.Email)

	req := env.AuthRequest(t, "POST", "/api/groups/join/INVALID_TOKEN_XYZ", "", bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestGroups_Join_AlreadyMember(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice19@example.com", "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	req := env.AuthRequest(t, "POST", fmt.Sprintf("/api/groups/join/%s", group.InviteToken), "", aliceToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestJoinViaToken_RejectsArchivedGroup(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice_arch_owner@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob_arch_joiner@example.com", "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Archived Trip", "SEK", alice.ID, "Alice")

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	archRR := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID, "", aliceToken))
	require.Equal(t, http.StatusNoContent, archRR.Code)

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	req := env.AuthRequest(t, "POST", fmt.Sprintf("/api/groups/join/%s", group.InviteToken), "", bobToken)
	rr := env.Do(t, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)

	members, err := env.Queries.ListGroupMembers(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Len(t, members, 1)
	assert.Equal(t, alice.ID, members[0].UserID.String)
}

// ── Regenerate invite token ───────────────────────────────────────────────────

func TestRegenerateInviteToken_OwnerOnly(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice_rot_owner@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob_rot_member@example.com", "Bob")
	carol := testutil.CreateUser(t, env.Pool, "carol_rot_joiner@example.com", "Carol")
	group, _ := testutil.CreateGroup(t, env.Pool, "Rotate Trip", "SEK", alice.ID, "Alice")
	testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	oldToken := group.InviteToken

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	rrBob := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+group.ID+"/invite-link/regenerate", "", bobToken))
	assert.Equal(t, http.StatusForbidden, rrBob.Code)

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	rrAlice := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+group.ID+"/invite-link/regenerate", "", aliceToken))
	assert.Equal(t, http.StatusOK, rrAlice.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rrAlice.Body).Decode(&body))
	newToken, _ := body["invite_token"].(string)
	assert.NotEmpty(t, newToken)
	assert.NotEqual(t, oldToken, newToken)

	carolToken := env.MintToken(t, carol.ID, carol.Email)
	rrOld := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/join/"+oldToken, "", carolToken))
	assert.Equal(t, http.StatusNotFound, rrOld.Code)

	rrNew := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/join/"+newToken, "", carolToken))
	assert.Equal(t, http.StatusOK, rrNew.Code)

	members, err := env.Queries.ListGroupMembers(context.Background(), group.ID)
	require.NoError(t, err)
	assert.Len(t, members, 3)
}

func TestRegenerateInviteToken_NonMemberForbidden(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice_rot_nm_owner@example.com", "Alice")
	stranger := testutil.CreateUser(t, env.Pool, "stranger_rot@example.com", "Stranger")
	group, _ := testutil.CreateGroup(t, env.Pool, "Closed Group", "SEK", alice.ID, "Alice")

	strangerToken := env.MintToken(t, stranger.ID, stranger.Email)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+group.ID+"/invite-link/regenerate", "", strangerToken))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ── Activity writers (group lifecycle) ────────────────────────────────────────

func TestCreateGroup_WritesActivity(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_actcre"), "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "POST", "/api/groups", `{"name":"Bali Trip","currency":"USD"}`, token)
	rr := env.Do(t, req)
	require.Equal(t, http.StatusCreated, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	groupID := body["id"].(string)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: groupID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, activity, 2, "expected group_created + member_joined")

	// Newest-first: member_joined was written after group_created.
	memberJoined, groupCreated := activity[0], activity[1]
	if memberJoined.EventType != "member_joined" {
		memberJoined, groupCreated = groupCreated, memberJoined
	}
	assert.Equal(t, "group_created", groupCreated.EventType)
	assert.Equal(t, "group", groupCreated.EntityType.String)
	assert.Equal(t, groupID, groupCreated.EntityID.String)
	require.NotEmpty(t, groupCreated.Payload)
	var gc struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			Name string `json:"name"`
		} `json:"snapshot"`
	}
	require.NoError(t, json.Unmarshal(groupCreated.Payload, &gc))
	assert.Equal(t, "group", gc.EntityType)
	assert.Equal(t, "Bali Trip", gc.Snapshot.Name)

	assert.Equal(t, "member_joined", memberJoined.EventType)
	assert.Equal(t, "member", memberJoined.EntityType.String)
	require.NotEmpty(t, memberJoined.Payload)
	var mj struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			MemberID    string `json:"member_id"`
			DisplayName string `json:"display_name"`
		} `json:"snapshot"`
	}
	require.NoError(t, json.Unmarshal(memberJoined.Payload, &mj))
	assert.Equal(t, "member", mj.EntityType)
	assert.Equal(t, "Alice", mj.Snapshot.DisplayName)
	assert.NotEmpty(t, mj.Snapshot.MemberID)
}

func TestJoinViaToken_WritesMemberJoined(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_joinact"), "Alice")
	bob := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob_joinact"), "Bob")
	group, _ := testutil.CreateGroup(t, env.Pool, "Open Group", "SEK", alice.ID, "Alice")

	bobToken := env.MintToken(t, bob.ID, bob.Email)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/join/"+group.InviteToken, "", bobToken))
	require.Equal(t, http.StatusOK, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "member_joined" && a.ActorID == bob.ID {
			found = true
			require.NotEmpty(t, a.Payload)
			var p struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					DisplayName string `json:"display_name"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &p))
			assert.Equal(t, "member", p.EntityType)
			assert.Equal(t, "Bob", p.Snapshot.DisplayName)
		}
	}
	assert.True(t, found, "expected member_joined for Bob")
}

func TestUpdateGroup_WritesGroupUpdated_OnNameChange(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_upd"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Old Name", "SEK", alice.ID, "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"New Name"}`, token))
	require.Equal(t, http.StatusOK, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "group_updated" {
			found = true
			require.NotEmpty(t, a.Payload)
			var p struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					Name    string   `json:"name"`
					OldName string   `json:"old_name"`
					Changed []string `json:"changed"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &p))
			assert.Equal(t, "New Name", p.Snapshot.Name)
			assert.Equal(t, "Old Name", p.Snapshot.OldName)
			assert.Contains(t, p.Snapshot.Changed, "name")
		}
	}
	assert.True(t, found, "expected group_updated activity entry")
}

func TestUpdateGroup_NoChange_NoActivity(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_noop"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Same Name", "SEK", alice.ID, "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/groups/"+group.ID, `{"name":"Same Name"}`, token))
	require.Equal(t, http.StatusOK, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	for _, a := range activity {
		assert.NotEqual(t, "group_updated", a.EventType, "must not log a no-op")
	}
}

func TestArchiveGroup_WritesGroupArchived(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_arch"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Closing", "SEK", alice.ID, "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	rr := env.Do(t, env.AuthRequest(t, "DELETE", "/api/groups/"+group.ID, "", token))
	require.Equal(t, http.StatusNoContent, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "group_archived" {
			found = true
			require.NotEmpty(t, a.Payload)
			var p struct {
				EntityType string `json:"entity_type"`
				Snapshot   struct {
					Name string `json:"name"`
				} `json:"snapshot"`
			}
			require.NoError(t, json.Unmarshal(a.Payload, &p))
			assert.Equal(t, "group", p.EntityType)
			assert.Equal(t, "Closing", p.Snapshot.Name)
		}
	}
	assert.True(t, found, "expected group_archived activity entry")
}

func TestRotateInvite_WritesActivity(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_rotact"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Rotating", "SEK", alice.ID, "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+group.ID+"/invite-link/regenerate", "", token))
	require.Equal(t, http.StatusOK, rr.Code)

	activity, err := env.Queries.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	var found bool
	for _, a := range activity {
		if a.EventType == "invite_link_rotated" {
			found = true
			assert.Equal(t, alice.ID, a.ActorID)
		}
	}
	assert.True(t, found, "expected invite_link_rotated activity entry")
}

// ── Inviter attribution (Wave 2B) ─────────────────────────────────────────────

// Creating a group should record the creating user as the invite-token creator,
// so the preview endpoint can resolve a display name for the deep-link landing
// page.
func TestGroups_Create_PopulatesInviteCreator(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_invcre"), "Alice")
	token := env.MintToken(t, alice.ID, alice.Email)

	req := env.AuthRequest(t, "POST", "/api/groups", `{"name":"Inviter Trip","currency":"SEK"}`, token)
	rr := env.Do(t, req)
	require.Equal(t, http.StatusCreated, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	groupID := body["id"].(string)

	group, err := env.Queries.GetGroupByID(context.Background(), groupID)
	require.NoError(t, err)
	require.True(t, group.InviteTokenCreatedByUserID.Valid, "expected invite_token_created_by_user_id to be set")
	assert.Equal(t, alice.ID, group.InviteTokenCreatedByUserID.String)
}

// Rotating the invite token should also update the recorded inviter to the
// user who triggered the rotation.
func TestRegenerateInviteToken_UpdatesCreator(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_invrot"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Rotate Inviter", "SEK", alice.ID, "Alice")

	// Sanity: the fixture should already attribute to Alice.
	require.True(t, group.InviteTokenCreatedByUserID.Valid)
	require.Equal(t, alice.ID, group.InviteTokenCreatedByUserID.String)

	// Null it out so we can assert the rotation re-populates it.
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE groups SET invite_token_created_by_user_id = NULL WHERE id = $1", group.ID)
	require.NoError(t, err)

	aliceToken := env.MintToken(t, alice.ID, alice.Email)
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+group.ID+"/invite-link/regenerate", "", aliceToken))
	require.Equal(t, http.StatusOK, rr.Code)

	after, err := env.Queries.GetGroupByID(context.Background(), group.ID)
	require.NoError(t, err)
	require.True(t, after.InviteTokenCreatedByUserID.Valid, "expected inviter to be set after rotate")
	assert.Equal(t, alice.ID, after.InviteTokenCreatedByUserID.String)
}

// The preview endpoint (Wave 3) will read the inviter via GetGroupByInviteToken;
// guard the column survives that read path.
func TestGetGroupByInviteToken_ReturnsCreator(t *testing.T) {
	env := setupEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_invget"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "Preview Trip", "SEK", alice.ID, "Alice")

	fetched, err := env.Queries.GetGroupByInviteToken(context.Background(), group.InviteToken)
	require.NoError(t, err)
	require.True(t, fetched.InviteTokenCreatedByUserID.Valid)
	assert.Equal(t, alice.ID, fetched.InviteTokenCreatedByUserID.String)
}
