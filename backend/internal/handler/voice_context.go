package handler

import (
	"context"
	"fmt"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/voice"
	"github.com/jackc/pgx/v5/pgtype"
)

// dbVoiceContext adapts *db.Queries to GroupContextLookup.
type dbVoiceContext struct{ queries *db.Queries }

// NewVoiceContextLookup wires the real DB-backed lookup for production use.
func NewVoiceContextLookup(queries *db.Queries) GroupContextLookup {
	return dbVoiceContext{queries: queries}
}

// VoiceContext resolves the group's roster, settings and the caller's own
// member id.
//
// The membership check comes first and its failure is fatal, not fail-open:
// this returns the group's full membership list, so a non-member must get
// nothing.
func (d dbVoiceContext) VoiceContext(ctx context.Context, groupID, userID string) (voice.Context, error) {
	if userID == "" {
		return voice.Context{}, fmt.Errorf("voice context: unauthenticated")
	}
	caller, err := d.queries.GetGroupMemberByUserAndGroup(ctx, db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: userID, Valid: true},
	})
	if err != nil {
		return voice.Context{}, fmt.Errorf("voice context: not a member: %w", err)
	}

	g, err := d.queries.GetGroupByID(ctx, groupID)
	if err != nil {
		return voice.Context{}, fmt.Errorf("voice context: load group: %w", err)
	}
	members, err := d.queries.ListGroupMembers(ctx, groupID)
	if err != nil {
		return voice.Context{}, fmt.Errorf("voice context: list members: %w", err)
	}

	vc := voice.Context{
		GroupID:        g.ID,
		GroupName:      g.Name,
		Currency:       g.Currency,
		Language:       g.Language,
		Categories:     resolveCategorySlugs(g.CategorySlugs),
		CallerMemberID: caller.ID,
		Members:        make([]voice.Member, 0, len(members)),
	}
	for _, m := range members {
		vc.Members = append(vc.Members, voice.Member{
			ID: m.ID, Name: m.Name, IsGhost: m.IsGhost,
		})
	}
	return vc, nil
}
