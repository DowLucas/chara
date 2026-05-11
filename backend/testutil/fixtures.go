//go:build integration

package testutil

import (
	"context"
	"testing"

	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/ulid"
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
