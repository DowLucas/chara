package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
)

// ── Stats ─────────────────────────────────────────────────────────────────────

type GroupStatsTopSpenderResponse struct {
	MemberID       string  `json:"member_id"`
	UserID         *string `json:"user_id,omitempty"`
	DisplayName    string  `json:"display_name"`
	MinorUnitsPaid int64   `json:"minor_units_paid"`
	Currency       string  `json:"currency"`
}

type GroupStatsTotalResponse struct {
	Currency   string `json:"currency"`
	MinorUnits int64  `json:"minor_units"`
}

type GroupStatsResponse struct {
	MemberCount       int64                         `json:"member_count"`
	ExpenseCount      int64                         `json:"expense_count"`
	TotalsByCurrency  []GroupStatsTotalResponse     `json:"totals_by_currency"`
	TopSpender        *GroupStatsTopSpenderResponse `json:"top_spender"`
	CreatedAt         time.Time                     `json:"created_at"`
	FirstExpenseAt    *string                       `json:"first_expense_at"`
	LastExpenseAt     *string                       `json:"last_expense_at"`
}

// Stats returns aggregate figures about a group. Member-only read endpoint —
// any member can hit it (matches the rule that statistics are part of the
// shared view of the group). Live SQL per request; no caching.
func (h *GroupHandler) Stats(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	group, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	stats, err := h.queries.GroupStats(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	totals, err := h.queries.GroupStatsTotalsByCurrency(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	totalsResp := make([]GroupStatsTotalResponse, len(totals))
	for i, t := range totals {
		totalsResp[i] = GroupStatsTotalResponse{Currency: t.Currency, MinorUnits: t.TotalMinorUnits}
	}

	// Top spender is computed in the group base currency only — mirroring
	// the design choice that the spec calls out: a single "top spender"
	// row, not one per currency. When there are zero qualifying expenses,
	// we return null rather than a zero-amount row.
	var topSpender *GroupStatsTopSpenderResponse
	if stats.ExpenseCount > 0 {
		top, err := h.queries.GroupStatsTopSpender(r.Context(), db.GroupStatsTopSpenderParams{
			GroupID:  groupID,
			Currency: group.Currency,
		})
		if err == nil {
			ts := GroupStatsTopSpenderResponse{
				MemberID:       top.MemberID,
				DisplayName:    top.DisplayName,
				MinorUnitsPaid: top.MinorUnitsPaid,
				Currency:       top.Currency,
			}
			if top.UserID.Valid {
				ts.UserID = &top.UserID.String
			}
			topSpender = &ts
		} else if !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	resp := GroupStatsResponse{
		MemberCount:      stats.MemberCount,
		ExpenseCount:     stats.ExpenseCount,
		TotalsByCurrency: totalsResp,
		TopSpender:       topSpender,
		CreatedAt:        stats.CreatedAt.Time,
	}
	if stats.FirstExpenseAt.Valid {
		d := stats.FirstExpenseAt.Time.Format("2006-01-02")
		resp.FirstExpenseAt = &d
	}
	if stats.LastExpenseAt.Valid {
		d := stats.LastExpenseAt.Time.Format("2006-01-02")
		resp.LastExpenseAt = &d
	}

	writeJSON(w, http.StatusOK, resp)
}

// ── Lock / Unlock ─────────────────────────────────────────────────────────────

func (h *GroupHandler) Lock(w http.ResponseWriter, r *http.Request)   { h.setLocked(w, r, true) }
func (h *GroupHandler) Unlock(w http.ResponseWriter, r *http.Request) { h.setLocked(w, r, false) }

// setLocked is the shared implementation. Idempotent — when the group is
// already in the requested state we skip the activity row (no spam in the
// feed for no-op transitions) but still return the current group JSON so
// the client can treat both lock and unlock buttons as fire-and-update.
func (h *GroupHandler) setLocked(w http.ResponseWriter, r *http.Request, locked bool) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can change the lock state")
		return
	}

	current, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	if current.IsLocked == locked {
		// No-op — return the current state. Skip activity row so the feed
		// stays a record of actual state changes, not button presses.
		writeJSON(w, http.StatusOK, groupToResponse(current, h.isCurrencyLocked(r.Context(), current.ID)))
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	updated, err := q.SetGroupLocked(r.Context(), db.SetGroupLockedParams{
		ID:       groupID,
		IsLocked: locked,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Lock cascade: any active recurring rules in this group pause with
	// reason "group_locked". Unlock does NOT auto-resume — owners opt in
	// via a separate "resume my locked rules" action so newly-locked
	// rules aren't silently restarted by a momentary unlock-relock.
	if locked {
		if err := q.PauseActiveRecurringExpensesByGroup(r.Context(),
			db.PauseActiveRecurringExpensesByGroupParams{
				GroupID:      groupID,
				PausedReason: pgtype.Text{String: "group_locked", Valid: true},
			}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	event := EventGroupLocked
	if !locked {
		event = EventGroupUnlocked
	}
	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		event, groupID, EntityGroup,
		&ActivityPayload{Snapshot: GroupSnapshot{Name: updated.Name}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, groupToResponse(updated, h.isCurrencyLocked(r.Context(), updated.ID)))
}

// ── Unarchive ─────────────────────────────────────────────────────────────────

// Unarchive flips is_archived back to FALSE. Owner-only. Bypasses lock so an
// owner can always recover an archived group regardless of lock state.
func (h *GroupHandler) Unarchive(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can unarchive the group")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	g, err := q.UpdateGroup(r.Context(), db.UpdateGroupParams{
		ID:         groupID,
		IsArchived: pgtype.Bool{Bool: false, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		EventGroupUnarchived, groupID, EntityGroup,
		&ActivityPayload{Snapshot: GroupSnapshot{Name: g.Name}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, groupToResponse(g, h.isCurrencyLocked(r.Context(), g.ID)))
}

// ── Permanent delete ──────────────────────────────────────────────────────────

type permanentDeleteReq struct {
	NameConfirmation string `json:"name_confirmation"`
}

// unsettledRowResponse is the JSON shape returned inside the 409
// group_has_unsettled_balances error body.
type unsettledRowResponse struct {
	MemberID   string `json:"member_id"`
	Currency   string `json:"currency"`
	MinorUnits int64  `json:"minor_units"`
}

// PermanentDelete hard-deletes a group and every row that references it.
// Two-step precondition: name confirmation, then balance check. The order
// matters — checking the name first protects the (potentially expensive)
// balance query behind a clear "yes, I really mean this group" signal.
//
// Lock state is bypassed: a locked group can be deleted directly. The
// destructive action is the unlock, not the financial mutation.
func (h *GroupHandler) PermanentDelete(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	_ = middleware.ClaimsFromContext(r.Context())

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can delete the group")
		return
	}

	var req permanentDeleteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	group, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	// Gate (1): exact name match. Case-sensitive — matches the spec, and
	// case-folding would silently accept "MyTrip" vs "mytrip" which is
	// the kind of "I thought I was deleting the other one" footgun this
	// gate exists to prevent.
	if req.NameConfirmation != group.Name {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"code":  "name_mismatch",
			"error": "name_confirmation does not match the group name",
		})
		return
	}

	// Gate (2): every member balance must be zero. Owner balance counted.
	openRows, err := h.queries.ListMemberBalancesByGroup(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if len(openRows) > 0 {
		rows := make([]unsettledRowResponse, len(openRows))
		for i, r := range openRows {
			rows[i] = unsettledRowResponse{
				MemberID:   r.MemberID,
				Currency:   r.Currency.String,
				MinorUnits: r.NetBalance,
			}
		}
		writeJSON(w, http.StatusConflict, map[string]any{
			"code":  "group_has_unsettled_balances",
			"rows":  rows,
			"error": "every member balance must be zero before deleting the group",
		})
		return
	}

	// Snapshot attachment S3 keys before the tx so we can sweep the bucket
	// after commit. Doing this read outside the tx is safe — the rows
	// either get cascade-deleted (and we sweep their keys, success) or the
	// tx rolls back (and we never sweep, also success).
	var attachmentKeys []string
	if h.store != nil {
		keys, err := listAllAttachmentKeysForGroup(r.Context(), h.queries, groupID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		attachmentKeys = keys
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	// Cascade FKs handle the rest. We intentionally do NOT write a final
	// activity row — it would be cascaded out moments later and is
	// unrecoverable by design.
	if err := q.HardDeleteGroup(r.Context(), groupID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Best-effort bucket sweep. Failures are logged, never failing the
	// request — the rows are already gone from the user's view, and the
	// orphaned bucket objects can be reaped by a future cleanup job.
	if h.store != nil {
		for _, key := range attachmentKeys {
			if err := h.store.Delete(context.Background(), key); err != nil {
				slog.Warn("group permanent-delete bucket sweep failed", "key", key, "err", err)
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// listAllAttachmentKeysForGroup walks every expense in the group and gathers
// their attachment S3 keys. Cheap enough at the scale a single group will
// reach to do as separate per-expense queries; the alternative is a join
// query that adds another sqlc binding for one cold-path call site.
func listAllAttachmentKeysForGroup(ctx context.Context, q *db.Queries, groupID string) ([]string, error) {
	// Pull a generous page of expenses — a group with more than 10k
	// expenses is well outside MVP. The list query already filters
	// soft-deleted rows; for permanent-delete we also need to sweep
	// attachments hanging off soft-deleted-but-still-rowed expenses,
	// so we don't filter on is_deleted here at the query level — we
	// just pull every expense row.
	expenses, err := q.ListExpensesByGroup(ctx, db.ListExpensesByGroupParams{
		GroupID: groupID,
		Limit:   10000,
		Offset:  0,
	})
	if err != nil {
		return nil, err
	}
	var keys []string
	for _, e := range expenses {
		atts, err := q.ListAttachmentsByExpense(ctx, e.ID)
		if err != nil {
			return nil, err
		}
		for _, a := range atts {
			keys = append(keys, a.S3Key)
		}
	}
	return keys, nil
}

// ── Member removal (leave / kick) ─────────────────────────────────────────────

// memberOpenBalanceRow is the JSON shape returned inside the 409
// member_has_open_balance error body.
type memberOpenBalanceRow struct {
	Currency   string `json:"currency"`
	MinorUnits int64  `json:"minor_units"`
}

// RemoveMember is a single endpoint with dual semantics:
//   - When the caller is the target → "leave".
//   - When the caller is the owner and target ≠ caller → "kick".
//
// Allowed on locked groups (the zero-balance precondition is the real
// guard; locking is about freezing the financial picture, not the
// membership).
func (h *GroupHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	memberID := chi.URLParam(r, "memberID")
	claims := middleware.ClaimsFromContext(r.Context())

	caller, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}

	target, err := h.queries.GetGroupMember(r.Context(), memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "member not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if target.GroupID != groupID {
		// Don't leak whether the member exists in some other group.
		writeError(w, http.StatusNotFound, "member not found")
		return
	}

	isSelf := caller.ID == target.ID
	if isSelf {
		if target.Role == "owner" {
			writeJSON(w, http.StatusConflict, map[string]string{
				"code":  "owner_cannot_leave",
				"error": "the owner cannot leave their own group",
			})
			return
		}
	} else {
		if caller.Role != "owner" {
			writeError(w, http.StatusForbidden, "only the group owner can remove other members")
			return
		}
		if target.Role == "owner" {
			writeJSON(w, http.StatusConflict, map[string]string{
				"code":  "owner_cannot_be_kicked",
				"error": "the owner cannot be removed from the group",
			})
			return
		}
	}

	// Zero-balance precondition. Applies to both branches.
	open, err := h.queries.ListMemberOpenBalances(r.Context(), db.ListMemberOpenBalancesParams{
		GroupID:  groupID,
		MemberID: target.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if len(open) > 0 {
		rows := make([]memberOpenBalanceRow, len(open))
		for i, o := range open {
			rows[i] = memberOpenBalanceRow{
				Currency:   o.Currency.String,
				MinorUnits: o.NetBalance,
			}
		}
		writeJSON(w, http.StatusConflict, map[string]any{
			"code":  "member_has_open_balance",
			"rows":  rows,
			"error": "member has a non-zero balance in this group",
		})
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	// Pause any active recurring rules that reference the departing
	// member as payer or splittee. Must run BEFORE DeleteGroupMember:
	// the recurring_expense_splits FK has ON DELETE CASCADE, so once the
	// member row is gone the EXISTS subquery would no longer match. We
	// discard the returned rows here — Wave B will pick them up to fan
	// out push notifications to each rule's creator.
	if _, err := q.PauseRecurringExpensesAffectedByMember(r.Context(),
		db.PauseRecurringExpensesAffectedByMemberParams{
			GroupID:  groupID,
			MemberID: target.ID,
		}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := q.DeleteGroupMember(r.Context(), target.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	event := EventMemberKicked
	if isSelf {
		event = EventMemberLeft
	}
	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		event, target.ID, EntityMember,
		&ActivityPayload{Snapshot: MemberSnapshot{
			MemberID:    target.ID,
			DisplayName: target.Name,
		}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ── Can-leave probe ───────────────────────────────────────────────────────────

type canLeaveReason struct {
	Code string                 `json:"code"`
	Rows []memberOpenBalanceRow `json:"rows,omitempty"`
}

type canLeaveResponse struct {
	OK      bool             `json:"ok"`
	Reasons []canLeaveReason `json:"reasons"`
}

// CanLeave is a read-only probe so the UI can pre-disable the Leave button
// with a clear reason without first attempting the destructive call. It
// reports the same blocking conditions as RemoveMember (owner-can't-leave,
// non-zero balance) but never mutates.
//
// Open to any member of the group, mirroring the visibility of
// member_balances itself.
func (h *GroupHandler) CanLeave(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	memberID := chi.URLParam(r, "memberID")

	caller, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	_ = caller

	target, err := h.queries.GetGroupMember(r.Context(), memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "member not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if target.GroupID != groupID {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}

	var reasons []canLeaveReason
	if target.Role == "owner" {
		reasons = append(reasons, canLeaveReason{Code: "owner_cannot_leave"})
	}

	open, err := h.queries.ListMemberOpenBalances(r.Context(), db.ListMemberOpenBalancesParams{
		GroupID:  groupID,
		MemberID: target.ID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if len(open) > 0 {
		rows := make([]memberOpenBalanceRow, len(open))
		for i, o := range open {
			rows[i] = memberOpenBalanceRow{
				Currency:   o.Currency.String,
				MinorUnits: o.NetBalance,
			}
		}
		reasons = append(reasons, canLeaveReason{Code: "member_has_open_balance", Rows: rows})
	}

	writeJSON(w, http.StatusOK, canLeaveResponse{
		OK:      len(reasons) == 0,
		Reasons: append([]canLeaveReason{}, reasons...),
	})
}

