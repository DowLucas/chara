//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/DowLucas/quits/internal/server"
	"github.com/DowLucas/quits/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupEnv(t *testing.T) *testutil.Env {
	t.Helper()
	env := testutil.NewEnv(t)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT)
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
	assert.Contains(t, body["invite_url"].(string), group.InviteToken)
}

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

// ── Members endpoint (with swish_number) ─────────────────────────────────────

func TestGroupMembers_ReturnsSwishNumbers(t *testing.T) {
	env := setupEnv(t)

	alice := testutil.CreateUser(t, env.Pool, "alice-members@example.com", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob-members@example.com", "Bob")
	aliceTok := env.MintToken(t, alice.ID, alice.Email)
	bobTok := env.MintToken(t, bob.ID, bob.Email)

	group, _ := testutil.CreateGroup(t, env.Pool, "Group", "SEK", alice.ID, "Alice")
	testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	// Alice sets her swish number; Bob does not.
	rr := env.Do(t, env.AuthRequest(t, "PATCH", "/api/me", `{"swish_number":"+46701234567"}`, aliceTok))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+group.ID+"/members", "", bobTok))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.Len(t, resp, 2)

	byName := map[string]map[string]any{}
	for _, m := range resp {
		byName[m["name"].(string)] = m
	}
	assert.Equal(t, "+46701234567", byName["Alice"]["swish_number"])
	assert.Nil(t, byName["Bob"]["swish_number"])
}

func TestGroupMembers_NonMemberIsForbidden(t *testing.T) {
	env := setupEnv(t)

	alice := testutil.CreateUser(t, env.Pool, "alice-mem-forbidden@example.com", "Alice")
	outsider := testutil.CreateUser(t, env.Pool, "outsider-mem@example.com", "Out")
	outsiderTok := env.MintToken(t, outsider.ID, outsider.Email)

	group, _ := testutil.CreateGroup(t, env.Pool, "Group", "SEK", alice.ID, "Alice")

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+group.ID+"/members", "", outsiderTok))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}
