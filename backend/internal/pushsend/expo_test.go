package pushsend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExpoClient_Send_HappyPath(t *testing.T) {
	var gotAuth string
	var gotBody []Message
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		resp := struct {
			Data []ticket `json:"data"`
		}{Data: make([]ticket, len(gotBody))}
		for i := range resp.Data {
			resp.Data[i] = ticket{Status: "ok", ID: "receipt-id"}
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := NewExpo("test-token", WithExpoBaseURL(srv.URL))
	msgs := []Message{
		{To: "ExponentPushToken[aaa]", Title: "Hi", Body: "World", Data: map[string]any{"url": "chara://groups/x/y"}},
	}
	if err := c.Send(context.Background(), msgs); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if gotAuth != "Bearer test-token" {
		t.Errorf("Authorization header = %q, want %q", gotAuth, "Bearer test-token")
	}
	if len(gotBody) != 1 || gotBody[0].To != "ExponentPushToken[aaa]" {
		t.Errorf("unexpected request body: %+v", gotBody)
	}
}

func TestExpoClient_Send_NoTokenOmitsAuthHeader(t *testing.T) {
	var gotAuth string
	var sawHeader bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, sawHeader = r.Header.Get("Authorization"), r.Header.Get("Authorization") != ""
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(struct {
			Data []ticket `json:"data"`
		}{Data: []ticket{{Status: "ok"}}})
	}))
	defer srv.Close()

	c := NewExpo("", WithExpoBaseURL(srv.URL))
	err := c.Send(context.Background(), []Message{{To: "ExponentPushToken[aaa]", Title: "Hi", Body: "World"}})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if sawHeader {
		t.Errorf("expected no Authorization header, got %q", gotAuth)
	}
}

func TestExpoClient_Send_ChunksOver100(t *testing.T) {
	var requestCount int
	var sizes []int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body []Message
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		requestCount++
		sizes = append(sizes, len(body))
		w.Header().Set("Content-Type", "application/json")
		resp := struct {
			Data []ticket `json:"data"`
		}{Data: make([]ticket, len(body))}
		for i := range resp.Data {
			resp.Data[i] = ticket{Status: "ok"}
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := NewExpo("token", WithExpoBaseURL(srv.URL))
	msgs := make([]Message, 150)
	for i := range msgs {
		msgs[i] = Message{To: "ExponentPushToken[x]", Title: "t", Body: "b"}
	}
	if err := c.Send(context.Background(), msgs); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if requestCount != 2 {
		t.Fatalf("requestCount = %d, want 2", requestCount)
	}
	for _, n := range sizes {
		if n > maxBatchSize {
			t.Errorf("batch size %d exceeds max %d", n, maxBatchSize)
		}
	}
	total := 0
	for _, n := range sizes {
		total += n
	}
	if total != 150 {
		t.Errorf("total messages sent = %d, want 150", total)
	}
}

func TestExpoClient_Send_LogsErrorTicketsWithoutFailing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		resp := struct {
			Data []ticket `json:"data"`
		}{Data: []ticket{
			{Status: "ok", ID: "id1"},
			{Status: "error", Message: "DeviceNotRegistered"},
		}}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := NewExpo("token", WithExpoBaseURL(srv.URL))
	msgs := []Message{
		{To: "ExponentPushToken[ok]", Title: "t", Body: "b"},
		{To: "ExponentPushToken[bad]", Title: "t", Body: "b"},
	}
	if err := c.Send(context.Background(), msgs); err != nil {
		t.Fatalf("Send should not fail on per-message error tickets: %v", err)
	}
}

func TestExpoClient_Send_NonSuccessHTTPStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()

	c := NewExpo("token", WithExpoBaseURL(srv.URL))
	err := c.Send(context.Background(), []Message{{To: "ExponentPushToken[x]", Title: "t", Body: "b"}})
	if err == nil {
		t.Fatal("expected error on non-2xx response")
	}
}
