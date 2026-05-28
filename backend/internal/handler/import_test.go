//go:build integration

package handler_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/importer"
	"github.com/DowLucas/chara/internal/server"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeExtractor returns canned Normalized output and records its input so
// tests can assert membership/lock/cap gates run before extraction.
type fakeExtractor struct {
	out    importer.Normalized
	err    error
	calls  int
	images int
	source string
}

func (f *fakeExtractor) Extract(ctx context.Context, images []importer.Image, source string) (importer.Normalized, error) {
	f.calls++
	f.images = len(images)
	f.source = source
	return f.out, f.err
}

func setupImportEnv(t *testing.T, ex importer.Extractor) (env *testutil.Env, alice, bob testUserEnv, groupID, aliceMemberID, bobMemberID string) {
	t.Helper()
	env = testutil.NewEnv(t)
	importH := handler.NewImportHandler(env.Pool, env.Queries, ex)
	env.Router = server.NewWithImport(env.Config, env.Pool, env.Queries, env.JWT, nil, importH)

	aliceU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice"), "Alice")
	bobU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "bob"), "Bob")
	group, aliceMem := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", aliceU.ID, "Alice")
	bobMem := testutil.AddMember(t, env.Pool, group.ID, bobU.ID, "Bob")

	alice = testUserEnv{ID: aliceU.ID, Email: aliceU.Email, Token: env.MintToken(t, aliceU.ID, aliceU.Email)}
	bob = testUserEnv{ID: bobU.ID, Email: bobU.Email, Token: env.MintToken(t, bobU.ID, bobU.Email)}
	return env, alice, bob, group.ID, aliceMem.ID, bobMem.ID
}

func smallPNGBase64() string {
	return base64.StdEncoding.EncodeToString([]byte("fakepngbytes"))
}

// ── extract ──────────────────────────────────────────────────────────────────

func TestImport_Extract_ReturnsNormalized(t *testing.T) {
	ex := &fakeExtractor{out: importer.Normalized{
		Currency: "SEK",
		Standings: []importer.Standing{
			{Name: "Anna", Direction: importer.DirectionOwesYou, Amount: "340.00", Confidence: 0.9},
		},
	}}
	env, alice, _, groupID, _, _ := setupImportEnv(t, ex)

	body := fmt.Sprintf(`{"source":"splitwise","images":[{"image_base64":%q,"mime_type":"image/png"}]}`, smallPNGBase64())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/extract", body, alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp importer.Normalized
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "SEK", resp.Currency)
	require.Len(t, resp.Standings, 1)
	assert.Equal(t, "Anna", resp.Standings[0].Name)
	assert.Equal(t, importer.DirectionOwesYou, resp.Standings[0].Direction)
	assert.Equal(t, 1, ex.calls)
	assert.Equal(t, "splitwise", ex.source)
}

func TestImport_Extract_AllImagesFailReturns502(t *testing.T) {
	ex := &fakeExtractor{err: errors.New("all images failed extraction")}
	env, alice, _, groupID, _, _ := setupImportEnv(t, ex)

	body := fmt.Sprintf(`{"source":"other","images":[{"image_base64":%q}]}`, smallPNGBase64())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/extract", body, alice.Token))
	assert.Equal(t, http.StatusBadGateway, rr.Code, rr.Body.String())
}

func TestImport_Extract_RejectsNonMember(t *testing.T) {
	ex := &fakeExtractor{}
	env, _, _, groupID, _, _ := setupImportEnv(t, ex)
	strangerU := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stranger"), "Stranger")
	tok := env.MintToken(t, strangerU.ID, strangerU.Email)

	body := fmt.Sprintf(`{"source":"other","images":[{"image_base64":%q}]}`, smallPNGBase64())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/extract", body, tok))
	assert.Equal(t, http.StatusForbidden, rr.Code)
	assert.Equal(t, 0, ex.calls)
}

func TestImport_Extract_RejectsLockedGroup(t *testing.T) {
	ex := &fakeExtractor{}
	env, alice, _, groupID, _, _ := setupImportEnv(t, ex)

	lockRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/lock", `{}`, alice.Token))
	require.Equal(t, http.StatusOK, lockRR.Code, lockRR.Body.String())

	body := fmt.Sprintf(`{"source":"other","images":[{"image_base64":%q}]}`, smallPNGBase64())
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/extract", body, alice.Token))
	assert.Equal(t, http.StatusConflict, rr.Code)
	assert.Equal(t, 0, ex.calls)
}

func TestImport_Extract_RejectsTooManyImages(t *testing.T) {
	ex := &fakeExtractor{}
	env, alice, _, groupID, _, _ := setupImportEnv(t, ex)

	imgs := make([]string, 11)
	for i := range imgs {
		imgs[i] = fmt.Sprintf(`{"image_base64":%q}`, smallPNGBase64())
	}
	body := fmt.Sprintf(`{"source":"other","images":[%s]}`, strings.Join(imgs, ","))
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/extract", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Equal(t, 0, ex.calls)
}

// ── commit ───────────────────────────────────────────────────────────────────

// loadSplits returns the (memberID → share) map for an expense.
func loadSplits(t *testing.T, env *testutil.Env, expID string) map[string]int64 {
	t.Helper()
	splits, err := env.Queries.ListSplitsByExpense(context.Background(), expID)
	require.NoError(t, err)
	m := make(map[string]int64, len(splits))
	for _, s := range splits {
		m[s.MemberID] = s.Share
	}
	return m
}

func TestImport_Commit_OwesYou_CreatesPlaceholderAndExpense(t *testing.T) {
	// "Carol owes you 340" → placeholder Carol, paid_by = Alice, participant =
	// Carol (Carol owes Alice the full 340).
	env, alice, _, groupID, aliceMemberID, _ := setupImportEnv(t, &fakeExtractor{})

	body := `{
		"source":"splitwise",
		"standings": [
			{"name":"Carol","direction":"owes_you","amount":"340.00","title":"Splitwise balance"}
		]
	}`

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	// Placeholder member created (name-only, user_id NULL).
	members, err := env.Queries.ListGroupMembers(context.Background(), groupID)
	require.NoError(t, err)
	var carolID string
	for _, m := range members {
		if m.Name == "Carol" {
			carolID = m.ID
			assert.False(t, m.UserID.Valid, "placeholder member should have NULL user_id")
			assert.True(t, m.IsGhost)
		}
	}
	require.NotEmpty(t, carolID, "Carol placeholder should exist")

	expenses, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{GroupID: groupID, Limit: 50, Offset: 0})
	require.NoError(t, err)
	require.Len(t, expenses, 1)
	expID := expenses[0].ID
	assert.Equal(t, aliceMemberID, expenses[0].PaidByID, "owes_you → importer is payer")

	// import_source recorded.
	var importSrc *string
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		"SELECT import_source FROM expenses WHERE id = $1", expID).Scan(&importSrc))
	require.NotNil(t, importSrc)
	assert.Equal(t, "splitwise", *importSrc)

	// Single-participant equal split: Carol owes the full 34000.
	splits := loadSplits(t, env, expID)
	require.Len(t, splits, 1)
	assert.Equal(t, int64(34000), splits[carolID])
}

func TestImport_Commit_YouOwe_ImporterIsParticipant(t *testing.T) {
	// "you owe Sven 90" → placeholder Sven, paid_by = Sven, participant = Alice
	// (Alice owes Sven 90).
	env, alice, _, groupID, aliceMemberID, _ := setupImportEnv(t, &fakeExtractor{})

	body := `{"source":"steven","standings":[{"name":"Sven","direction":"you_owe","amount":"90.00"}]}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	members, err := env.Queries.ListGroupMembers(context.Background(), groupID)
	require.NoError(t, err)
	var svenID string
	for _, m := range members {
		if m.Name == "Sven" {
			svenID = m.ID
		}
	}
	require.NotEmpty(t, svenID)

	expenses, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{GroupID: groupID, Limit: 50, Offset: 0})
	require.NoError(t, err)
	require.Len(t, expenses, 1)
	assert.Equal(t, svenID, expenses[0].PaidByID, "you_owe → counterparty is payer")

	splits := loadSplits(t, env, expenses[0].ID)
	require.Len(t, splits, 1)
	assert.Equal(t, int64(9000), splits[aliceMemberID], "importer owes the full amount")
}

func TestImport_Commit_ResolvesExistingMemberByName(t *testing.T) {
	// Bob already exists; standing "bob owes_you" must reuse his member, not
	// mint a placeholder.
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupImportEnv(t, &fakeExtractor{})

	body := `{"standings":[{"name":"bob","direction":"owes_you","amount":"50.00"}]}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code, rr.Body.String())

	members, err := env.Queries.ListGroupMembers(context.Background(), groupID)
	require.NoError(t, err)
	assert.Len(t, members, 2, "no placeholder minted for an existing member")

	expenses, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{GroupID: groupID, Limit: 50, Offset: 0})
	require.NoError(t, err)
	require.Len(t, expenses, 1)
	assert.Equal(t, aliceMemberID, expenses[0].PaidByID)

	splits := loadSplits(t, env, expenses[0].ID)
	assert.Equal(t, int64(5000), splits[bobMemberID])
}

func TestImport_Commit_RejectsBadDirection(t *testing.T) {
	env, alice, _, groupID, _, _ := setupImportEnv(t, &fakeExtractor{})

	body := `{"standings":[{"name":"Carol","direction":"sideways","amount":"10.00"}]}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())

	expenses, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{GroupID: groupID, Limit: 50, Offset: 0})
	require.NoError(t, err)
	assert.Empty(t, expenses)
}

func TestImport_Commit_RejectsNonPositiveAmount(t *testing.T) {
	env, alice, _, groupID, _, _ := setupImportEnv(t, &fakeExtractor{})

	body := `{"standings":[{"name":"Carol","direction":"owes_you","amount":"0.00"}]}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())
}

func TestImport_Commit_RollsBackOnBadRow(t *testing.T) {
	// First row good (mints placeholder Dave), second row bad direction → the
	// whole tx rolls back, so Dave must not persist and no expense remains.
	env, alice, _, groupID, _, _ := setupImportEnv(t, &fakeExtractor{})

	body := `{
		"standings": [
			{"name":"Dave","direction":"owes_you","amount":"100.00"},
			{"name":"Eve","direction":"bogus","amount":"100.00"}
		]
	}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	// Bad direction is caught in up-front validation → 400, nothing committed.
	assert.Equal(t, http.StatusBadRequest, rr.Code, rr.Body.String())

	expenses, err := env.Queries.ListExpensesByGroup(context.Background(), db.ListExpensesByGroupParams{GroupID: groupID, Limit: 50, Offset: 0})
	require.NoError(t, err)
	assert.Empty(t, expenses, "rollback must leave no expenses")

	members, err := env.Queries.ListGroupMembers(context.Background(), groupID)
	require.NoError(t, err)
	for _, m := range members {
		assert.NotEqual(t, "Dave", m.Name, "rollback must not leave placeholder member")
	}
}

func TestImport_Commit_RejectsLockedGroup(t *testing.T) {
	env, alice, _, groupID, _, _ := setupImportEnv(t, &fakeExtractor{})

	lockRR := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/lock", `{}`, alice.Token))
	require.Equal(t, http.StatusOK, lockRR.Code)

	body := `{"standings":[{"name":"Carol","direction":"owes_you","amount":"100.00"}]}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/import/commit", body, alice.Token))
	assert.Equal(t, http.StatusConflict, rr.Code)
}
