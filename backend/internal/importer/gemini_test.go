package importer

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPromptFor_KnownSourceLayersHint(t *testing.T) {
	p := promptFor("splitwise")
	assert.Contains(t, p, "Splitwise")
	assert.Contains(t, p, genericPrompt)
}

func TestPromptFor_UnknownSourceUsesGeneric(t *testing.T) {
	assert.Equal(t, genericPrompt, promptFor("nope"))
	assert.Equal(t, genericPrompt, promptFor(""))
}

func TestNormalizeAmount(t *testing.T) {
	assert.Equal(t, "340.00", normalizeAmount("340"))
	assert.Equal(t, "340.00", normalizeAmount(" 340.0 "))
	assert.Equal(t, "90.50", normalizeAmount("90.5"))
	assert.Equal(t, "12.35", normalizeAmount("12.345"))
	// Unparseable left as-is (commit rejects on parse).
	assert.Equal(t, "abc", normalizeAmount("abc"))
}

func TestGeminiExtractor_MergesStandingsAndNormalizes(t *testing.T) {
	// Image 0: Anna owes you 340 (amount "340" → 2dp). Image 1: Anna again
	// (dup, lower confidence) + Sven you_owe. Result: Anna (conf 0.9), Sven.
	responses := []string{
		`{"candidates":[{"content":{"parts":[{"text":"{\"currency\":\"SEK\",\"standings\":[{\"name\":\"Anna\",\"direction\":\"owes_you\",\"amount\":\"340\",\"confidence\":0.9}]}"}]}}]}`,
		`{"candidates":[{"content":{"parts":[{"text":"{\"currency\":\"SEK\",\"standings\":[{\"name\":\"anna\",\"direction\":\"owes_you\",\"amount\":\"340.00\",\"confidence\":0.4},{\"name\":\"Sven\",\"direction\":\"you_owe\",\"amount\":\"90.5\",\"confidence\":0.8}]}"}]}}]}`,
	}
	var call int
	var mu = make(chan struct{}, 1)
	mu <- struct{}{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-mu
		idx := call
		if idx >= len(responses) {
			idx = len(responses) - 1
		}
		call++
		mu <- struct{}{}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(responses[idx]))
	}))
	defer srv.Close()

	ex := NewGeminiExtractor("test-key", WithBaseURL(srv.URL))
	out, err := ex.Extract(context.Background(), []Image{
		{Data: []byte("img0"), MIMEType: "image/png"},
		{Data: []byte("img1"), MIMEType: "image/png"},
	}, "splitwise")
	require.NoError(t, err)

	assert.Equal(t, "SEK", out.Currency)
	require.Len(t, out.Standings, 2)

	byName := map[string]Standing{}
	for _, s := range out.Standings {
		byName[strings.ToLower(s.Name)] = s
	}
	anna := byName["anna"]
	assert.Equal(t, DirectionOwesYou, anna.Direction)
	assert.Equal(t, "340.00", anna.Amount)
	assert.InDelta(t, 0.9, anna.Confidence, 0.0001)

	sven := byName["sven"]
	assert.Equal(t, DirectionYouOwe, sven.Direction)
	assert.Equal(t, "90.50", sven.Amount)
}

func TestGeminiExtractor_AllImagesFailReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"error\":\"unreadable\"}"}]}}]}`))
	}))
	defer srv.Close()

	ex := NewGeminiExtractor("k", WithBaseURL(srv.URL))
	_, err := ex.Extract(context.Background(), []Image{{Data: []byte("x")}, {Data: []byte("y")}}, "other")
	require.Error(t, err)
}

func TestGeminiExtractor_PartialFailureSucceeds(t *testing.T) {
	// One unreadable, one good → success with the good standing.
	var call int
	var mu = make(chan struct{}, 1)
	mu <- struct{}{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-mu
		idx := call
		call++
		mu <- struct{}{}
		if idx == 0 {
			_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"error\":\"unreadable\"}"}]}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"currency\":\"SEK\",\"standings\":[{\"name\":\"Anna\",\"direction\":\"owes_you\",\"amount\":\"10.00\",\"confidence\":0.9}]}"}]}}]}`))
	}))
	defer srv.Close()

	ex := NewGeminiExtractor("k", WithBaseURL(srv.URL))
	out, err := ex.Extract(context.Background(), []Image{{Data: []byte("x")}, {Data: []byte("y")}}, "other")
	require.NoError(t, err)
	require.Len(t, out.Standings, 1)
	assert.Equal(t, "Anna", out.Standings[0].Name)
}

func TestStripCodeFence(t *testing.T) {
	assert.Equal(t, `{"a":1}`, stripCodeFence("```json\n{\"a\":1}\n```"))
	assert.Equal(t, `{"a":1}`, stripCodeFence(`{"a":1}`))
	assert.True(t, strings.HasPrefix(stripCodeFence("```\n{}\n```"), "{"))
}
