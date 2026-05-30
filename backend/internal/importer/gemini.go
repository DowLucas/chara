package importer

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

// DefaultGeminiModel matches the receipt scanner's choice — Flash is the
// right latency/cost/vision tradeoff for screenshot OCR.
const DefaultGeminiModel = "gemini-3.5-flash"

const defaultGeminiBase = "https://generativelanguage.googleapis.com/v1beta"

// extractConcurrency bounds the number of in-flight vision calls so a 10-image
// import can't open 10 simultaneous Gemini requests. Calls within the limit
// run concurrently to stay inside the server's write timeout.
const extractConcurrency = 4

// extractDeadline is the overall budget for one Extract call. The server's
// HTTP WriteTimeout is 30s; we cap well under it so the handler can still
// write a response (502 on total failure) before the connection is torn down.
const extractDeadline = 25 * time.Second

// genericPrompt is the source-agnostic fallback used when no per-app prompt is
// registered. Per-app prompts in promptRegistry layer app-specific layout
// hints on top of this same output contract.
const genericPrompt = `You are reading a screenshot of the standings / balances screen of a bill-splitting app.
The screen shows the CURRENT net balance between the viewer ("you") and each other person.
Extract one entry per other person who has a non-zero balance. For each person return:
- name: the other person's name exactly as shown. NEVER return "you", "me", or the viewer themselves.
- direction: "owes_you" if that person owes the viewer money; "you_owe" if the viewer owes that person money.
- amount: the net balance as a positive decimal string with two decimals, e.g. "340.00".
- confidence: your confidence in this entry from 0 to 1.
Also return:
- currency: the ISO 4217 currency code shown (e.g. "SEK", "EUR").

Express every balance RELATIVE TO THE VIEWER. "Anna owes you 340" → {"name":"Anna","direction":"owes_you","amount":"340.00"}.
"You owe Sven 90" → {"name":"Sven","direction":"you_owe","amount":"90.00"}. Skip anyone settled up (zero balance).

Respond with a single JSON object and no other text:
{"currency":"SEK","standings":[{"name":"Anna","direction":"owes_you","amount":"340.00","confidence":0.9}]}

If the image is not a standings/balances screen, respond with {"error":"unreadable"}.`

// promptRegistry maps a source app key to an extra hint prepended to the
// generic prompt. Terse on purpose — the structure matters more than perfect
// per-app copy. Unknown sources fall back to the generic prompt alone.
var promptRegistry = map[string]string{
	"splitwise": `This is a Splitwise balances screen. Each row reads "<name> owes you <amount>" or "you owe <name> <amount>" (often green = owed to you, orange/red = you owe).`,
	"tricount":  `This is a Tricount balances screen. It shows what each participant's net balance is relative to you.`,
	"settleup":  `This is a Settle Up "who owes whom" screen. Each row pairs two people with an amount; report it relative to you.`,
	"splid":     `This is a Splid balances screen. Each person has a net amount; positive means they owe you.`,
	"steven":    `This is a Steven balances screen. Each row shows a person and their net balance with you.`,
}

// promptFor returns the full extraction prompt for a source. Unknown/empty
// source uses the generic prompt verbatim.
func promptFor(source string) string {
	hint, ok := promptRegistry[strings.ToLower(strings.TrimSpace(source))]
	if !ok {
		return genericPrompt
	}
	return hint + "\n\n" + genericPrompt
}

// GeminiExtractor implements Extractor by calling Google's Generative
// Language API once per image (concurrently) with a source-keyed prompt, then
// merging the standings by name.
type GeminiExtractor struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// GeminiExtractorOption configures a GeminiExtractor.
type GeminiExtractorOption func(*GeminiExtractor)

// WithModel overrides the model name.
func WithModel(model string) GeminiExtractorOption {
	return func(e *GeminiExtractor) { e.model = model }
}

// WithBaseURL overrides the API base URL (used by tests).
func WithBaseURL(url string) GeminiExtractorOption {
	return func(e *GeminiExtractor) { e.baseURL = url }
}

// WithHTTPClient injects a configured *http.Client.
func WithHTTPClient(c *http.Client) GeminiExtractorOption {
	return func(e *GeminiExtractor) { e.client = c }
}

// NewGeminiExtractor constructs an extractor. apiKey must be non-empty;
// callers should check config.HasGemini before instantiating.
func NewGeminiExtractor(apiKey string, opts ...GeminiExtractorOption) *GeminiExtractor {
	e := &GeminiExtractor{
		apiKey:  apiKey,
		model:   DefaultGeminiModel,
		baseURL: defaultGeminiBase,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
	for _, o := range opts {
		o(e)
	}
	return e
}

// Gemini request/response shapes (only the fields we use).
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
	Temperature      float64 `json:"temperature,omitempty"`
}

type geminiRequest struct {
	Contents         []geminiContent         `json:"contents"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

// geminiExtracted mirrors the per-image JSON the model returns.
type geminiExtracted struct {
	Currency  string `json:"currency"`
	Standings []struct {
		Name       string  `json:"name"`
		Direction  string  `json:"direction"`
		Amount     string  `json:"amount"`
		Confidence float64 `json:"confidence"`
	} `json:"standings"`
	Error string `json:"error"`
}

// Extract runs the per-source prompt over each image concurrently (bounded),
// merges the standings by name, normalizes amounts to 2 decimals, and unions
// the currency. Individual unreadable images are skipped — but if EVERY image
// fails, Extract returns a non-nil error so the handler can respond 502 rather
// than masking a bad API key / quota as an empty result.
func (e *GeminiExtractor) Extract(ctx context.Context, images []Image, source string) (Normalized, error) {
	prompt := promptFor(source)

	ctx, cancel := context.WithTimeout(ctx, extractDeadline)
	defer cancel()

	results := make([]geminiExtracted, len(images))
	ok := make([]bool, len(images))
	var lastErr error
	var mu sync.Mutex

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(extractConcurrency)
	for idx := range images {
		idx := idx
		g.Go(func() error {
			extracted, err := e.extractOne(gctx, prompt, images[idx])
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				lastErr = err
				return nil // one bad screenshot shouldn't sink the batch
			}
			results[idx] = extracted
			ok[idx] = true
			return nil
		})
	}
	_ = g.Wait()

	out := Normalized{}
	any := false
	for idx, extracted := range results {
		if !ok[idx] {
			continue
		}
		any = true
		if out.Currency == "" && extracted.Currency != "" {
			out.Currency = strings.ToUpper(strings.TrimSpace(extracted.Currency))
		}
		for _, s := range extracted.Standings {
			name := strings.TrimSpace(s.Name)
			if name == "" {
				continue
			}
			out.Standings = append(out.Standings, Standing{
				Name:       name,
				Direction:  strings.ToLower(strings.TrimSpace(s.Direction)),
				Amount:     normalizeAmount(s.Amount),
				Confidence: s.Confidence,
			})
		}
	}

	if !any {
		if lastErr != nil {
			return Normalized{}, fmt.Errorf("importer: all images failed extraction: %w", lastErr)
		}
		return Normalized{}, fmt.Errorf("importer: all images failed extraction")
	}

	out.Standings = MergeStandings(out.Standings)
	return out, nil
}

// normalizeAmount coerces a model-returned decimal string to exactly two
// decimal places so it round-trips through money.Amount's strict 2dp parser.
// Unparseable input is returned trimmed and unchanged (the commit handler
// rejects it on parse).
func normalizeAmount(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return s
	}
	return strconv.FormatFloat(f, 'f', 2, 64)
}

func (e *GeminiExtractor) extractOne(ctx context.Context, prompt string, img Image) (geminiExtracted, error) {
	mimeType := img.MIMEType
	if mimeType == "" {
		mimeType = "image/jpeg"
	}
	reqBody := geminiRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{
				{Text: prompt},
				{InlineData: &geminiInlineData{
					MIMEType: mimeType,
					Data:     base64.StdEncoding.EncodeToString(img.Data),
				}},
			},
		}},
		GenerationConfig: &geminiGenerationConfig{
			ResponseMIMEType: "application/json",
			Temperature:      0,
		},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return geminiExtracted{}, err
	}

	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", e.baseURL, e.model, e.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return geminiExtracted{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return geminiExtracted{}, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return geminiExtracted{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return geminiExtracted{}, fmt.Errorf("importer: gemini returned %d", resp.StatusCode)
	}

	var parsed geminiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return geminiExtracted{}, err
	}
	if parsed.Error != nil {
		return geminiExtracted{}, fmt.Errorf("importer: gemini error %s: %s", parsed.Error.Status, parsed.Error.Message)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return geminiExtracted{}, fmt.Errorf("importer: empty gemini response")
	}

	jsonText := stripCodeFence(strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text))
	var extracted geminiExtracted
	if err := json.Unmarshal([]byte(jsonText), &extracted); err != nil {
		return geminiExtracted{}, err
	}
	if extracted.Error != "" {
		return geminiExtracted{}, fmt.Errorf("importer: %s", extracted.Error)
	}
	return extracted, nil
}

// stripCodeFence removes a leading ```json … ``` fence if present.
func stripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
