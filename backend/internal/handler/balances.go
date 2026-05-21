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

	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/middleware"
	"github.com/DowLucas/quits/internal/money"
	"github.com/DowLucas/quits/internal/settle"
	"github.com/DowLucas/quits/internal/ulid"
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
	ID           string    `json:"id"`
	GroupID      string    `json:"group_id"`
	FromMemberID string    `json:"from_member_id"`
	ToMemberID   string    `json:"to_member_id"`
	Amount       string    `json:"amount"`
	Currency     string    `json:"currency"`
	Note         *string   `json:"note,omitempty"`
	CreatedByID  string    `json:"created_by_id"`
	CreatedAt    time.Time `json:"created_at"`
}

// ── Request types ─────────────────────────────────────────────────────────────

type settleReq struct {
	FromMemberID string       `json:"from_member_id"`
	ToMemberID   string       `json:"to_member_id"`
	Amount       money.Amount `json:"amount"`
	Currency     string       `json:"currency"`
	Note         *string      `json:"note"`
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

func (h *BalancesHandler) validateMemberInGroup(r *http.Request, memberID, groupID string) error {
	member, err := h.queries.GetGroupMember(r.Context(), memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("member not found")
		}
		return err
	}
	if member.GroupID != groupID {
		return errors.New("member does not belong to this group")
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

	settlement, err := h.queries.CreateSettlement(r.Context(), db.CreateSettlementParams{
		ID:          ulid.New(),
		GroupID:     groupID,
		FromMember:  req.FromMemberID,
		ToMember:    req.ToMemberID,
		Amount:      int64(req.Amount),
		Currency:    req.Currency,
		Note:        note,
		CreatedByID: claims.UserID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create settlement")
		return
	}

	// Activity feed entry. Best-effort: log on failure but don't break the
	// settle response (the settlement itself succeeded).
	if err := writeActivity(r.Context(), h.queries, groupID, claims.UserID, "settlement_added", settlement.ID, "settlement"); err != nil {
		// non-fatal
		_ = err
	}

	resp := SettlementResponse{
		ID:           settlement.ID,
		GroupID:      settlement.GroupID,
		FromMemberID: settlement.FromMember,
		ToMemberID:   settlement.ToMember,
		Amount:       money.Amount(settlement.Amount).String(),
		Currency:     settlement.Currency,
		CreatedByID:  settlement.CreatedByID,
		CreatedAt:    settlement.CreatedAt.Time,
	}
	if settlement.Note.Valid {
		resp.Note = &settlement.Note.String
	}

	writeJSON(w, http.StatusCreated, resp)
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
