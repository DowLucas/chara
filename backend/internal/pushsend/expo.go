// Package pushsend calls Expo's Push API to deliver notifications to
// devices that registered an Expo push token (see internal/handler/push_tokens.go).
package pushsend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// DefaultExpoBaseURL is Expo's push-send endpoint.
const DefaultExpoBaseURL = "https://exp.host/--/api/v2/push/send"

// maxBatchSize is Expo's hard cap on messages per request.
const maxBatchSize = 100

// ExpoClient sends push notifications via Expo's Push API.
type ExpoClient struct {
	accessToken string
	baseURL     string
	client      *http.Client
}

// ExpoOption configures an ExpoClient.
type ExpoOption func(*ExpoClient)

// WithExpoBaseURL overrides the API base URL. Used by tests to point at an
// httptest.Server.
func WithExpoBaseURL(url string) ExpoOption {
	return func(c *ExpoClient) { c.baseURL = url }
}

// WithExpoHTTPClient lets callers inject a configured *http.Client.
func WithExpoHTTPClient(hc *http.Client) ExpoOption {
	return func(c *ExpoClient) { c.client = hc }
}

// NewExpo constructs a client. accessToken may be empty — Expo's push API
// works without one for reasonable volume; a token only raises rate limits.
func NewExpo(accessToken string, opts ...ExpoOption) *ExpoClient {
	c := &ExpoClient{
		accessToken: accessToken,
		baseURL:     DefaultExpoBaseURL,
		client:      &http.Client{Timeout: 10 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// Message is a single Expo push message.
type Message struct {
	To    string         `json:"to"`
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Data  map[string]any `json:"data,omitempty"`
}

// ticket is Expo's per-message send result.
type ticket struct {
	Status  string `json:"status"` // "ok" | "error"
	ID      string `json:"id,omitempty"`
	Message string `json:"message,omitempty"`
	Details struct {
		Error string `json:"error,omitempty"`
	} `json:"details,omitempty"`
}

type sendResponse struct {
	Data []ticket `json:"data"`
}

// Send delivers msgs to Expo, chunking into batches of at most
// maxBatchSize. Per-message failures (e.g. DeviceNotRegistered) are logged
// and otherwise ignored — v1 is fire-and-forget, with no receipt polling or
// automatic push_tokens cleanup. Send only returns an error for
// request-level failures (network error, non-2xx HTTP response).
func (c *ExpoClient) Send(ctx context.Context, msgs []Message) error {
	for start := 0; start < len(msgs); start += maxBatchSize {
		end := start + maxBatchSize
		if end > len(msgs) {
			end = len(msgs)
		}
		if err := c.sendBatch(ctx, msgs[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func (c *ExpoClient) sendBatch(ctx context.Context, batch []Message) error {
	body, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("pushsend: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("pushsend: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.accessToken)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("pushsend: expo request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("pushsend: read expo response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("pushsend: expo returned %d: %s", resp.StatusCode, truncate(string(rawBody), 300))
	}

	var parsed sendResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return fmt.Errorf("pushsend: decode expo response: %w", err)
	}
	for _, t := range parsed.Data {
		if t.Status == "error" {
			slog.Warn("pushsend: ticket error", "message", t.Message, "detail_error", t.Details.Error)
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
