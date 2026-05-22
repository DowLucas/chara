//go:build integration

package testutil

import (
	"context"
	"testing"
	"time"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// CreateUser inserts a user and returns it.
func CreateUser(t *testing.T, pool *pgxpool.Pool, email, displayName string) db.User {
	t.Helper()
	q := db.New(pool)
	user, err := q.UpsertUser(context.Background(), db.UpsertUserParams{
		ID:          ulid.New(),
		Email:       email,
		DisplayName: displayName,
		AvatarUrl:   nullText(""),
		Locale:      "en",
	})
	require.NoError(t, err)
	return user
}

// CreateGroup inserts a group and adds ownerID as the owner member. Returns the group and owner member.
func CreateGroup(t *testing.T, pool *pgxpool.Pool, name, currency string, ownerUserID string, ownerName string) (db.Group, db.GroupMember) {
	t.Helper()
	q := db.New(pool)

	group, err := q.CreateGroup(context.Background(), db.CreateGroupParams{
		ID:          ulid.New(),
		Name:        name,
		Currency:    currency,
		CreatedBy:   ownerUserID,
		InviteToken: ulid.New(),
	})
	require.NoError(t, err)

	member, err := q.CreateGroupMember(context.Background(), db.CreateGroupMemberParams{
		ID:      ulid.New(),
		GroupID: group.ID,
		UserID:  pgText(ownerUserID),
		Name:    ownerName,
		Role:    "owner",
		IsGhost: false,
	})
	require.NoError(t, err)

	return group, member
}

// AddMember adds a regular member to a group. Returns the created member.
func AddMember(t *testing.T, pool *pgxpool.Pool, groupID, userID, name string) db.GroupMember {
	t.Helper()
	q := db.New(pool)
	member, err := q.CreateGroupMember(context.Background(), db.CreateGroupMemberParams{
		ID:      ulid.New(),
		GroupID: groupID,
		UserID:  pgText(userID),
		Name:    name,
		Role:    "member",
		IsGhost: false,
	})
	require.NoError(t, err)
	return member
}

// ExpenseFixture holds an expense with its splits for test assertions.
type ExpenseFixture struct {
	Expense db.CreateExpenseRow
	Splits  []db.ExpenseSplit
}

// CreateExpense inserts an expense with equal splits across memberIDs directly in the DB.
// Use this to set up state for List/Get/Update/Delete tests.
func CreateExpense(t *testing.T, pool *pgxpool.Pool, groupID, title string, amountMinorUnits int64, currency, paidByMemberID, createdByUserID string, memberIDs []string) ExpenseFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	expense, err := q.CreateExpense(ctx, db.CreateExpenseParams{
		ID:          ulid.New(),
		GroupID:     groupID,
		Title:       title,
		Amount:      amountMinorUnits,
		Currency:    currency,
		PaidByID:    paidByMemberID,
		SplitMethod: "equal",
		Category:    "general",
		Notes:       pgtype.Text{Valid: false},
		ExpenseDate: pgtype.Date{Time: time.Now(), Valid: true},
		IsReimbursement: false,
		CreatedByID: createdByUserID,
	})
	require.NoError(t, err)

	base := amountMinorUnits / int64(len(memberIDs))
	remainder := int(amountMinorUnits % int64(len(memberIDs)))
	var splits []db.ExpenseSplit
	for i, memberID := range memberIDs {
		share := base
		if i < remainder {
			share++
		}
		split, err := q.CreateExpenseSplit(ctx, db.CreateExpenseSplitParams{
			ID:        ulid.New(),
			ExpenseID: expense.ID,
			MemberID:  memberID,
			Share:     share,
		})
		require.NoError(t, err)
		splits = append(splits, split)
	}

	return ExpenseFixture{Expense: expense, Splits: splits}
}
