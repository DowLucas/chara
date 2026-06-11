package push

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// expoOKTickets builds a fake Expo response body with n "ok" tickets.
func expoOKTickets(t *testing.T, n int) []byte {
	t.Helper()
	tickets := make([]expoTicket, n)
	for i := range tickets {
		tickets[i] = expoTicket{Status: "ok", ID: fmt.Sprintf("ticket-%d", i)}
	}
	b, err := json.Marshal(expoResponse{Data: tickets})
	require.NoError(t, err)
	return b
}

func TestExpoSender_Send_HappyPathSingle(t *testing.T) {
	var captured []expoMessage
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/push/send", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &captured))

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(expoOKTickets(t, len(captured)))
	}))
	defer srv.Close()

	s := NewExpo(WithExpoBaseURL(srv.URL))
	res, err := s.Send(context.Background(), []Message{{
		To:    "ExponentPushToken[aaa]",
		Title: "New expense",
		Body:  "Dinner — 240,00 kr",
		Data:  map[string]string{"url": "chara://groups/https%3A%2F%2Fchara.example/grp_1"},
	}})
	require.NoError(t, err)
	assert.Empty(t, res.DeviceNotRegistered)

	// Verify the wire shape we sent: a JSON array of message objects.
	require.Len(t, captured, 1)
	assert.Equal(t, "ExponentPushToken[aaa]", captured[0].To)
	assert.Equal(t, "New expense", captured[0].Title)
	assert.Equal(t, "Dinner — 240,00 kr", captured[0].Body)
	assert.Equal(t, map[string]string{"url": "chara://groups/https%3A%2F%2Fchara.example/grp_1"}, captured[0].Data)
}

func TestExpoSender_Send_BatchesAt100(t *testing.T) {
	// 150 messages must split into two requests of 100 and 50. A dead token
	// in the SECOND batch verifies positional ticket mapping survives
	// batching (a global-index bug would surface the wrong token).
	const dead = "ExponentPushToken[dead]"
	var batchSizes []int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var batch []expoMessage
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &batch))
		batchSizes = append(batchSizes, len(batch))

		tickets := make([]expoTicket, len(batch))
		for i, m := range batch {
			if m.To == dead {
				tickets[i] = expoTicket{
					Status:  "error",
					Message: "not a registered push notification recipient",
					Details: &expoTicketDetails{Error: "DeviceNotRegistered"},
				}
			} else {
				tickets[i] = expoTicket{Status: "ok", ID: fmt.Sprintf("ticket-%d", i)}
			}
		}
		b, err := json.Marshal(expoResponse{Data: tickets})
		require.NoError(t, err)
		_, _ = w.Write(b)
	}))
	defer srv.Close()

	msgs := make([]Message, 150)
	for i := range msgs {
		msgs[i] = Message{To: fmt.Sprintf("ExponentPushToken[%d]", i), Title: "t", Body: "b"}
	}
	msgs[120].To = dead

	res, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), msgs)
	require.NoError(t, err)
	assert.Equal(t, []int{100, 50}, batchSizes)
	assert.Equal(t, []string{dead}, res.DeviceNotRegistered)
}

func TestExpoSender_Send_DeviceNotRegistered(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		b, err := json.Marshal(expoResponse{Data: []expoTicket{
			{Status: "ok", ID: "ticket-0"},
			{
				Status:  "error",
				Message: `"ExponentPushToken[bbb]" is not a registered push notification recipient`,
				Details: &expoTicketDetails{Error: "DeviceNotRegistered"},
			},
		}})
		require.NoError(t, err)
		_, _ = w.Write(b)
	}))
	defer srv.Close()

	res, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), []Message{
		{To: "ExponentPushToken[aaa]", Title: "t", Body: "b"},
		{To: "ExponentPushToken[bbb]", Title: "t", Body: "b"},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"ExponentPushToken[bbb]"}, res.DeviceNotRegistered)
}

func TestExpoSender_Send_ServerErrorReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("bad gateway"))
	}))
	defer srv.Close()

	_, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), []Message{
		{To: "ExponentPushToken[aaa]", Title: "t", Body: "b"},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "502")
}

func TestExpoSender_Send_MalformedResponseReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("not json"))
	}))
	defer srv.Close()

	_, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), []Message{
		{To: "ExponentPushToken[aaa]", Title: "t", Body: "b"},
	})
	require.Error(t, err)
}

func TestExpoSender_Send_TicketCountMismatchReturnsError(t *testing.T) {
	// Tickets map to messages positionally; a count mismatch means we can no
	// longer attribute outcomes to tokens, so the batch must fail.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(expoOKTickets(t, 1))
	}))
	defer srv.Close()

	_, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), []Message{
		{To: "ExponentPushToken[aaa]", Title: "t", Body: "b"},
		{To: "ExponentPushToken[bbb]", Title: "t", Body: "b"},
	})
	require.Error(t, err)
}

func TestExpoSender_Send_NoMessagesNoRequest(t *testing.T) {
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		requests++
	}))
	defer srv.Close()

	res, err := NewExpo(WithExpoBaseURL(srv.URL)).Send(context.Background(), nil)
	require.NoError(t, err)
	assert.Empty(t, res.DeviceNotRegistered)
	assert.Zero(t, requests)
}
