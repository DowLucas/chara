package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/fx"
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
	ID               string     `json:"id"`
	GroupID          string     `json:"group_id"`
	FromMemberID     string     `json:"from_member_id"`
	ToMemberID       string     `json:"to_member_id"`
	Amount           string     `json:"amount"`
	Currency         string     `json:"currency"`
	Note             *string    `json:"note,omitempty"`
	Method           string     `json:"method"`
	CreatedByID      string     `json:"created_by_id"`
	CreatedAt        time.Time  `json:"created_at"`
	RevertedAt       *time.Time `json:"reverted_at,omitempty"`
	// FX snapshot — populated only when the user paid in a currency other
	// than the canonical balance currency. Mirrors the expense FX
	// snapshot (see migration 000016/000020 + the home-currency
	// aggregation design). All four are present or all four are absent.
	OriginalAmount   *string `json:"original_amount,omitempty"`
	OriginalCurrency *string `json:"original_currency,omitempty"`
	FxRate           *string `json:"fx_rate,omitempty"`
	FxAsOf           *string `json:"fx_as_of,omitempty"`
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
	if s.OriginalAmount.Valid {
		v := money.Amount(s.OriginalAmount.Int64).String()
		r.OriginalAmount = &v
	}
	if s.OriginalCurrency.Valid {
		v := s.OriginalCurrency.String
		r.OriginalCurrency = &v
	}
	if s.FxRate.Valid {
		// 8 fractional digits matches the expense response — enough for
		// ECB precision without trailing zeros all the way to (20,10).
		if f, err := s.FxRate.Float64Value(); err == nil {
			v := strconv.FormatFloat(f.Float64, 'f', 8, 64)
			r.FxRate = &v
		}
	}
	if s.FxAsOf.Valid {
		v := s.FxAsOf.Time.Format("2006-01-02")
		r.FxAsOf = &v
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
	// Optional FX snapshot — set when the user paid in a currency other
	// than the canonical settlement currency. All-or-none; partial input
	// is rejected. See migration 000020 for the matching DB CHECK.
	OriginalAmount   *money.Amount `json:"original_amount"`
	OriginalCurrency *string       `json:"original_currency"`
	FxRate           *string       `json:"fx_rate"`
	FxAsOf           *string       `json:"fx_as_of"`
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

// parseSettlementFx validates the all-or-none FX snapshot on a settlement
// request and converts the four user-supplied strings into the pgtype values
// the sqlc-generated CreateSettlement signature wants. Returns zero values
// when the request omits the snapshot entirely (the common same-currency
// case). Returns an error on partial input or unparseable values — the DB
// CHECK is the backstop, not the primary validator.
func parseSettlementFx(req settleReq) (pgtype.Int8, pgtype.Text, pgtype.Numeric, pgtype.Date, error) {
	present := func(b bool) int {
		if b {
			return 1
		}
		return 0
	}
	count := present(req.OriginalAmount != nil) +
		present(req.OriginalCurrency != nil) +
		present(req.FxRate != nil) +
		present(req.FxAsOf != nil)
	if count == 0 {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{}, nil
	}
	if count != 4 {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{},
			errors.New("fx snapshot requires all of original_amount, original_currency, fx_rate, fx_as_of (or none)")
	}
	if *req.OriginalAmount <= 0 {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{},
			errors.New("original_amount must be positive")
	}
	if *req.OriginalCurrency == "" {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{},
			errors.New("original_currency is required when fx snapshot is set")
	}
	var n pgtype.Numeric
	if err := n.Scan(*req.FxRate); err != nil {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{},
			errors.New("fx_rate is not a valid decimal")
	}
	t, err := time.Parse("2006-01-02", *req.FxAsOf)
	if err != nil {
		return pgtype.Int8{}, pgtype.Text{}, pgtype.Numeric{}, pgtype.Date{},
			errors.New("fx_as_of must be YYYY-MM-DD")
	}
	return pgtype.Int8{Int64: int64(*req.OriginalAmount), Valid: true},
		pgtype.Text{String: *req.OriginalCurrency, Valid: true},
		n,
		pgtype.Date{Time: t, Valid: true},
		nil
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

	if err := requireGroupUnlocked(r.Context(), h.queries, groupID); err != nil {
		if errors.Is(err, ErrGroupLocked) {
			writeLockedError(w)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
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

	// FX snapshot is all-or-none. Reject any partial input here so the
	// DB CHECK constraint never has to. Mirrors the expense FX shape.
	fxOriginalAmount, fxOriginalCurrency, fxRate, fxAsOf, fxErr := parseSettlementFx(req)
	if fxErr != nil {
		writeError(w, http.StatusBadRequest, fxErr.Error())
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
		ID:               ulid.New(),
		GroupID:          groupID,
		FromMember:       req.FromMemberID,
		ToMember:         req.ToMemberID,
		Amount:           int64(req.Amount),
		Currency:         req.Currency,
		Note:             note,
		Method:           method,
		CreatedByID:      claims.UserID,
		OriginalAmount:   fxOriginalAmount,
		OriginalCurrency: fxOriginalCurrency,
		FxRate:           fxRate,
		FxAsOf:           fxAsOf,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create settlement")
		return
	}

	fromM, _ := q.GetGroupMember(r.Context(), settlement.FromMember)
	toM, _ := q.GetGroupMember(r.Context(), settlement.ToMember)
	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		EventSettlementAdded, settlement.ID, EntitySettlement,
		&ActivityPayload{Snapshot: SettlementSnapshot{
			FromMemberID:   settlement.FromMember,
			FromMemberName: fromM.Name,
			ToMemberID:     settlement.ToMember,
			ToMemberName:   toM.Name,
			Amount:         settlement.Amount,
			Currency:       settlement.Currency,
		}}); err != nil {
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

// ── /api/me/net?in=<currency> ─────────────────────────────────────────────────

type MyNetResponse struct {
	HomeCurrency        string `json:"home_currency"`
	NetMinor            string `json:"net_minor"`
	TotalLegs           int    `json:"total_legs"`
	ConvertedLegs       int    `json:"converted_legs"`
	EstimatedLegs       int    `json:"estimated_legs"`
	ContributingGroups  int    `json:"contributing_groups"`
}

var iso4217 = regexp.MustCompile(`^[A-Z]{3}$`)

// MyNet aggregates every expense + settlement leg the user contributes to,
// across every group, into a single signed scalar in `in=<home_currency>`.
//
// Each leg is converted at ECB rates **as of the leg's own date** — never
// today's rate. The per-expense `fx_rate` already locked in the
// original→group conversion at write time, so summing the leg's canonical
// amount × ECB(group→home, leg_date) honors both manually-set per-expense
// rates and the historical-lock-in invariant.
//
// Legs whose ECB rate isn't available (a currency the server has no
// historical row for) are counted as `estimated_legs` and excluded from
// `net_minor` — the asterisk in the UI surfaces this. Currencies with no
// rate at all are silently estimated; we don't fail the whole request on
// one missing pair.
//
// Spec: docs/superpowers/specs/2026-05-24-home-currency-aggregation-design.md
func (h *BalancesHandler) MyNet(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	home := r.URL.Query().Get("in")
	if home == "" {
		writeError(w, http.StatusBadRequest, "in query param is required")
		return
	}
	if !iso4217.MatchString(home) {
		writeError(w, http.StatusBadRequest, "in must be a 3-letter ISO 4217 code")
		return
	}

	legs, err := h.queries.ListUserLedgerLegs(r.Context(),
		pgtype.Text{String: claims.UserID, Valid: true},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var (
		netMinor      int64
		convertedLegs int
		estimatedLegs int
		groupIDs      = make(map[string]struct{}, 8)
	)
	for _, leg := range legs {
		if leg.SignedMinor == 0 {
			// Zero contribution: counts toward "converted" so the UI doesn't
			// flag it as estimated, but skip the FX round-trip.
			convertedLegs++
			groupIDs[leg.GroupID] = struct{}{}
			continue
		}
		conv, err := fx.Convert(
			r.Context(), h.queries,
			leg.SignedMinor, leg.Currency, home,
			leg.OccurredAt.Time,
		)
		if err != nil {
			if errors.Is(err, fx.ErrRateUnavailable) {
				estimatedLegs++
				continue
			}
			writeError(w, http.StatusInternalServerError, "fx conversion failed")
			return
		}
		netMinor += conv.AmountMinor
		convertedLegs++
		groupIDs[leg.GroupID] = struct{}{}
	}

	writeJSON(w, http.StatusOK, MyNetResponse{
		HomeCurrency:       home,
		NetMinor:           money.Amount(netMinor).String(),
		TotalLegs:          len(legs),
		ConvertedLegs:      convertedLegs,
		EstimatedLegs:      estimatedLegs,
		ContributingGroups: len(groupIDs),
	})
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

	if err := requireGroupUnlocked(r.Context(), h.queries, groupID); err != nil {
		if errors.Is(err, ErrGroupLocked) {
			writeLockedError(w)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
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

	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		EventSettlementReverted, settlementID, EntitySettlement,
		&ActivityPayload{Snapshot: SettlementSnapshot{
			FromMemberID:   settlement.FromMember,
			FromMemberName: fromM.Name,
			ToMemberID:     settlement.ToMember,
			ToMemberName:   toM.Name,
			Amount:         settlement.Amount,
			Currency:       settlement.Currency,
		}}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
