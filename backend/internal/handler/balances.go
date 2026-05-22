package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/settle"
	"github.com/DowLucas/chara/internal/ulid"
)

type BalancesHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
}

func NewBalancesHandler(pool *pgxpool.Pool, queries *db.Queries) *BalancesHandler {
	return &BalancesHandler{queries: queries, pool: pool}
}

// ── Response types ────────────────────────────────────────────────────────────

type BalanceResponse struct {
	MemberID   string  `json:"member_id"`
	UserID     *string `json:"user_id,omitempty"`
	Name       string  `json:"name"`
	Currency   string  `json:"currency"`
	NetBalance string  `json:"net_balance"`
}

type MyBalanceResponse struct {
	GroupID    string `json:"group_id"`
	GroupName  string `json:"group_name"`
	MemberID   string `json:"member_id"`
	Currency   string `json:"currency"`
	NetBalance string `json:"net_balance"`
}

type SettlementSuggestion struct {
	FromMemberID string `json:"from_member_id"`
	ToMemberID   string `json:"to_member_id"`
	Amount       string `json:"amount"`
	Currency     string `json:"currency"`
}

type SettlementResponse struct {
	ID           string     `json:"id"`
	GroupID      string     `json:"group_id"`
	FromMemberID string     `json:"from_member_id"`
	ToMemberID   string     `json:"to_member_id"`
	Amount       string     `json:"amount"`
	Currency     string     `json:"currency"`
	Note         *string    `json:"note,omitempty"`
	Method       string     `json:"method"`
	CreatedByID  string     `json:"created_by_id"`
	CreatedAt    time.Time  `json:"created_at"`
	RevertedAt   *time.Time `json:"reverted_at,omitempty"`
}

func settlementToResponse(s db.Settlement) SettlementResponse {
	r := SettlementResponse{
		ID:           s.ID,
		GroupID:      s.GroupID,
		FromMemberID: s.FromMember,
		ToMemberID:   s.ToMember,
		Amount:       money.Amount(s.Amount).String(),
		Currency:     s.Currency,
		Method:       s.Method,
		CreatedByID:  s.CreatedByID,
		CreatedAt:    s.CreatedAt.Time,
	}
	if s.Note.Valid {
		r.Note = &s.Note.String
	}
	if s.RevertedAt.Valid {
		t := s.RevertedAt.Time
		r.RevertedAt = &t
	}
	return r
}

// ── Request types ─────────────────────────────────────────────────────────────

type settleReq struct {
	FromMemberID string       `json:"from_member_id"`
	ToMemberID   string       `json:"to_member_id"`
	Amount       money.Amount `json:"amount"`
	Currency     string       `json:"currency"`
	Note         *string      `json:"note"`
	Method       *string      `json:"method"`
}

// validSettlementMethods mirrors the CHECK constraint in migration 000013.
var validSettlementMethods = map[string]struct{}{
	"manual":    {},
	"swish":     {},
	"vipps":     {},
	"mobilepay": {},
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (h *BalancesHandler) requireMember(w http.ResponseWriter, r *http.Request, groupID string) (db.GroupMember, bool) {
	claims := middleware.ClaimsFromContext(r.Context())
	member, err := h.queries.GetGroupMemberByUserAndGroup(r.Context(), db.GetGroupMemberByUserAndGroupParams{
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

// validateMemberInGroup returns a deliberately generic error for both
// "member doesn't exist" and "member belongs to another group" so callers
// can't probe member existence by diffing error strings.
func (h *BalancesHandler) validateMemberInGroup(r *http.Request, memberID, groupID string) error {
	member, err := h.queries.GetGroupMember(r.Context(), memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("member not in group")
		}
		return err
	}
	if member.GroupID != groupID {
		return errors.New("member not in group")
	}
	return nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *BalancesHandler) ListGroupBalances(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	balances, err := h.queries.ListGroupBalances(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	members, err := h.queries.ListGroupMembers(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	nameByMemberID := make(map[string]string, len(members))
	for _, m := range members {
		nameByMemberID[m.ID] = m.Name
	}

	resp := make([]BalanceResponse, 0, len(balances))
	for _, b := range balances {
		br := BalanceResponse{
			MemberID:   b.MemberID,
			Name:       nameByMemberID[b.MemberID],
			Currency:   b.Currency.String,
			NetBalance: money.Amount(b.NetBalance).String(),
		}
		if b.UserID.Valid {
			br.UserID = &b.UserID.String
		}
		resp = append(resp, br)
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *BalancesHandler) Settle(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	var req settleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.FromMemberID == "" || req.ToMemberID == "" {
		writeError(w, http.StatusBadRequest, "from_member_id and to_member_id are required")
		return
	}
	if req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if req.Currency == "" {
		writeError(w, http.StatusBadRequest, "currency is required")
		return
	}

	if err := h.validateMemberInGroup(r, req.FromMemberID, groupID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.validateMemberInGroup(r, req.ToMemberID, groupID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	note := pgtype.Text{}
	if req.Note != nil {
		note = pgtype.Text{String: *req.Note, Valid: true}
	}

	method := "manual"
	if req.Method != nil {
		method = *req.Method
	}
	if _, ok := validSettlementMethods[method]; !ok {
		writeError(w, http.StatusBadRequest, "invalid settlement method")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(r.Context())
	q := db.New(tx)

	settlement, err := q.CreateSettlement(r.Context(), db.CreateSettlementParams{
		ID:          ulid.New(),
		GroupID:     groupID,
		FromMember:  req.FromMemberID,
		ToMember:    req.ToMemberID,
		Amount:      int64(req.Amount),
		Currency:    req.Currency,
		Note:        note,
		Method:      method,
		CreatedByID: claims.UserID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create settlement")
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID, "settlement_added", settlement.ID, "settlement"); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, settlementToResponse(settlement))
}

// ListSettlements returns every settlement (including soft-reverted ones) for
// the group, newest first. Reverted rows are kept in the response so the UI
// can show the historical record with a strike-through — they just don't
// affect balances (the member_balances view filters reverted_at IS NULL).
func (h *BalancesHandler) ListSettlements(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	rows, err := h.queries.ListSettlementsByGroup(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list settlements")
		return
	}

	resp := make([]SettlementResponse, len(rows))
	for i, s := range rows {
		resp[i] = settlementToResponse(s)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *BalancesHandler) SuggestSettlements(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	balances, err := h.queries.ListGroupBalances(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	input := make([]settle.Balance, 0, len(balances))
	for _, b := range balances {
		input = append(input, settle.Balance{
			MemberID: b.MemberID,
			Currency: b.Currency.String,
			Amount:   b.NetBalance,
		})
	}

	transfers := settle.Suggest(input)

	resp := make([]SettlementSuggestion, 0, len(transfers))
	for _, t := range transfers {
		resp = append(resp, SettlementSuggestion{
			FromMemberID: t.FromMemberID,
			ToMemberID:   t.ToMemberID,
			Amount:       money.Amount(t.Amount).String(),
			Currency:     t.Currency,
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *BalancesHandler) ListMyBalances(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	balances, err := h.queries.ListUserBalancesAcrossGroups(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Build group name lookup
	groups, err := h.queries.ListGroupsByUserID(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	groupNameByID := make(map[string]string, len(groups))
	for _, g := range groups {
		groupNameByID[g.ID] = g.Name
	}

	resp := make([]MyBalanceResponse, 0, len(balances))
	for _, b := range balances {
		resp = append(resp, MyBalanceResponse{
			GroupID:    b.GroupID,
			GroupName:  groupNameByID[b.GroupID],
			MemberID:   b.MemberID,
			Currency:   b.Currency.String,
			NetBalance: money.Amount(b.NetBalance).String(),
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

// RevertSettlement soft-reverts a settlement (sets reverted_at). Allowed by
// either party (from_member's user or to_member's user) within 24h of creation.
func (h *BalancesHandler) RevertSettlement(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	settlementID := chi.URLParam(r, "settlementID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}

	settlement, err := h.queries.GetSettlement(r.Context(), settlementID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "settlement not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if settlement.GroupID != groupID {
		writeError(w, http.StatusNotFound, "settlement not found")
		return
	}

	// Authorize: caller must be the user behind from_member or to_member.
	fromM, err := h.queries.GetGroupMember(r.Context(), settlement.FromMember)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	toM, err := h.queries.GetGroupMember(r.Context(), settlement.ToMember)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	isFrom := fromM.UserID.Valid && fromM.UserID.String == claims.UserID
	isTo := toM.UserID.Valid && toM.UserID.String == claims.UserID
	if !isFrom && !isTo {
		writeError(w, http.StatusForbidden, "only the payer or payee can revert this settlement")
		return
	}

	// Time-gate / already-reverted check via the update query.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(r.Context())
	q := db.New(tx)

	if _, err := q.MarkSettlementReverted(r.Context(), settlementID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either already reverted or older than 24h.
			writeError(w, http.StatusConflict, "settlement cannot be reverted (already reverted or older than 24h)")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID, "settlement_reverted", settlementID, "settlement"); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
