//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/DowLucas/chara/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── writeActivity helper ──────────────────────────────────────────────────────
//
// Exercises the helper directly to keep the contract obvious: nil payload
// stores NULL JSONB; a struct payload is JSON-marshalled and the envelope
// gains the entity_type for free.
func TestWriteActivity_PersistsPayload(t *testing.T) {
	env := testutil.NewEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_wa"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "G", "SEK", alice.ID, "Alice")

	q := db.New(env.Pool)
	err := handler.WriteActivityForTest(context.Background(), q, group.ID, alice.ID,
		"expense_added", "exp_123", "expense",
		&handler.ActivityPayload{Snapshot: handler.ExpenseSnapshot{
			Title:         "Coffee",
			Amount:        500,
			Currency:      "SEK",
			PayerMemberID: "mem_xyz",
		}})
	require.NoError(t, err)

	rows, err := q.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.NotEmpty(t, rows[0].Payload)

	var env1 struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			Title         string `json:"title"`
			Amount        int64  `json:"amount"`
			Currency      string `json:"currency"`
			PayerMemberID string `json:"payer_member_id"`
		} `json:"snapshot"`
	}
	require.NoError(t, json.Unmarshal(rows[0].Payload, &env1))
	assert.Equal(t, "expense", env1.EntityType)
	assert.Equal(t, "Coffee", env1.Snapshot.Title)
	assert.Equal(t, int64(500), env1.Snapshot.Amount)
	assert.Equal(t, "SEK", env1.Snapshot.Currency)
	assert.Equal(t, "mem_xyz", env1.Snapshot.PayerMemberID)
}

func TestWriteActivity_NilPayload_StoresNull(t *testing.T) {
	env := testutil.NewEnv(t)
	alice := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "alice_wa2"), "Alice")
	group, _ := testutil.CreateGroup(t, env.Pool, "G2", "SEK", alice.ID, "Alice")

	q := db.New(env.Pool)
	err := handler.WriteActivityForTest(context.Background(), q, group.ID, alice.ID,
		"invite_link_rotated", group.ID, "group", nil)
	require.NoError(t, err)

	rows, err := q.ListActivityByGroup(context.Background(), db.ListActivityByGroupParams{
		GroupID: group.ID, Limit: 10, Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Empty(t, rows[0].Payload, "nil payload should not be marshalled")
}

// ── ListGroupActivity HTTP ────────────────────────────────────────────────────

func TestListGroupActivity_NonMember_403(t *testing.T) {
	env, _, _, groupID, _, _ := setupExpenseEnv(t)

	stranger := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "stranger"), "Stranger")
	strangerToken := env.MintToken(t, stranger.ID, stranger.Email)

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/activity", "", strangerToken))
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestListGroupActivity_Member_OK(t *testing.T) {
	env, alice, _, groupID, aliceMemberID, bobMemberID := setupExpenseEnv(t)

	// Seed: HTTP create expense so we get a real activity row with payload.
	body := `{
		"title": "Dinner",
		"amount": "90.00",
		"currency": "SEK",
		"paid_by_id": "` + aliceMemberID + `",
		"split_method": "equal",
		"participants": ["` + aliceMemberID + `", "` + bobMemberID + `"]
	}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/groups/"+groupID+"/expenses", body, alice.Token))
	require.Equal(t, http.StatusCreated, rr.Code)

	rr = env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/activity", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	require.NotEmpty(t, resp)

	// Newest-first ordering and required fields.
	first := resp[0]
	assert.Equal(t, "expense_added", first["event_type"])
	assert.Equal(t, alice.ID, first["actor_id"])
	assert.Equal(t, "Alice", first["actor_name"])
	assert.NotNil(t, first["payload"], "payload must be exposed on the response")
}

func TestListGroupActivity_RespectsLimit(t *testing.T) {
	env, alice, _, groupID, _, _ := setupExpenseEnv(t)

	// Seed 5 raw activity rows directly via the queries layer — we only care
	// about paging behaviour here, not the writer pipeline.
	q := db.New(env.Pool)
	for i := 0; i < 5; i++ {
		_, err := q.CreateActivity(context.Background(), db.CreateActivityParams{
			ID:         ulid.New(),
			GroupID:    groupID,
			ActorID:    alice.ID,
			EventType:  "expense_added",
			EntityID:   pgtype.Text{String: "exp" + ulid.New(), Valid: true},
			EntityType: pgtype.Text{String: "expense", Valid: true},
			Payload:    []byte(`{"entity_type":"expense","snapshot":{"title":"x"}}`),
		})
		require.NoError(t, err)
	}

	rr := env.Do(t, env.AuthRequest(t, "GET", "/api/groups/"+groupID+"/activity?limit=2", "", alice.Token))
	require.Equal(t, http.StatusOK, rr.Code)

	var resp []map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 2)
}
