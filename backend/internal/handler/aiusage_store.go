package handler

import (
	"context"

	"github.com/DowLucas/chara/internal/aiusage"
	"github.com/DowLucas/chara/internal/db"
	"github.com/jackc/pgx/v5/pgtype"
)

// dbAIUsageStore adapts *db.Queries to aiusage.Store.
type dbAIUsageStore struct{ queries *db.Queries }

// NewAIUsageStore wires the real DB-backed recorder store.
func NewAIUsageStore(queries *db.Queries) aiusage.Store { return dbAIUsageStore{queries: queries} }

func (d dbAIUsageStore) Insert(ctx context.Context, id string, rec aiusage.Record) error {
	return d.queries.InsertAIGeneration(ctx, db.InsertAIGenerationParams{
		ID:                    id,
		UserID:                rec.UserID,
		Feature:               rec.Feature,
		GroupID:               optText(rec.GroupID),
		Model:                 rec.Model,
		InputTokens:           optInt4(rec.InputTokens),
		OutputTokens:          optInt4(rec.OutputTokens),
		ClipMs:                optInt4(rec.ClipMS),
		RequestBytes:          optInt4(rec.RequestBytes),
		LatencyMs:             int32(rec.LatencyMS),
		Outcome:               rec.Outcome,
		ErrorClass:            optText(rec.ErrorClass),
		ExpenseCount:          int32(rec.ExpenseCount),
		QuestionCount:         int32(rec.QuestionCount),
		DegradedSplitCount:    int32(rec.DegradedSplitCount),
		UnresolvedMemberCount: int32(rec.UnresolvedMemberCount),
	})
}

// optText maps "" to SQL NULL. group_id in particular must be NULL rather
// than "" so the foreign key holds for features that have no group.
func optText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

// optInt4 maps 0 to SQL NULL. Every nullable column here is a measurement
// where "zero" and "not measured" mean the same thing, so collapsing them
// keeps aggregate queries honest — AVG(input_tokens) should not be dragged
// down by calls that never reported one.
func optInt4(n int) pgtype.Int4 {
	if n == 0 {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(n), Valid: true}
}
