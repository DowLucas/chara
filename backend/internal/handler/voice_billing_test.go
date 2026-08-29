//go:build integration

package handler_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/billing"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/voice"
	"github.com/DowLucas/chara/testutil"
)

// fakeVoiceParser stands in for Gemini.
type fakeVoiceParser struct {
	res        *voice.Result
	err        error
	audioCalls int
	textCalls  int
}

func (f *fakeVoiceParser) Parse(_ context.Context, _ []byte, _ string, _ voice.Context, _ []voice.Answer) (*voice.Result, error) {
	f.audioCalls++
	return f.res, f.err
}

func (f *fakeVoiceParser) ParseText(_ context.Context, _ string, _ voice.Context, _ []voice.Answer) (*voice.Result, error) {
	f.textCalls++
	return f.res, f.err
}

func voiceSuccess(callerMemberID string) *voice.Result {
	return &voice.Result{
		Transcript: "I paid 100 for lunch",
		Drafts: []voice.Draft{{
			SourcePhrase: "I paid 100 for lunch", Title: "Lunch",
			AmountMinor: 10000, Currency: "SEK", PaidByID: callerMemberID,
			SplitMethod: "equal", Participants: []string{callerMemberID},
			Shares: []voice.MemberShare{{MemberID: callerMemberID, Share: 10000}},
		}},
	}
}

// hostedVoiceRouter mirrors what server.New builds for hosted instances,
// with the parser injected.
func hostedVoiceRouter(t *testing.T, env *testutil.Env, parser voice.Parser, freeCap int) http.Handler {
	t.Helper()
	h := handler.NewVoiceHandler(parser).
		WithGroupContext(handler.NewVoiceContextLookup(env.Queries)).
		WithCounter(billing.NewCounter(env.Queries), freeCap, 50).
		WithCapOverrides(handler.NewCapOverrides(env.Queries))
	mux := http.NewServeMux()
	mux.Handle("/api/voice/expenses", middleware.Authenticate(env.JWT, env.Queries)(http.HandlerFunc(h.Generate)))
	return mux
}

func postAuthedVoice(t *testing.T, router http.Handler, token, groupID string) *httptest.ResponseRecorder {
	t.Helper()
	body := fmt.Sprintf(`{"audio_base64":%q,"mime_type":"audio/ogg","group_id":%q,"local_date":"2026-08-29","clip_ms":4200}`,
		base64.StdEncoding.EncodeToString([]byte("fake-opus")), groupID)
	return doVoice(t, router, token, body)
}

func doVoice(t *testing.T, router http.Handler, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, "/api/voice/expenses", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func usedFor(t *testing.T, env *testutil.Env, userID, feature string) int {
	t.Helper()
	var used int
	err := env.Pool.QueryRow(context.Background(),
		`SELECT COALESCE(SUM(used), 0) FROM usage_counters WHERE user_id = $1 AND feature = $2`,
		userID, feature).Scan(&used)
	require.NoError(t, err)
	return used
}

func TestVoice_Hosted_FreeUserHitsCapThenBlocked(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	parser := &fakeVoiceParser{res: voiceSuccess(aliceMemberID)}
	router := hostedVoiceRouter(t, env, parser, 5)

	for i := 0; i < 5; i++ {
		rr := postAuthedVoice(t, router, alice.Token, groupID)
		require.Equal(t, http.StatusOK, rr.Code, "call %d: %s", i+1, rr.Body.String())
	}

	rr := postAuthedVoice(t, router, alice.Token, groupID)
	require.Equal(t, http.StatusTooManyRequests, rr.Code, rr.Body.String())

	var body map[string]any
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	assert.Equal(t, "voice_cap_reached", body["code"])
	assert.Equal(t, true, body["waitlist_prompt"])
	assert.Equal(t, 5, parser.audioCalls, "the capped call must not reach the parser")
}

// A failed extraction must not cost a credit — the same contract the
// receipt scanner keeps for ErrUnreadable.
func TestVoice_Hosted_UnintelligibleRefundsTheSlot(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	router := hostedVoiceRouter(t, env, &fakeVoiceParser{err: voice.ErrUnintelligible}, 5)

	rr := postAuthedVoice(t, router, alice.Token, groupID)
	require.Equal(t, http.StatusUnprocessableEntity, rr.Code, rr.Body.String())
	assert.Zero(t, usedFor(t, env, alice.ID, "voice"), "a failed extraction must be refunded")
}

func TestVoice_Hosted_UpstreamFailureRefundsTheSlot(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)
	router := hostedVoiceRouter(t, env, &fakeVoiceParser{err: fmt.Errorf("gemini down")}, 5)

	rr := postAuthedVoice(t, router, alice.Token, groupID)
	require.Equal(t, http.StatusBadGateway, rr.Code)
	assert.Zero(t, usedFor(t, env, alice.ID, "voice"))
}

// The clarify re-post is text-only and must not consume a credit.
func TestVoice_Hosted_ClarifyRepostIsNotMetered(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	parser := &fakeVoiceParser{res: voiceSuccess(aliceMemberID)}
	router := hostedVoiceRouter(t, env, parser, 5)

	body := fmt.Sprintf(`{"group_id":%q,"transcript":"I paid 100 for lunch","local_date":"2026-08-29",
		"answers":[{"question_id":"q1","member_id":%q,"text":"Anna Lind"}]}`, groupID, aliceMemberID)
	rr := doVoice(t, router, alice.Token, body)

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, 1, parser.textCalls)
	assert.Zero(t, parser.audioCalls)
	assert.Zero(t, usedFor(t, env, alice.ID, "voice"), "a text re-post must not be metered")
}

// The voice cap and the OCR cap are independent budgets.
func TestVoice_Hosted_CapIsIndependentOfOCR(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, _ := setupExpenseEnv(t)
	router := hostedVoiceRouter(t, env, &fakeVoiceParser{res: voiceSuccess(aliceMemberID)}, 5)

	for i := 0; i < 3; i++ {
		require.Equal(t, http.StatusOK, postAuthedVoice(t, router, alice.Token, groupID).Code)
	}
	assert.Equal(t, 3, usedFor(t, env, alice.ID, "voice"))
	assert.Zero(t, usedFor(t, env, alice.ID, "ocr"), "voice must not spend the OCR budget")
}

// A non-member must not be able to read another group's roster through
// this endpoint.
func TestVoice_NonMemberIsRejected(t *testing.T) {
	env, _, bob, groupID, _, _ := setupExpenseEnv(t)

	outsider := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "outsider"), "Outsider")
	outsiderToken := env.MintToken(t, outsider.ID, outsider.Email)
	_ = bob

	router := hostedVoiceRouter(t, env, &fakeVoiceParser{res: voiceSuccess("m1")}, 5)
	rr := postAuthedVoice(t, router, outsiderToken, groupID)

	assert.Equal(t, http.StatusForbidden, rr.Code, rr.Body.String())
	assert.Zero(t, usedFor(t, env, outsider.ID, "voice"), "a rejected call must not be metered")
}

// The roster the parser sees must come from the database, not the client.
func TestVoice_ContextLookupResolvesRosterAndCaller(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	lookup := handler.NewVoiceContextLookup(env.Queries)
	vc, err := lookup.VoiceContext(context.Background(), groupID, alice.ID)
	require.NoError(t, err)

	assert.Equal(t, "SEK", vc.Currency)
	assert.Equal(t, aliceMemberID, vc.CallerMemberID)
	require.Len(t, vc.Members, 2)

	ids := []string{vc.Members[0].ID, vc.Members[1].ID}
	assert.Contains(t, ids, aliceMemberID)
	assert.Contains(t, ids, bobMemberID)
	assert.NotEmpty(t, vc.Categories, "a group with no explicit config must still get the default catalog")
}

func TestVoice_ContextLookupRejectsNonMember(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)
	outsider := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "outsider2"), "Outsider Two")

	lookup := handler.NewVoiceContextLookup(env.Queries)
	_, err := lookup.VoiceContext(context.Background(), groupID, outsider.ID)
	assert.Error(t, err, "a non-member must not receive a group's roster")
}
