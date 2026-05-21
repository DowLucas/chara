package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/quits/internal/currency"
	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/fx"
	"github.com/DowLucas/quits/internal/middleware"
	"github.com/DowLucas/quits/internal/money"
	"github.com/DowLucas/quits/internal/split"
	"github.com/DowLucas/quits/internal/ulid"
)

type ExpenseHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
}

func NewExpenseHandler(pool *pgxpool.Pool, queries *db.Queries) *ExpenseHandler {
	return &ExpenseHandler{queries: queries, pool: pool}
}

// ── Response types ────────────────────────────────────────────────────────────

type SplitResponse struct {
	ID       string `json:"id"`
	MemberID string `json:"member_id"`
	Share    string `json:"share"`
}

type ExpenseResponse struct {
	ID               string          `json:"id"`
	GroupID          string          `json:"group_id"`
	Title            string          `json:"title"`
	Amount           string          `json:"amount"`
	Currency         string          `json:"currency"`
	PaidByID         string          `json:"paid_by_id"`
	SplitMethod      string          `json:"split_method"`
	Category         string          `json:"category"`
	Notes            *string         `json:"notes,omitempty"`
	ExpenseDate      *string         `json:"expense_date,omitempty"`
	IsReimbursement  bool            `json:"is_reimbursement"`
	CreatedByID      string          `json:"created_by_id"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
	Splits           []SplitResponse `json:"splits,omitempty"`
	OriginalAmount   *string         `json:"original_amount,omitempty"`
	OriginalCurrency *string         `json:"original_currency,omitempty"`
	FxRate           *string         `json:"fx_rate,omitempty"`
	FxAsOf           *string         `json:"fx_as_of,omitempty"`
}

func buildExpenseResponse(
	id, groupID, title string,
	amount int64, currency, paidByID, splitMethod, category string,
	notes pgtype.Text, expenseDate pgtype.Date,
	isReimbursement bool, createdByID string,
	createdAt, updatedAt pgtype.Timestamptz,
	splits []SplitResponse,
	originalAmount pgtype.Int8, originalCurrency pgtype.Text,
	fxRate pgtype.Numeric, fxAsOf pgtype.Date,
) ExpenseResponse {
	resp := ExpenseResponse{
		ID:              id,
		GroupID:         groupID,
		Title:           title,
		Amount:          money.Amount(amount).String(),
		Currency:        currency,
		PaidByID:        paidByID,
		SplitMethod:     splitMethod,
		Category:        category,
		IsReimbursement: isReimbursement,
		CreatedByID:     createdByID,
		CreatedAt:       createdAt.Time,
		UpdatedAt:       updatedAt.Time,
		Splits:          splits,
	}
	if notes.Valid {
		resp.Notes = &notes.String
	}
	if expenseDate.Valid {
		d := expenseDate.Time.Format("2006-01-02")
		resp.ExpenseDate = &d
	}
	if originalAmount.Valid {
		s := money.Amount(originalAmount.Int64).String()
		resp.OriginalAmount = &s
	}
	if originalCurrency.Valid {
		s := originalCurrency.String
		resp.OriginalCurrency = &s
	}
	if fxRate.Valid {
		// Render to 8 fractional digits which is enough for ECB precision
		// without showing trailing zeros all the way to NUMERIC(20,10).
		if f, err := fxRate.Float64Value(); err == nil {
			s := strconv.FormatFloat(f.Float64, 'f', 8, 64)
			resp.FxRate = &s
		}
	}
	if fxAsOf.Valid {
		d := fxAsOf.Time.Format("2006-01-02")
		resp.FxAsOf = &d
	}
	return resp
}

func dbSplitsToResponse(dbSplits []db.ExpenseSplit) []SplitResponse {
	out := make([]SplitResponse, len(dbSplits))
	for i, s := range dbSplits {
		out[i] = SplitResponse{
			ID:       s.ID,
			MemberID: s.MemberID,
			Share:    money.Amount(s.Share).String(),
		}
	}
	return out
}

// ── Request types ─────────────────────────────────────────────────────────────

type splitReqItem struct {
	MemberID    string        `json:"member_id"`
	Share       *money.Amount `json:"share"`
	BasisPoints *int          `json:"basis_points"`
}

type createExpenseReq struct {
	Title           string         `json:"title"`
	Amount          money.Amount   `json:"amount"`
	Currency        string         `json:"currency"`
	PaidByID        string         `json:"paid_by_id"`
	SplitMethod     string         `json:"split_method"`
	Category        string         `json:"category"`
	Notes           *string        `json:"notes"`
	ExpenseDate     *string        `json:"expense_date"`
	IsReimbursement bool           `json:"is_reimbursement"`
	Participants    []string       `json:"participants"`
	Splits          []splitReqItem `json:"splits"`
}

type updateExpenseReq struct {
	Title        *string        `json:"title"`
	Amount       *money.Amount  `json:"amount"`
	Currency     *string        `json:"currency"`
	PaidByID     *string        `json:"paid_by_id"`
	SplitMethod  *string        `json:"split_method"`
	Category     *string        `json:"category"`
	Notes        *string        `json:"notes"`
	Participants []string       `json:"participants"`
	Splits       []splitReqItem `json:"splits"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (h *ExpenseHandler) requireGroupMember(w http.ResponseWriter, r *http.Request, groupID string) (db.GroupMember, bool) {
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

func (h *ExpenseHandler) validatePaidByInGroup(ctx context.Context, memberID, groupID string) error {
	member, err := h.queries.GetGroupMember(ctx, memberID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("paid_by_id not found")
		}
		return err
	}
	if member.GroupID != groupID {
		return fmt.Errorf("paid_by_id does not belong to this group")
	}
	return nil
}

func computeSplits(total money.Amount, method string, participants []string, items []splitReqItem) ([]split.MemberShare, error) {
	switch method {
	case "equal":
		if len(participants) == 0 {
			return nil, fmt.Errorf("participants required for equal split")
		}
		return split.Equal(total, participants)
	case "exact":
		if len(items) == 0 {
			return nil, fmt.Errorf("splits required for exact split")
		}
		shares := make([]split.MemberShare, len(items))
		for i, s := range items {
			if s.Share == nil {
				return nil, fmt.Errorf("share required for exact split item")
			}
			shares[i] = split.MemberShare{MemberID: s.MemberID, Share: *s.Share}
		}
		return split.Exact(total, shares)
	case "percentage":
		if len(items) == 0 {
			return nil, fmt.Errorf("splits required for percentage split")
		}
		pcts := make([]split.MemberPct, len(items))
		for i, s := range items {
			if s.BasisPoints == nil {
				return nil, fmt.Errorf("basis_points required for percentage split item")
			}
			pcts[i] = split.MemberPct{MemberID: s.MemberID, BasisPoints: *s.BasisPoints}
		}
		return split.Percentage(total, pcts)
	default:
		return nil, fmt.Errorf("unknown split_method %q", method)
	}
}

func writeSplits(ctx context.Context, q *db.Queries, expenseID string, shares []split.MemberShare) ([]SplitResponse, error) {
	out := make([]SplitResponse, len(shares))
	for i, s := range shares {
		row, err := q.CreateExpenseSplit(ctx, db.CreateExpenseSplitParams{
			ID:        ulid.New(),
			ExpenseID: expenseID,
			MemberID:  s.MemberID,
			Share:     int64(s.Share),
		})
		if err != nil {
			return nil, err
		}
		out[i] = SplitResponse{
			ID:       row.ID,
			MemberID: row.MemberID,
			Share:    money.Amount(row.Share).String(),
		}
	}
	return out, nil
}

func writeActivity(ctx context.Context, q *db.Queries, groupID, actorID, eventType, entityID, entityType string) error {
	payload, _ := json.Marshal(map[string]string{"entity_id": entityID})
	_, err := q.CreateActivity(ctx, db.CreateActivityParams{
		ID:         ulid.New(),
		GroupID:    groupID,
		ActorID:    actorID,
		EventType:  eventType,
		EntityID:   pgtype.Text{String: entityID, Valid: true},
		EntityType: pgtype.Text{String: entityType, Valid: true},
		Payload:    payload,
	})
	return err
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *ExpenseHandler) Create(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := h.requireGroupMember(w, r, groupID); !ok {
		return
	}

	var req createExpenseReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if req.Currency == "" {
		req.Currency = "SEK"
	}
	normalized, ok := currency.Normalize(req.Currency)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown currency code")
		return
	}
	req.Currency = normalized
	if req.SplitMethod == "" {
		req.SplitMethod = "equal"
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if req.PaidByID == "" {
		writeError(w, http.StatusBadRequest, "paid_by_id is required")
		return
	}
	if err := h.validatePaidByInGroup(r.Context(), req.PaidByID, groupID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	shares, err := computeSplits(req.Amount, req.SplitMethod, req.Participants, req.Splits)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	expenseDate := pgtype.Date{Time: time.Now(), Valid: true}
	if req.ExpenseDate != nil {
		t, err := time.Parse("2006-01-02", *req.ExpenseDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid expense_date format, expected YYYY-MM-DD")
			return
		}
		expenseDate = pgtype.Date{Time: t, Valid: true}
	}

	// If the expense was paid in a currency other than the group's, convert
	// to the group currency now and stash the original-currency snapshot so
	// the expense detail can show both. Same-currency expenses skip this
	// entirely (the common case).
	canonicalAmount := int64(req.Amount)
	canonicalCurrency := req.Currency
	var fxOriginalAmount pgtype.Int8
	var fxOriginalCurrency pgtype.Text
	var fxRate pgtype.Numeric
	var fxAsOf pgtype.Date
	group, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load group")
		return
	}
	if req.Currency != group.Currency {
		conv, err := fx.Convert(r.Context(), h.queries, int64(req.Amount), req.Currency, group.Currency, expenseDate.Time)
		if err != nil {
			if errors.Is(err, fx.ErrRateUnavailable) {
				writeError(w, http.StatusServiceUnavailable, "fx rate unavailable for "+req.Currency+"→"+group.Currency)
				return
			}
			writeError(w, http.StatusInternalServerError, "fx conversion failed")
			return
		}
		canonicalAmount = conv.AmountMinor
		canonicalCurrency = group.Currency
		fxOriginalAmount = pgtype.Int8{Int64: int64(req.Amount), Valid: true}
		fxOriginalCurrency = pgtype.Text{String: req.Currency, Valid: true}
		var n pgtype.Numeric
		if err := n.Scan(conv.Rate.Text('f', 10)); err != nil {
			writeError(w, http.StatusInternalServerError, "encode fx rate")
			return
		}
		fxRate = n
		fxAsOf = pgtype.Date{Time: conv.AsOf, Valid: true}

		// Recompute splits using the converted amount so members owe the
		// group-currency value, not the original one.
		shares, err = computeSplits(money.Amount(canonicalAmount), req.SplitMethod, req.Participants, req.Splits)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)

	expense, err := q.CreateExpense(r.Context(), db.CreateExpenseParams{
		ID:               ulid.New(),
		GroupID:          groupID,
		Title:            req.Title,
		Amount:           canonicalAmount,
		Currency:         canonicalCurrency,
		PaidByID:         req.PaidByID,
		SplitMethod:      req.SplitMethod,
		Category:         req.Category,
		Notes:            pgtype.Text{Valid: req.Notes != nil, String: strOrEmpty(req.Notes)},
		ExpenseDate:      expenseDate,
		IsReimbursement:  req.IsReimbursement,
		CreatedByID:      claims.UserID,
		OriginalAmount:   fxOriginalAmount,
		OriginalCurrency: fxOriginalCurrency,
		FxRate:           fxRate,
		FxAsOf:           fxAsOf,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create expense")
		return
	}

	splitResp, err := writeSplits(r.Context(), q, expense.ID, shares)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create expense splits")
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID, "expense_added", expense.ID, "expense"); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := buildExpenseResponse(
		expense.ID, expense.GroupID, expense.Title, expense.Amount, expense.Currency,
		expense.PaidByID, expense.SplitMethod, expense.Category, expense.Notes, expense.ExpenseDate,
		expense.IsReimbursement, expense.CreatedByID, expense.CreatedAt, expense.UpdatedAt,
		splitResp,
		expense.OriginalAmount, expense.OriginalCurrency, expense.FxRate, expense.FxAsOf,
	)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *ExpenseHandler) List(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	if _, ok := h.requireGroupMember(w, r, groupID); !ok {
		return
	}

	limit := int32(50)
	offset := int32(0)
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 {
			limit = int32(n)
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n >= 0 {
			offset = int32(n)
		}
	}

	expenses, err := h.queries.ListExpensesByGroup(r.Context(), db.ListExpensesByGroupParams{
		GroupID: groupID,
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := make([]ExpenseResponse, len(expenses))
	for i, e := range expenses {
		resp[i] = buildExpenseResponse(
			e.ID, e.GroupID, e.Title, e.Amount, e.Currency,
			e.PaidByID, e.SplitMethod, e.Category, e.Notes, e.ExpenseDate,
			e.IsReimbursement, e.CreatedByID, e.CreatedAt, e.UpdatedAt,
			nil,
			e.OriginalAmount, e.OriginalCurrency, e.FxRate, e.FxAsOf,
		)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *ExpenseHandler) Get(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")

	if _, ok := h.requireGroupMember(w, r, groupID); !ok {
		return
	}

	expense, err := h.queries.GetExpenseByIDAndGroup(r.Context(), db.GetExpenseByIDAndGroupParams{
		ID:      expenseID,
		GroupID: groupID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	dbSplits, err := h.queries.ListSplitsByExpense(r.Context(), expenseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := buildExpenseResponse(
		expense.ID, expense.GroupID, expense.Title, expense.Amount, expense.Currency,
		expense.PaidByID, expense.SplitMethod, expense.Category, expense.Notes, expense.ExpenseDate,
		expense.IsReimbursement, expense.CreatedByID, expense.CreatedAt, expense.UpdatedAt,
		dbSplitsToResponse(dbSplits),
		expense.OriginalAmount, expense.OriginalCurrency, expense.FxRate, expense.FxAsOf,
	)
	writeJSON(w, http.StatusOK, resp)
}

func (h *ExpenseHandler) Update(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := h.requireGroupMember(w, r, groupID); !ok {
		return
	}

	existing, err := h.queries.GetExpenseByIDAndGroup(r.Context(), db.GetExpenseByIDAndGroupParams{
		ID:      expenseID,
		GroupID: groupID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	var req updateExpenseReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.PaidByID != nil {
		if err := h.validatePaidByInGroup(r.Context(), *req.PaidByID, groupID); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	params := db.UpdateExpenseParams{ID: expenseID}
	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.Amount != nil {
		if *req.Amount <= 0 {
			writeError(w, http.StatusBadRequest, "amount must be positive")
			return
		}
		params.Amount = pgtype.Int8{Int64: int64(*req.Amount), Valid: true}
	}
	if req.Currency != nil {
		normalized, ok := currency.Normalize(*req.Currency)
		if !ok {
			writeError(w, http.StatusBadRequest, "unknown currency code")
			return
		}
		params.Currency = pgtype.Text{String: normalized, Valid: true}
	}
	if req.PaidByID != nil {
		params.PaidByID = pgtype.Text{String: *req.PaidByID, Valid: true}
	}
	if req.SplitMethod != nil {
		params.SplitMethod = pgtype.Text{String: *req.SplitMethod, Valid: true}
	}
	if req.Category != nil {
		params.Category = pgtype.Text{String: *req.Category, Valid: true}
	}

	// Recalculate splits if needed
	needsSplitUpdate := len(req.Participants) > 0 || len(req.Splits) > 0

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)

	updated, err := q.UpdateExpense(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	var splitResp []SplitResponse
	if needsSplitUpdate {
		effectiveAmount := money.Amount(updated.Amount)
		effectiveMethod := updated.SplitMethod
		if req.SplitMethod != nil {
			effectiveMethod = *req.SplitMethod
		}

		shares, err := computeSplits(effectiveAmount, effectiveMethod, req.Participants, req.Splits)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		if err := q.DeleteSplitsByExpense(r.Context(), expenseID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		splitResp, err = writeSplits(r.Context(), q, expenseID, shares)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not create expense splits")
			return
		}
	} else {
		dbSplits, err := h.queries.ListSplitsByExpense(r.Context(), expenseID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		splitResp = dbSplitsToResponse(dbSplits)
		_ = existing
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID, "expense_updated", expenseID, "expense"); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := buildExpenseResponse(
		updated.ID, updated.GroupID, updated.Title, updated.Amount, updated.Currency,
		updated.PaidByID, updated.SplitMethod, updated.Category, updated.Notes, updated.ExpenseDate,
		updated.IsReimbursement, updated.CreatedByID, updated.CreatedAt, updated.UpdatedAt,
		splitResp,
		updated.OriginalAmount, updated.OriginalCurrency, updated.FxRate, updated.FxAsOf,
	)
	writeJSON(w, http.StatusOK, resp)
}

func (h *ExpenseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := h.requireGroupMember(w, r, groupID); !ok {
		return
	}

	_, err := h.queries.GetExpenseByIDAndGroup(r.Context(), db.GetExpenseByIDAndGroupParams{
		ID:      expenseID,
		GroupID: groupID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)

	if err := q.SoftDeleteExpense(r.Context(), expenseID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID, "expense_deleted", expenseID, "expense"); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func strOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
