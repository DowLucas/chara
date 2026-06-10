package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultExpoBase = "https://exp.host/--/api/v2"

// expoMaxBatch is the maximum number of messages the Expo push API accepts
// per request.
const expoMaxBatch = 100

// ExpoSender sends notifications through the Expo Push Service.
type ExpoSender struct {
	baseURL string
	client  *http.Client
}

var _ Sender = (*ExpoSender)(nil)

// ExpoOption configures an ExpoSender.
type ExpoOption func(*ExpoSender)

// WithExpoBaseURL overrides the API base URL. Used by tests to point at an
// httptest.Server.
func WithExpoBaseURL(url string) ExpoOption {
	return func(s *ExpoSender) { s.baseURL = url }
}

// WithExpoHTTPClient lets callers inject a configured *http.Client (for
// custom timeouts, tracing, etc.).
func WithExpoHTTPClient(c *http.Client) ExpoOption {
	return func(s *ExpoSender) { s.client = c }
}

// NewExpo constructs a sender.
func NewExpo(opts ...ExpoOption) *ExpoSender {
	s := &ExpoSender{
		baseURL: defaultExpoBase,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Request/response shapes for the Expo push API. Only the fields we use are
// modeled. https://docs.expo.dev/push-notifications/sending-notifications/
type expoMessage struct {
	To    string            `json:"to"`
	Title string            `json:"title,omitempty"`
	Body  string            `json:"body,omitempty"`
	Data  map[string]string `json:"data,omitempty"`
}

type expoTicketDetails struct {
	Error string `json:"error,omitempty"`
}

type expoTicket struct {
	Status  string             `json:"status"` // "ok" | "error"
	ID      string             `json:"id,omitempty"`
	Message string             `json:"message,omitempty"`
	Details *expoTicketDetails `json:"details,omitempty"`
}

type expoResponse struct {
	Data []expoTicket `json:"data"`
}

// Send implements [Sender]. Messages are POSTed as a JSON array in batches
// of at most expoMaxBatch; Expo returns tickets in message order, so
// outcomes are matched to tokens positionally per batch.
func (s *ExpoSender) Send(ctx context.Context, msgs []Message) (*Result, error) {
	res := &Result{}
	for start := 0; start < len(msgs); start += expoMaxBatch {
		end := min(start+expoMaxBatch, len(msgs))
		if err := s.sendBatch(ctx, msgs[start:end], res); err != nil {
			return nil, err
		}
	}
	return res, nil
}

func (s *ExpoSender) sendBatch(ctx context.Context, batch []Message, res *Result) error {
	wire := make([]expoMessage, len(batch))
	for i, m := range batch {
		wire[i] = expoMessage{To: m.To, Title: m.Title, Body: m.Body, Data: m.Data}
	}
	body, err := json.Marshal(wire)
	if err != nil {
		return fmt.Errorf("push: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/push/send", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("push: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("push: expo request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("push: read expo response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("push: expo returned %d: %s", resp.StatusCode, truncate(string(rawBody), 300))
	}

	var parsed expoResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return fmt.Errorf("push: decode expo response %q: %w", truncate(string(rawBody), 200), err)
	}
	if len(parsed.Data) != len(batch) {
		return fmt.Errorf("push: expo returned %d tickets for %d messages", len(parsed.Data), len(batch))
	}

	for i, ticket := range parsed.Data {
		if ticket.Status == "error" && ticket.Details != nil && ticket.Details.Error == "DeviceNotRegistered" {
			res.DeviceNotRegistered = append(res.DeviceNotRegistered, batch[i].To)
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
