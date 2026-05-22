package handler

import (
	"context"

	"github.com/DowLucas/chara/internal/db"
)

// WriteActivityForTest exposes the unexported writeActivity helper to the
// integration test package. Used only from _test.go files in the package
// `handler_test`. Keeping the production helper unexported preserves the
// contract that activity rows are only ever written from within a
// transactional handler.
func WriteActivityForTest(
	ctx context.Context,
	q *db.Queries,
	groupID, actorID, eventType, entityID, entityType string,
	payload *ActivityPayload,
) error {
	return writeActivity(ctx, q, groupID, actorID, eventType, entityID, entityType, payload)
}
