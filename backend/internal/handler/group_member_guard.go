package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
)

// requireGroupMember resolves the authenticated user's own member row in the
// given group, writing the appropriate error response (403 / 500) and
// returning ok=false on failure. Shared by ExpenseHandler and ImportHandler so
// the membership gate lives in exactly one place. Pass the tx-bound
// *db.Queries inside a transaction.
func requireGroupMember(ctx context.Context, q *db.Queries, w http.ResponseWriter, groupID string) (db.GroupMember, bool) {
	claims := middleware.ClaimsFromContext(ctx)
	member, err := q.GetGroupMemberByUserAndGroup(ctx, db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusForbidden, "not a member of this group")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return db.GroupMember{}, false
	}
	return member, true
}

// validateMembersInGroup ensures every supplied member ID exists and belongs
// to groupID. Without this check, a member of group A could submit an expense
// whose split/participant rows reference members of group B — the
// expense_splits FK only points at group_members(id) and does not enforce
// group consistency. Returns a deliberately generic error so callers can't
// probe member existence by diffing error strings. Pass the tx-bound
// *db.Queries so it sees rows (e.g. placeholders) created earlier in the same
// transaction.
func validateMembersInGroup(ctx context.Context, q *db.Queries, memberIDs []string, groupID string) error {
	seen := make(map[string]struct{}, len(memberIDs))
	for _, id := range memberIDs {
		if id == "" {
			return fmt.Errorf("invalid split member")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		member, err := q.GetGroupMember(ctx, id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("invalid split member")
			}
			return err
		}
		if member.GroupID != groupID {
			return fmt.Errorf("invalid split member")
		}
	}
	return nil
}
