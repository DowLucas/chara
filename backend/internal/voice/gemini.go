package voice

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultGeminiModel matches the receipt scanner's choice. Flash is the
// right latency/cost tradeoff here too, and it understands audio directly.
const DefaultGeminiModel = "gemini-3.5-flash"

const defaultGeminiBase = "https://generativelanguage.googleapis.com/v1beta"

// defaultTimeout is the per-call budget. Audio takes longer than an image,
// and the handler's own deadline is ~25s under the server's 30s write
// timeout, so this must not exceed it.
const defaultTimeout = 25 * time.Second

// GeminiParser calls Google's Generative Language API.
type GeminiParser struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// GeminiOption configures a GeminiParser.
type GeminiOption func(*GeminiParser)

// WithGeminiModel overrides the model name, for tests and for opting into
// new releases without a code change.
func WithGeminiModel(model string) GeminiOption {
	return func(p *GeminiParser) { p.model = model }
}

// WithGeminiBaseURL overrides the API base URL. Used by tests to point at
// an httptest.Server.
func WithGeminiBaseURL(url string) GeminiOption {
	return func(p *GeminiParser) { p.baseURL = url }
}

// WithGeminiHTTPClient injects a configured *http.Client.
func WithGeminiHTTPClient(c *http.Client) GeminiOption {
	return func(p *GeminiParser) { p.client = c }
}

// NewGemini constructs a parser. apiKey must be non-empty; callers should
// check config.HasGemini before instantiating.
func NewGemini(apiKey string, opts ...GeminiOption) *GeminiParser {
	p := &GeminiParser{
		apiKey:  apiKey,
		model:   DefaultGeminiModel,
		baseURL: defaultGeminiBase,
		client:  &http.Client{Timeout: defaultTimeout},
	}
	for _, o := range opts {
		o(p)
	}
	return p
}

// Request/response shapes for the generateContent endpoint. Only the
// fields we use are modeled.
type geminiInlineData struct {
	MIMEType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inline_data,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiGenerationConfig struct {
	ResponseMIMEType string  `json:"response_mime_type,omitempty"`
	Temperature      float64 `json:"temperature"`
	ResponseSchema   any     `json:"response_schema,omitempty"`
}

type geminiRequest struct {
	Contents         []geminiContent         `json:"contents"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata,omitempty"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

// rawResponse is the model's own JSON, before resolution.
type rawResponse struct {
	Transcript string     `json:"transcript"`
	Expenses   []rawDraft `json:"expenses"`
	Questions  []Question `json:"questions"`
	Error      string     `json:"error"`
}

// Parse extracts drafts from audio.
func (p *GeminiParser) Parse(ctx context.Context, audio []byte, mimeType string, vc Context, answers []Answer) (*Result, error) {
	if len(audio) == 0 {
		return nil, errors.New("voice: empty audio data")
	}
	if mimeType == "" {
		mimeType = "audio/ogg"
	}
	return p.generate(ctx, vc, answers, []geminiPart{{
		InlineData: &geminiInlineData{
			MIMEType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(audio),
		},
	}})
}

// ParseText re-runs extraction from an already-transcribed sentence plus
// the user's answers to clarifying questions.
//
// This is the clarify re-post. It is a separate method rather than Parse
// with nil audio because the two differ in more than their input: this one
// is cheap, carries no audio, and is deliberately not metered.
func (p *GeminiParser) ParseText(ctx context.Context, transcript string, vc Context, answers []Answer) (*Result, error) {
	if strings.TrimSpace(transcript) == "" {
		return nil, errors.New("voice: empty transcript")
	}
	return p.generate(ctx, vc, answers, []geminiPart{{
		Text: "The speaker said, transcribed:\n\n" + transcript,
	}})
}

// generate is the shared call path. input is whatever carries the
// utterance — an audio part, or a transcript text part.
func (p *GeminiParser) generate(ctx context.Context, vc Context, answers []Answer, input []geminiPart) (*Result, error) {
	parts := append([]geminiPart{{Text: buildPrompt(vc, answers)}}, input...)

	body, err := json.Marshal(geminiRequest{
		Contents: []geminiContent{{Parts: parts}},
		GenerationConfig: &geminiGenerationConfig{
			ResponseMIMEType: "application/json",
			Temperature:      0,
			ResponseSchema:   responseSchema(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("voice: marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", p.baseURL, p.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("voice: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// The key travels in a header, never the URL: a transport-level
	// *url.Error embeds the full request URL in err.Error(), which must
	// stay safe to log.
	req.Header.Set("x-goog-api-key", p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("voice: gemini request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("voice: read gemini response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("voice: gemini returned %d: %s", resp.StatusCode, truncate(string(rawBody), 300))
	}

	var parsed geminiResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return nil, fmt.Errorf("voice: decode gemini response: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("voice: gemini error %s: %s", parsed.Error.Status, parsed.Error.Message)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, ErrUnintelligible
	}

	jsonText := stripCodeFence(strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text))
	var raw rawResponse
	if err := json.Unmarshal([]byte(jsonText), &raw); err != nil {
		return nil, fmt.Errorf("voice: decode extraction %q: %w", truncate(jsonText, 200), err)
	}

	switch raw.Error {
	case "unintelligible":
		return nil, ErrUnintelligible
	case "no_expense":
		return nil, ErrNoExpense
	case "settlement":
		return nil, ErrSettlement
	}

	drafts, degraded, unresolved := resolveDrafts(raw.Expenses, vc)
	if len(drafts) == 0 {
		// Either the model returned nothing, or everything it returned was
		// unusable. Both mean the same thing to the user.
		return nil, ErrNoExpense
	}

	out := &Result{
		Transcript:        raw.Transcript,
		Drafts:            drafts,
		Questions:         raw.Questions,
		DegradedSplits:    degraded,
		UnresolvedMembers: unresolved,
	}
	if parsed.UsageMetadata != nil {
		out.Usage = Usage{
			InputTokens:  parsed.UsageMetadata.PromptTokenCount,
			OutputTokens: parsed.UsageMetadata.CandidatesTokenCount,
		}
	}
	return out, nil
}

// stripCodeFence removes a leading ```json ... ``` fence if the model
// wraps its response despite the JSON response mime type.
func stripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
