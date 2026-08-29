package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/DowLucas/chara/internal/aiusage"
	"github.com/DowLucas/chara/internal/billing"
	"github.com/DowLucas/chara/internal/language"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/voice"
	"github.com/jackc/pgx/v5"
)

// MaxVoiceAudioBytes caps decoded audio. At the client's ~24 kbps Opus a
// 45s clip is ~135 KB, so this is generous — and it is the AUTHORITATIVE
// bound, because the server cannot cheaply measure duration without
// decoding the container. The clip_ms field below is client-reported
// telemetry, not a security control.
const MaxVoiceAudioBytes = 2 * 1024 * 1024

// VoiceFeatureKey is the usage_counters.feature identifier for voice.
const VoiceFeatureKey = "voice"

// VoiceRepostFeatureKey meters the clarify re-post separately.
//
// The re-post is not charged against the user's voice budget on purpose —
// charging for it would punish them for the model's ambiguity and teach
// them to skip the loop that makes the feature trustworthy. But "free"
// cannot mean "unbounded": without a ceiling, any authenticated group
// member can loop text prompts through our Gemini key indefinitely. A
// generous separate cap keeps the intent and closes the hole.
const VoiceRepostFeatureKey = "voice_repost"

// MaxTranscriptChars bounds the text a re-post may carry. A 45s utterance
// transcribes to a few hundred characters, so this is far above any real
// use while stopping a single request from becoming a multi-million-token
// prompt.
const MaxTranscriptChars = 2000

// maxTimezoneChars bounds the client's IANA zone before it is interpolated
// into the prompt. Longest real zone name is ~32 characters.
const maxTimezoneChars = 64

// allowedVoiceMIME is what expo-audio produces across platforms.
var allowedVoiceMIME = map[string]struct{}{
	"audio/ogg":  {},
	"audio/opus": {},
	"audio/webm": {},
	"audio/mp4":  {},
	"audio/m4a":  {},
	"audio/aac":  {},
	"audio/mpeg": {},
}

// GroupContextLookup builds the per-request context the parser needs:
// roster, currency, language, category catalog, and which member is
// speaking.
//
// It MUST fail for a non-member. Unlike the receipt scanner's advisory
// category lookup — which fails open so group_id cannot be used to probe
// another group — the roster is load-bearing: guessing it would put the
// wrong people on a split, and returning it to a non-member would leak
// the membership list.
type GroupContextLookup interface {
	VoiceContext(ctx context.Context, groupID, userID string) (voice.Context, error)
}

// VoiceHandler implements POST /api/voice/expenses.
//
// It writes nothing. It returns drafts; creating an expense still goes
// through the expense endpoint, which validates independently.
type VoiceHandler struct {
	parser        voice.Parser
	groups        GroupContextLookup
	counter       *billing.Counter
	freeCap       int
	freeRepostCap int
	overrides     CapOverrides
	usage         *aiusage.Recorder
}

func NewVoiceHandler(p voice.Parser) *VoiceHandler {
	return &VoiceHandler{parser: p}
}

// WithGroupContext wires the roster lookup. Required in production.
func (h *VoiceHandler) WithGroupContext(g GroupContextLookup) *VoiceHandler {
	h.groups = g
	return h
}

// WithCounter wires the anti-abuse counter. cap is the free monthly limit.
// A nil counter disables metering entirely (selfhost).
func (h *VoiceHandler) WithCounter(counter *billing.Counter, cap, repostCap int) *VoiceHandler {
	h.counter = counter
	h.freeCap = cap
	h.freeRepostCap = repostCap
	return h
}

// WithCapOverrides wires the per-user cap lookup. Only consulted when a
// counter is set.
func (h *VoiceHandler) WithCapOverrides(o CapOverrides) *VoiceHandler {
	h.overrides = o
	return h
}

// WithUsageRecorder wires per-call cost/quality recording.
func (h *VoiceHandler) WithUsageRecorder(r *aiusage.Recorder) *VoiceHandler {
	h.usage = r
	return h
}

type voiceRequest struct {
	AudioBase64 string `json:"audio_base64"`
	MIMEType    string `json:"mime_type"`
	GroupID     string `json:"group_id"`
	// LocalDate (YYYY-MM-DD) and Timezone come from the CLIENT: the server
	// cannot know the user's day, and "yesterday" must resolve against it.
	LocalDate string `json:"local_date"`
	Timezone  string `json:"timezone"`
	ClipMS    int    `json:"clip_ms"`
	// UILanguage is the recorder's app language, used only for the model's
	// `reasoning` text. Validated through language.Normalize like every
	// other client string that reaches the prompt.
	UILanguage string `json:"ui_language"`

	// Transcript and Answers drive the clarify re-post. A non-empty
	// Transcript makes this a text follow-up: no audio, and NOT metered.
	Transcript string         `json:"transcript"`
	Answers    []voice.Answer `json:"answers"`
}

type voiceDraftShare struct {
	MemberID   string `json:"member_id"`
	ShareMinor int64  `json:"share_minor"`
}

// voiceDraftPct carries a validated percentage split in basis points
// (10000 == 100%). Present only for split_method "percentage" — the client
// uses its presence to restore a proportional split rather than pinning
// the amounts it happened to produce.
type voiceDraftPct struct {
	MemberID    string `json:"member_id"`
	BasisPoints int    `json:"basis_points"`
}

type voiceDraft struct {
	SourcePhrase string `json:"source_phrase"`
	// Reasoning is shown on the review screen so a misread of who is on
	// the split is visible before saving. Not stored with the expense.
	Reasoning    string            `json:"reasoning,omitempty"`
	Title        string            `json:"title"`
	AmountMinor  int64             `json:"amount_minor"`
	Currency     string            `json:"currency"`
	Category     string            `json:"category,omitempty"`
	Date         string            `json:"date,omitempty"`
	PaidByID     string            `json:"paid_by_id"`
	SplitMethod  string            `json:"split_method"`
	Participants []string          `json:"participants"`
	Shares       []voiceDraftShare `json:"shares,omitempty"`
	Percentages  []voiceDraftPct   `json:"percentages,omitempty"`
	// LowConfidence names fields the resolver guessed at, so the UI can
	// flag them for the user rather than presenting them as certain.
	LowConfidence []string `json:"low_confidence,omitempty"`
}

type voiceResponse struct {
	Transcript string           `json:"transcript"`
	Expenses   []voiceDraft     `json:"expenses"`
	Questions  []voice.Question `json:"questions,omitempty"`
	// GenerationID links saved expenses back to this call for acceptance
	// tracking. Empty when telemetry is disabled.
	GenerationID string `json:"generation_id,omitempty"`

	// Hosted-only, omitted on selfhost — same contract as scanResponse.
	Tier           string `json:"tier,omitempty"`
	Remaining      *int   `json:"remaining,omitempty"`
	PeriodResetsAt string `json:"period_resets_at,omitempty"`
}

// voiceErrorResponse carries a machine-readable code so the app can show
// different copy per failure — in particular, the settlement case links to
// the settle screen instead of reporting a failure.
type voiceErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeVoiceError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(voiceErrorResponse{Code: code, Message: msg})
}

// Generate handles POST /api/voice/expenses.
func (h *VoiceHandler) Generate(w http.ResponseWriter, r *http.Request) {
	// Cap the raw body BEFORE decoding: without this a huge JSON body is
	// fully buffered into audio_base64, which is a trivial OOM vector. The
	// factor of 2 covers base64 overhead plus the JSON envelope.
	r.Body = http.MaxBytesReader(w, r.Body, int64(MaxVoiceAudioBytes)*2)

	var req voiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeVoiceError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	if req.GroupID == "" {
		writeVoiceError(w, http.StatusBadRequest, "bad_request", "group_id is required")
		return
	}
	isRepost := strings.TrimSpace(req.Transcript) != ""
	if !isRepost && req.AudioBase64 == "" {
		writeVoiceError(w, http.StatusBadRequest, "bad_request", "audio_base64 or transcript is required")
		return
	}
	if len(req.Transcript) > MaxTranscriptChars {
		writeVoiceError(w, http.StatusRequestEntityTooLarge, "too_large", "transcript is too long")
		return
	}

	claims := middleware.ClaimsFromContext(r.Context())

	// The roster is required and access-controlled: a non-member gets 403,
	// never a guessed context.
	if h.groups == nil {
		writeVoiceError(w, http.StatusInternalServerError, "server_error", "voice is not configured")
		return
	}
	vc, err := h.groups.VoiceContext(r.Context(), req.GroupID, claimsUserID(claims))
	if err != nil {
		// The client always gets a bare 403, so group_id cannot be used to
		// tell "not a member" apart from "no such group". The real cause is
		// logged server-side — without this a database fault is
		// indistinguishable from an access denial, which is miserable to
		// debug and easy to mistake for a permissions bug.
		slog.Warn("voice: group context lookup failed",
			"error", err, "group_id", req.GroupID, "user_id", claimsUserID(claims))
		writeVoiceError(w, http.StatusForbidden, "forbidden", "not a member of this group")
		return
	}
	// Both of these are interpolated into the model prompt and local_date
	// can also become an expense's date, so neither is taken on trust. A
	// malformed value from a buggy client falls back rather than failing
	// the request; a crafted one simply never reaches the prompt.
	vc.LocalDate = sanitizeLocalDate(req.LocalDate)
	vc.Timezone = sanitizeTimezone(req.Timezone)
	if code, ok := language.Normalize(req.UILanguage); ok {
		vc.UILanguage = code
	}

	var audio []byte
	if !isRepost {
		if req.MIMEType == "" {
			req.MIMEType = "audio/ogg"
		}
		if _, ok := allowedVoiceMIME[strings.ToLower(req.MIMEType)]; !ok {
			writeVoiceError(w, http.StatusBadRequest, "bad_request", "unsupported mime_type")
			return
		}
		audio, err = base64.StdEncoding.DecodeString(req.AudioBase64)
		if err != nil {
			writeVoiceError(w, http.StatusBadRequest, "bad_request", "audio_base64 is not valid base64")
			return
		}
		if len(audio) == 0 {
			writeVoiceError(w, http.StatusBadRequest, "bad_request", "audio_base64 decoded to zero bytes")
			return
		}
		if len(audio) > MaxVoiceAudioBytes {
			writeVoiceError(w, http.StatusRequestEntityTooLarge, "too_large", "audio exceeds 2 MB limit")
			return
		}
	}

	// Metering. The clarify re-post is deliberately NOT metered: charging
	// for it would punish the user for the model's ambiguity and teach
	// them to skip the loop that makes the feature trustworthy.
	// Re-posts are metered under their own generous key rather than the
	// user's voice budget: bounded, but not a cost the user feels.
	featureKey := VoiceFeatureKey
	freeCap := h.freeCap
	if isRepost {
		featureKey = VoiceRepostFeatureKey
		freeCap = h.freeRepostCap
	}

	var reservation *billing.Reservation
	var meterResult billing.Result
	var metered bool
	if h.counter != nil {
		if claims == nil || claims.UserID == "" {
			writeVoiceError(w, http.StatusUnauthorized, "unauthorized", "missing user context")
			return
		}

		cap := freeCap
		unlimited := false
		if h.overrides != nil {
			ov, oErr := h.overrides.GetFeatureCap(r.Context(), claims.UserID, featureKey)
			if oErr != nil && !errors.Is(oErr, pgx.ErrNoRows) {
				writeVoiceError(w, http.StatusInternalServerError, "server_error", "usage counter unavailable")
				return
			}
			if ov.Valid {
				if ov.Int32 < 0 {
					unlimited = true
				} else {
					cap = int(ov.Int32)
				}
			}
		}

		if !unlimited {
			res, mErr := h.counter.Reserve(r.Context(), claims.UserID, featureKey, cap)
			if mErr != nil {
				writeVoiceError(w, http.StatusInternalServerError, "server_error", "usage counter unavailable")
				return
			}
			if !res.Allowed {
				writeVoiceCapReached(w, res)
				return
			}
			reservation = res.Reservation
			meterResult = res
			metered = true
		}
	}

	start := time.Now()
	var result *voice.Result
	if isRepost {
		result, err = h.parser.ParseText(r.Context(), req.Transcript, vc, req.Answers)
	} else {
		result, err = h.parser.Parse(r.Context(), audio, req.MIMEType, vc, req.Answers)
	}

	if err != nil {
		// Free the slot so a failure does not cost a credit — the same
		// contract the receipt scanner keeps for ErrUnreadable.
		if reservation != nil {
			// A fresh context so the refund still fires if the caller has
			// already cancelled the request.
			_ = h.counter.Refund(context.Background(), *reservation)
		}

		status, code, msg := http.StatusBadGateway, "server_error", "voice extraction failed"
		outcome, errClass := aiusage.OutcomeError, "parser_failed"
		switch {
		case errors.Is(err, voice.ErrUnintelligible):
			status, code, msg = http.StatusUnprocessableEntity, "unintelligible", "could not make out any speech"
			outcome, errClass = aiusage.OutcomeUnintelligible, ""
		case errors.Is(err, voice.ErrNoExpense):
			status, code, msg = http.StatusUnprocessableEntity, "no_expense", "no expense in that"
			outcome, errClass = aiusage.OutcomeNoExpense, ""
		case errors.Is(err, voice.ErrSettlement):
			status, code, msg = http.StatusUnprocessableEntity, "settlement", "that sounds like a repayment"
			outcome, errClass = aiusage.OutcomeNoExpense, "settlement"
		}

		h.usage.Record(r.Context(), aiusage.Record{
			UserID: claimsUserID(claims), Feature: VoiceFeatureKey, GroupID: req.GroupID,
			Model: voice.DefaultGeminiModel, RequestBytes: len(audio), ClipMS: req.ClipMS,
			LatencyMS: int(time.Since(start).Milliseconds()),
			Outcome:   outcome, ErrorClass: errClass,
		})

		if status == http.StatusBadGateway {
			// Log the detail server-side only: a transport error can embed
			// the request URL, and anything it carries, in its message.
			slog.Error("voice: extraction failed", "error", err)
		}
		writeVoiceError(w, status, code, msg)
		return
	}

	body := voiceResponse{
		Transcript: result.Transcript,
		Expenses:   toVoiceDrafts(result.Drafts),
		Questions:  result.Questions,
	}
	body.GenerationID = h.usage.Record(r.Context(), aiusage.Record{
		UserID: claimsUserID(claims), Feature: VoiceFeatureKey, GroupID: req.GroupID,
		Model: voice.DefaultGeminiModel, RequestBytes: len(audio), ClipMS: req.ClipMS,
		InputTokens: result.Usage.InputTokens, OutputTokens: result.Usage.OutputTokens,
		LatencyMS:             int(time.Since(start).Milliseconds()),
		Outcome:               aiusage.OutcomeOK,
		ExpenseCount:          len(result.Drafts),
		QuestionCount:         len(result.Questions),
		DegradedSplitCount:    result.DegradedSplits,
		UnresolvedMemberCount: result.UnresolvedMembers,
	})
	if metered {
		remaining := meterResult.Remaining
		body.Tier = "free"
		body.Remaining = &remaining
		body.PeriodResetsAt = meterResult.PeriodResetsAt.UTC().Format("2006-01-02T15:04:05Z")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

// sanitizeLocalDate keeps a well-formed YYYY-MM-DD and otherwise falls
// back to the server's UTC day — better a day that may be off by one than
// an empty anchor, which would make every relative date unresolvable.
func sanitizeLocalDate(raw string) string {
	if _, err := time.Parse("2006-01-02", raw); err == nil {
		return raw
	}
	return time.Now().UTC().Format("2006-01-02")
}

// sanitizeTimezone accepts only the shape of an IANA zone name. Anything
// else becomes empty: the prompt reads better without a zone than with
// attacker-chosen text in it.
func sanitizeTimezone(raw string) string {
	if raw == "" || len(raw) > maxTimezoneChars {
		return ""
	}
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '/', r == '_', r == '-', r == '+':
		default:
			return ""
		}
	}
	return raw
}

func toVoiceDrafts(in []voice.Draft) []voiceDraft {
	out := make([]voiceDraft, len(in))
	for i, d := range in {
		shares := make([]voiceDraftShare, len(d.Shares))
		for j, s := range d.Shares {
			shares[j] = voiceDraftShare{MemberID: s.MemberID, ShareMinor: int64(s.Share)}
		}
		var pcts []voiceDraftPct
		if len(d.Percentages) > 0 {
			pcts = make([]voiceDraftPct, len(d.Percentages))
			for j, p := range d.Percentages {
				pcts[j] = voiceDraftPct{MemberID: p.MemberID, BasisPoints: p.BasisPoints}
			}
		}
		out[i] = voiceDraft{
			SourcePhrase:  d.SourcePhrase,
			Reasoning:     d.Reasoning,
			Title:         d.Title,
			AmountMinor:   int64(d.AmountMinor),
			Currency:      d.Currency,
			Category:      d.Category,
			Date:          d.Date,
			PaidByID:      d.PaidByID,
			SplitMethod:   d.SplitMethod,
			Participants:  d.Participants,
			Shares:        shares,
			Percentages:   pcts,
			LowConfidence: d.LowConfidence,
		}
	}
	return out
}

func writeVoiceCapReached(w http.ResponseWriter, res billing.Result) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(capReachedResponse{
		Code:           "voice_cap_reached",
		Message:        "You've reached the free voice limit for this month.",
		Remaining:      res.Remaining,
		PeriodResetsAt: res.PeriodResetsAt.UTC().Format("2006-01-02T15:04:05Z"),
		WaitlistPrompt: true,
	})
}
