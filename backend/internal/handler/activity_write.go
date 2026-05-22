package handler

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
)

// Canonical activity event types. Keep this list in sync with the schema
// comment in migrations/000007_create_activity.up.sql.
const (
	EventExpenseAdded       = "expense_added"
	EventExpenseEdited      = "expense_edited"
	EventExpenseDeleted     = "expense_deleted"
	EventSettlementAdded    = "settlement_added"
	EventSettlementReverted = "settlement_reverted"
	EventMemberJoined       = "member_joined"
	EventGroupCreated       = "group_created"
	EventGroupUpdated       = "group_updated"
	EventGroupArchived      = "group_archived"
	EventInviteLinkRotated  = "invite_link_rotated"

	EntityExpense    = "expense"
	EntitySettlement = "settlement"
	EntityGroup      = "group"
	EntityMember     = "member"
)

// ActivityPayload is the JSON envelope stored in `activity.payload`. The
// snapshot field is intentionally typed as `any` so each event type can
// pin its own minimal shape — the wire format is just JSONB. Clients
// must tolerate missing fields and extra fields.
//
// Snapshots are kept minimal: only what the activity row needs to render
// itself without re-querying the underlying entity. That way an activity
// row stays useful even if the entity is later edited or deleted.
type ActivityPayload struct {
	EntityType string `json:"entity_type"`
	Snapshot   any    `json:"snapshot,omitempty"`
}

// ExpenseSnapshot captures the minimum needed to describe an expense
// activity row.
type ExpenseSnapshot struct {
	Title         string `json:"title"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	PayerMemberID string `json:"payer_member_id"`
}

// SettlementSnapshot captures the minimum needed to describe a settlement
// activity row. Member names are denormalised into the snapshot so the
// renderer doesn't need a follow-up fetch (and so the row stays readable
// even if the member is later removed).
type SettlementSnapshot struct {
	FromMemberID   string `json:"from_member_id"`
	FromMemberName string `json:"from_member_name"`
	ToMemberID     string `json:"to_member_id"`
	ToMemberName   string `json:"to_member_name"`
	Amount         int64  `json:"amount"`
	Currency       string `json:"currency"`
}

// GroupSnapshot captures the minimum needed to describe a group activity
// row. For `group_updated` only the changed fields are populated.
type GroupSnapshot struct {
	Name string `json:"name,omitempty"`
	// Changed lists the keys whose values are present in this snapshot
	// because they were changed by the actor (only used by `group_updated`).
	Changed []string `json:"changed,omitempty"`
	// Old values for the changed fields (optional, for richer UI copy).
	OldName     string `json:"old_name,omitempty"`
	Currency    string `json:"currency,omitempty"`
	OldCurrency string `json:"old_currency,omitempty"`
	Language    string `json:"language,omitempty"`
	OldLanguage string `json:"old_language,omitempty"`
}

// MemberSnapshot captures the minimum needed to describe a member activity
// row.
type MemberSnapshot struct {
	MemberID    string `json:"member_id"`
	DisplayName string `json:"display_name"`
}

// writeActivity inserts an activity row. `payload` is optional; pass nil
// when no snapshot is meaningful for the event (e.g. invite link rotated).
//
// The caller is expected to pass a transactional `q` so the activity write
// happens atomically with the underlying mutation.
func writeActivity(
	ctx context.Context,
	q *db.Queries,
	groupID, actorID, eventType, entityID, entityType string,
	payload *ActivityPayload,
) error {
	var raw []byte
	if payload != nil {
		// Ensure entity_type is always set in the envelope, defaulting to
		// the entityType arg so callers don't have to repeat themselves.
		if payload.EntityType == "" {
			payload.EntityType = entityType
		}
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		raw = b
	}

	entityIDCol := pgtype.Text{}
	if entityID != "" {
		entityIDCol = pgtype.Text{String: entityID, Valid: true}
	}
	entityTypeCol := pgtype.Text{}
	if entityType != "" {
		entityTypeCol = pgtype.Text{String: entityType, Valid: true}
	}

	_, err := q.CreateActivity(ctx, db.CreateActivityParams{
		ID:         ulid.New(),
		GroupID:    groupID,
		ActorID:    actorID,
		EventType:  eventType,
		EntityID:   entityIDCol,
		EntityType: entityTypeCol,
		Payload:    raw,
	})
	return err
}
