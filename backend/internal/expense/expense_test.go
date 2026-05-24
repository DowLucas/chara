//go:build integration

package expense_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/expense"
	"github.com/DowLucas/chara/testutil"
	"github.com/stretchr/testify/require"
)

func TestCreate_WritesExpenseSplitsAndActivity(t *testing.T) {
	env := testutil.NewEnv(t)
	alice := testutil.CreateUser(t, env.Pool, "alice-expcreate@test", "Alice")
	bob := testutil.CreateUser(t, env.Pool, "bob-expcreate@test", "Bob")
	group, aliceMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", alice.ID, "Alice")
	bobMember := testutil.AddMember(t, env.Pool, group.ID, bob.ID, "Bob")

	ctx := context.Background()
	tx, err := env.Pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)

	created, err := expense.Create(ctx, tx, env.Queries, expense.Input{
		GroupID:        group.ID,
		Title:          "Dinner",
		AmountMinor:    12000,
		Currency:       "SEK",
		PaidByMemberID: aliceMember.ID,
		SplitMethod:    "equal",
		Splits: []expense.SplitInput{
			{MemberID: aliceMember.ID, Value: 6000},
			{MemberID: bobMember.ID, Value: 6000},
		},
		Category:        "general",
		ExpenseDate:     time.Now(),
		CreatedByUserID: alice.ID,
	})
	require.NoError(t, err)
	require.NotEmpty(t, created.ExpenseID)
	require.Equal(t, "Dinner", created.Row.Title)
	require.EqualValues(t, 12000, created.Row.Amount)
	require.Equal(t, "SEK", created.Row.Currency)
	require.Equal(t, aliceMember.ID, created.Row.PaidByID)
	require.Len(t, created.Splits, 2)
	require.NoError(t, tx.Commit(ctx))

	// Re-read splits via the existing query.
	splits, err := env.Queries.ListSplitsByExpense(ctx, created.ExpenseID)
	require.NoError(t, err)
	require.Len(t, splits, 2)
	totalShare := int64(0)
	for _, s := range splits {
		require.Equal(t, created.ExpenseID, s.ExpenseID)
		totalShare += s.Share
	}
	require.EqualValues(t, 12000, totalShare)

	// Re-read activity row — expense_added should be present for this group
	// with our entity_id, and the payload should snapshot the expense.
	rows, err := env.Queries.ListActivityByGroup(ctx, db.ListActivityByGroupParams{
		GroupID: group.ID,
		Limit:   50,
		Offset:  0,
	})
	require.NoError(t, err)

	var found *db.Activity
	for i := range rows {
		if rows[i].EventType == "expense_added" && rows[i].EntityID.Valid && rows[i].EntityID.String == created.ExpenseID {
			found = &rows[i]
			break
		}
	}
	require.NotNil(t, found, "expense_added activity row should exist for the new expense")
	require.Equal(t, alice.ID, found.ActorID)
	require.True(t, found.EntityType.Valid)
	require.Equal(t, "expense", found.EntityType.String)

	var payload struct {
		EntityType string `json:"entity_type"`
		Snapshot   struct {
			Title         string `json:"title"`
			Amount        int64  `json:"amount"`
			Currency      string `json:"currency"`
			PayerMemberID string `json:"payer_member_id"`
		} `json:"snapshot"`
	}
	require.NoError(t, json.Unmarshal(found.Payload, &payload))
	require.Equal(t, "expense", payload.EntityType)
	require.Equal(t, "Dinner", payload.Snapshot.Title)
	require.EqualValues(t, 12000, payload.Snapshot.Amount)
	require.Equal(t, "SEK", payload.Snapshot.Currency)
	require.Equal(t, aliceMember.ID, payload.Snapshot.PayerMemberID)
}
