package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/aiusage"
	"github.com/DowLucas/chara/internal/voice"
)

// ── stubs ─────────────────────────────────────────────────────────────────────

type stubParser struct {
	res *voice.Result
	err error

	gotAudio      []byte
	gotMIME       string
	gotTranscript string
	gotAnswers    []voice.Answer
	gotContext    voice.Context
	textCalls     int
	audioCalls    int
}

func (s *stubParser) Parse(_ context.Context, audio []byte, mimeType string, vc voice.Context, answers []voice.Answer) (*voice.Result, error) {
	s.audioCalls++
	s.gotAudio = append([]byte(nil), audio...)
	s.gotMIME = mimeType
	s.gotContext = vc
	s.gotAnswers = answers
	return s.res, s.err
}

func (s *stubParser) ParseText(_ context.Context, transcript string, vc voice.Context, answers []voice.Answer) (*voice.Result, error) {
	s.textCalls++
	s.gotTranscript = transcript
	s.gotContext = vc
	s.gotAnswers = answers
	return s.res, s.err
}

func okResult() *voice.Result {
	return &voice.Result{
		Transcript: "I paid 480 for dinner with Anna",
		Drafts: []voice.Draft{{
			SourcePhrase: "I paid 480 for dinner", Title: "Dinner",
			AmountMinor: 48000, Currency: "SEK", Category: "food",
			Date: "2026-08-29", PaidByID: "m1", SplitMethod: "equal",
			Participants: []string{"m1", "m2"},
			Shares: []voice.MemberShare{
				{MemberID: "m1", Share: 24000},
				{MemberID: "m2", Share: 24000},
			},
			LowConfidence: []string{"paid_by"},
		}},
		Usage:             voice.Usage{InputTokens: 1500, OutputTokens: 300},
		DegradedSplits:    1,
		UnresolvedMembers: 2,
	}
}

type okLookup struct {
	got struct{ groupID, userID string }
}

func (l *okLookup) VoiceContext(_ context.Context, groupID, userID string) (voice.Context, error) {
	l.got.groupID, l.got.userID = groupID, userID
	return voice.Context{
		GroupID: groupID, Currency: "SEK", Language: "en",
		Categories:     []string{"food"},
		Members:        []voice.Member{{ID: "m1", Name: "Lucas"}, {ID: "m2", Name: "Anna"}},
		CallerMemberID: "m1",
	}, nil
}

type notAMemberLookup struct{}

func (notAMemberLookup) VoiceContext(_ context.Context, _, _ string) (voice.Context, error) {
	return voice.Context{}, errors.New("not a member")
}

func voiceRouter(t *testing.T, p voice.Parser, l GroupContextLookup, build ...func(*VoiceHandler) *VoiceHandler) http.Handler {
	t.Helper()
	h := NewVoiceHandler(p).WithGroupContext(l)
	for _, b := range build {
		h = b(h)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/voice/expenses", h.Generate)
	return mux
}

func postVoice(t *testing.T, router http.Handler, body any, ctx context.Context) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, json.NewEncoder(&buf).Encode(body))
	req := httptest.NewRequest(http.MethodPost, "/api/voice/expenses", &buf).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func audioBody(extra map[string]any) map[string]any {
	b := map[string]any{
		"audio_base64": base64.StdEncoding.EncodeToString([]byte("fake-opus-bytes")),
		"mime_type":    "audio/ogg",
		"group_id":     "g1",
		"local_date":   "2026-08-29",
		"timezone":     "Europe/Stockholm",
		"clip_ms":      4200,
	}
	for k, v := range extra {
		b[k] = v
	}
	return b
}

// ── tests ─────────────────────────────────────────────────────────────────────

func TestVoice_ReturnsDraftsAndGenerationID(t *testing.T) {
	usage := &fakeUsageStore{}
	lookup := &okLookup{}
	router := voiceRouter(t, &stubParser{res: okResult()}, lookup,
		func(h *VoiceHandler) *VoiceHandler {
			return h.WithUsageRecorder(aiusage.NewRecorder(usage))
		})

	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var got voiceResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	require.Len(t, got.Expenses, 1)
	assert.Equal(t, "Dinner", got.Expenses[0].Title)
	assert.EqualValues(t, 48000, got.Expenses[0].AmountMinor)
	assert.Equal(t, "I paid 480 for dinner", got.Expenses[0].SourcePhrase)
	assert.Equal(t, []string{"paid_by"}, got.Expenses[0].LowConfidence)
	require.Len(t, got.Expenses[0].Shares, 2)
	assert.EqualValues(t, 24000, got.Expenses[0].Shares[0].ShareMinor)
	assert.NotEmpty(t, got.GenerationID)

	// The lookup must be scoped to the caller, not trusted from the body.
	assert.Equal(t, "g1", lookup.got.groupID)
	assert.Equal(t, "u1", lookup.got.userID)

	require.Len(t, usage.got, 1)
	rec := usage.got[0]
	assert.Equal(t, VoiceFeatureKey, rec.Feature)
	assert.Equal(t, aiusage.OutcomeOK, rec.Outcome)
	assert.Equal(t, 1500, rec.InputTokens)
	assert.Equal(t, 4200, rec.ClipMS)
	assert.Equal(t, 1, rec.ExpenseCount)
	assert.Equal(t, 1, rec.DegradedSplitCount)
	assert.Equal(t, 2, rec.UnresolvedMemberCount)
}

// A percentage split must reach the client AS a percentage. Sending only
// the resolved amounts makes the wizard show 250.00 instead of "25%", which
// is what the user actually asked for.
func TestVoice_SerialisesPercentages(t *testing.T) {
	res := okResult()
	res.Drafts[0].SplitMethod = "percentage"
	res.Drafts[0].Percentages = []voice.MemberPct{
		{MemberID: "m1", BasisPoints: 7500},
		{MemberID: "m2", BasisPoints: 2500},
	}
	router := voiceRouter(t, &stubParser{res: res}, &okLookup{})

	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var got voiceResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	require.Len(t, got.Expenses, 1)
	require.Len(t, got.Expenses[0].Percentages, 2)

	byID := map[string]int{}
	for _, p := range got.Expenses[0].Percentages {
		byID[p.MemberID] = p.BasisPoints
	}
	assert.Equal(t, 2500, byID["m2"])
	assert.Equal(t, 7500, byID["m1"])
}

// An equal split must not carry an empty percentages array into the JSON —
// the client uses its presence to decide the split method.
func TestVoice_OmitsPercentagesForEqualSplits(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, &okLookup{})
	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
	assert.NotContains(t, rr.Body.String(), "percentages")
}

func TestVoice_RejectsNonMember(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, notAMemberLookup{})
	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// A database fault and an access denial look identical to the client, on
// purpose. They must NOT look identical in the logs — that cost a real
// debugging session when a stale dev schema surfaced as "not a member".
func TestVoice_LookupFailureStillReturnsBareForbidden(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, notAMemberLookup{})
	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))

	require.Equal(t, http.StatusForbidden, rr.Code)
	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	assert.Equal(t, "forbidden", body.Code)
	// The client must not learn whether the group exists.
	assert.NotContains(t, body.Message, "not a member of this group\n")
	assert.NotContains(t, rr.Body.String(), "not a member: ")
}

func TestVoice_RejectsOversizeAudio(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, &okLookup{})
	big := base64.StdEncoding.EncodeToString(make([]byte, MaxVoiceAudioBytes+1))
	rr := postVoice(t, router, audioBody(map[string]any{"audio_base64": big}), authedContext("u1"))
	assert.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
}

func TestVoice_RejectsUnsupportedMIME(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, &okLookup{})
	rr := postVoice(t, router, audioBody(map[string]any{"mime_type": "image/png"}), authedContext("u1"))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestVoice_RejectsMissingAudioAndTranscript(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, &okLookup{})
	rr := postVoice(t, router, map[string]any{"group_id": "g1"}, authedContext("u1"))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestVoice_RejectsMissingGroupID(t *testing.T) {
	router := voiceRouter(t, &stubParser{res: okResult()}, &okLookup{})
	rr := postVoice(t, router, audioBody(map[string]any{"group_id": ""}), authedContext("u1"))
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestVoice_ErrorsCarryDistinctCodes(t *testing.T) {
	cases := map[error]string{
		voice.ErrUnintelligible: "unintelligible",
		voice.ErrNoExpense:      "no_expense",
		voice.ErrSettlement:     "settlement",
	}
	for err, wantCode := range cases {
		t.Run(wantCode, func(t *testing.T) {
			router := voiceRouter(t, &stubParser{err: err}, &okLookup{})
			rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
			require.Equal(t, http.StatusUnprocessableEntity, rr.Code)

			var body struct {
				Code string `json:"code"`
			}
			require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
			assert.Equal(t, wantCode, body.Code)
		})
	}
}

func TestVoice_UpstreamFailureIs502AndDoesNotLeakDetail(t *testing.T) {
	router := voiceRouter(t, &stubParser{err: errors.New("dial tcp 1.2.3.4: secret-key-in-url")}, &okLookup{})
	rr := postVoice(t, router, audioBody(nil), authedContext("u1"))
	assert.Equal(t, http.StatusBadGateway, rr.Code)
	assert.NotContains(t, rr.Body.String(), "secret-key-in-url")
}

func TestVoice_RecordsFailureOutcomes(t *testing.T) {
	usage := &fakeUsageStore{}
	router := voiceRouter(t, &stubParser{err: voice.ErrUnintelligible}, &okLookup{},
		func(h *VoiceHandler) *VoiceHandler {
			return h.WithUsageRecorder(aiusage.NewRecorder(usage))
		})

	postVoice(t, router, audioBody(nil), authedContext("u1"))
	require.Len(t, usage.got, 1)
	assert.Equal(t, aiusage.OutcomeUnintelligible, usage.got[0].Outcome)
}

func TestVoice_ClarifyRepostUsesParseTextAndCarriesAnswers(t *testing.T) {
	parser := &stubParser{res: okResult()}
	router := voiceRouter(t, parser, &okLookup{})

	rr := postVoice(t, router, map[string]any{
		"group_id":   "g1",
		"transcript": "I paid 480 for dinner",
		"local_date": "2026-08-29",
		"answers": []map[string]string{
			{"question_id": "q1", "member_id": "m2", "text": "Anna Lind"},
		},
	}, authedContext("u1"))

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, 1, parser.textCalls, "a transcript re-post must use ParseText")
	assert.Zero(t, parser.audioCalls)
	assert.Equal(t, "I paid 480 for dinner", parser.gotTranscript)
	require.Len(t, parser.gotAnswers, 1)
	assert.Equal(t, "Anna Lind", parser.gotAnswers[0].Text)
}

func TestVoice_ForwardsClientDateAndTimezone(t *testing.T) {
	parser := &stubParser{res: okResult()}
	router := voiceRouter(t, parser, &okLookup{})

	postVoice(t, router, audioBody(nil), authedContext("u1"))
	assert.Equal(t, "2026-08-29", parser.gotContext.LocalDate)
	assert.Equal(t, "Europe/Stockholm", parser.gotContext.Timezone)
}

// Without a client-supplied date the server must still put SOMETHING
// usable in front of the model, or every relative date resolves to "".
func TestVoice_DefaultsLocalDateWhenClientOmitsIt(t *testing.T) {
	parser := &stubParser{res: okResult()}
	router := voiceRouter(t, parser, &okLookup{})

	body := audioBody(nil)
	delete(body, "local_date")
	postVoice(t, router, body, authedContext("u1"))
	assert.Regexp(t, `^\d{4}-\d{2}-\d{2}$`, parser.gotContext.LocalDate)
}

func TestVoice_DecodesAudioBeforeCallingParser(t *testing.T) {
	parser := &stubParser{res: okResult()}
	router := voiceRouter(t, parser, &okLookup{})

	postVoice(t, router, audioBody(nil), authedContext("u1"))
	assert.Equal(t, []byte("fake-opus-bytes"), parser.gotAudio)
	assert.Equal(t, "audio/ogg", parser.gotMIME)
}
