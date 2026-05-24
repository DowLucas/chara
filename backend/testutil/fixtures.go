//go:build integration

package testutil

import (
	"context"
	"strconv"
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
		ID:                         ulid.New(),
		Name:                       name,
		Currency:                   currency,
		CreatedBy:                  ownerUserID,
		InviteToken:                ulid.New(),
		InviteTokenCreatedByUserID: pgtype.Text{String: ownerUserID, Valid: true},
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

// SeedFxRate inserts an ECB-style EUR→quote rate for the given date. Useful
// for FX integration tests that don't want to hit the network.
func SeedFxRate(t *testing.T, pool *pgxpool.Pool, quote string, rate float64, asOf time.Time) {
	t.Helper()
	q := db.New(pool)
	var n pgtype.Numeric
	// Up to 10 decimal places matches the NUMERIC(20,10) column.
	require.NoError(t, n.Scan(formatFloatFixed(rate)))
	require.NoError(t, q.UpsertFxRate(context.Background(), db.UpsertFxRateParams{
		Base:   "EUR",
		Quote:  quote,
		Rate:   n,
		AsOf:   pgtype.Date{Time: asOf, Valid: true},
		Source: "ecb-test",
	}))
}

func formatFloatFixed(f float64) string {
	// Avoid scientific notation; 10 decimals matches the column scale.
	return strconv.FormatFloat(f, 'f', 10, 64)
}

// CreateExpense inserts an expense with equal splits across memberIDs directly in the DB.
// Use this to set up state for List/Get/Update/Delete tests.
func CreateExpense(t *testing.T, pool *pgxpool.Pool, groupID, title string, amountMinorUnits int64, currency, paidByMemberID, createdByUserID string, memberIDs []string) ExpenseFixture {
	return CreateExpenseOn(t, pool, groupID, title, amountMinorUnits, currency, paidByMemberID, createdByUserID, memberIDs, time.Now())
}

// CreateExpenseOn is CreateExpense with an explicit expense_date — needed
// by FX-aggregate tests that pin the leg to a date the seeded ECB rate
// matches.
func CreateExpenseOn(t *testing.T, pool *pgxpool.Pool, groupID, title string, amountMinorUnits int64, currency, paidByMemberID, createdByUserID string, memberIDs []string, expenseDate time.Time) ExpenseFixture {
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
		ExpenseDate: pgtype.Date{Time: expenseDate, Valid: true},
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

// RecurringSeed describes the optional knobs for SeedRecurringExpense.
// Any zero-valued field falls back to a "sensible monthly" default.
type RecurringSeed struct {
	Title         string
	AmountMinor   int64
	Currency      string
	SplitMethod   string    // defaults to "equal"
	Category      string    // defaults to "general"
	FreqUnit      string    // defaults to "month"
	FreqInterval  int       // defaults to 1
	Timezone      string    // defaults to "Europe/Stockholm"
	StartDate     time.Time // defaults to now in UTC
	NextFireAt    time.Time // defaults to now (i.e. due immediately)
	LastFireAt    *time.Time
	Status        string // defaults to "active"
	SplitValues   map[string]int64
}

// SeedRecurringExpense inserts a recurring_expenses row plus its split
// rows. memberSplitIDs is the set of members on the rule's split; the
// payer member is paidByMemberID (need not be in the split list).
func SeedRecurringExpense(
	t *testing.T,
	pool *pgxpool.Pool,
	groupID, createdByUserID, paidByMemberID string,
	memberSplitIDs []string,
	seed RecurringSeed,
) db.RecurringExpense {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	if seed.Title == "" {
		seed.Title = "Test recurring"
	}
	if seed.AmountMinor == 0 {
		seed.AmountMinor = 1200
	}
	if seed.Currency == "" {
		seed.Currency = "SEK"
	}
	if seed.SplitMethod == "" {
		seed.SplitMethod = "equal"
	}
	if seed.Category == "" {
		seed.Category = "general"
	}
	if seed.FreqUnit == "" {
		seed.FreqUnit = "month"
	}
	if seed.FreqInterval == 0 {
		seed.FreqInterval = 1
	}
	if seed.Timezone == "" {
		seed.Timezone = "Europe/Stockholm"
	}
	now := time.Now().UTC()
	if seed.StartDate.IsZero() {
		seed.StartDate = now
	}
	if seed.NextFireAt.IsZero() {
		seed.NextFireAt = now
	}
	if seed.Status == "" {
		seed.Status = "active"
	}

	id := ulid.New()
	row, err := q.CreateRecurringExpense(ctx, db.CreateRecurringExpenseParams{
		ID:            id,
		GroupID:       groupID,
		Title:         seed.Title,
		AmountMinor:   seed.AmountMinor,
		Currency:      seed.Currency,
		PaidByID:      paidByMemberID,
		SplitMethod:   seed.SplitMethod,
		Category:      seed.Category,
		Notes:         pgtype.Text{Valid: false},
		FreqUnit:      seed.FreqUnit,
		FreqInterval:  int32(seed.FreqInterval),
		StartDate:     pgtype.Date{Time: seed.StartDate, Valid: true},
		EndDate:       pgtype.Date{Valid: false},
		Timezone:      seed.Timezone,
		FireLocalTime: pgtype.Time{Microseconds: 9 * 3600 * 1_000_000, Valid: true},
		NextFireAt:    pgtype.Timestamptz{Time: seed.NextFireAt, Valid: true},
		CreatedByID:   createdByUserID,
	})
	require.NoError(t, err)

	if seed.Status != "active" {
		_, err := q.SetRecurringStatus(ctx, db.SetRecurringStatusParams{
			ID:           id,
			Status:       seed.Status,
			PausedReason: pgtype.Text{Valid: false},
		})
		require.NoError(t, err)
	}
	if seed.LastFireAt != nil {
		_, err := pool.Exec(ctx, "UPDATE recurring_expenses SET last_fire_at = $2 WHERE id = $1",
			id, *seed.LastFireAt)
		require.NoError(t, err)
	}

	for _, mid := range memberSplitIDs {
		val := int64(0)
		if seed.SplitValues != nil {
			val = seed.SplitValues[mid]
		}
		err := q.CreateRecurringSplit(ctx, db.CreateRecurringSplitParams{
			RecurringID: id,
			MemberID:    mid,
			Value:       val,
		})
		require.NoError(t, err)
	}

	// Re-fetch with the updates applied.
	out, err := q.GetRecurringExpense(ctx, id)
	require.NoError(t, err)
	_ = row
	return out
}
