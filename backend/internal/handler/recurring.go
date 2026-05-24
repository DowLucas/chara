package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/recurring"
	"github.com/DowLucas/chara/internal/ulid"
)

// RecurringHandler exposes the 8 routes that implement
// docs/superpowers/specs/2026-05-24-recurring-expenses-design.md.
//
// All write paths are gated by the standard group-locked check
// (requireGroupUnlocked → writeLockedError). The fire-side
// (materialization) lives in internal/jobs.RecurringFireWorker.
type RecurringHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRecurringHandler(pool *pgxpool.Pool, queries *db.Queries) *RecurringHandler {
	return &RecurringHandler{pool: pool, queries: queries}
}

// ── Response types ────────────────────────────────────────────────────────────

type recurringSplitResponse struct {
	MemberID string `json:"member_id"`
	Value    int64  `json:"value"`
}

type recurringResponse struct {
	ID            string                   `json:"id"`
	GroupID       string                   `json:"group_id"`
	Title         string                   `json:"title"`
	AmountMinor   int64                    `json:"amount_minor"`
	Currency      string                   `json:"currency"`
	PaidByID      string                   `json:"paid_by_id"`
	SplitMethod   string                   `json:"split_method"`
	Splits        []recurringSplitResponse `json:"splits"`
	Category      string                   `json:"category"`
	Notes         *string                  `json:"notes"`
	FreqUnit      string                   `json:"freq_unit"`
	FreqInterval  int32                    `json:"freq_interval"`
	StartDate     string                   `json:"start_date"`
	EndDate       *string                  `json:"end_date"`
	Timezone      string                   `json:"timezone"`
	FireLocalTime string                   `json:"fire_local_time"`
	Status        string                   `json:"status"`
	PausedReason  *string                  `json:"paused_reason"`
	LastFireAt    *time.Time               `json:"last_fire_at"`
	NextFireAt    time.Time                `json:"next_fire_at"`
	CreatedByID   string                   `json:"created_by_id"`
	CreatedAt     time.Time                `json:"created_at"`
	UpdatedAt     time.Time                `json:"updated_at"`
}

func buildRecurringResponse(rule db.RecurringExpense, splits []db.RecurringExpenseSplit) recurringResponse {
	resp := recurringResponse{
		ID:            rule.ID,
		GroupID:       rule.GroupID,
		Title:         rule.Title,
		AmountMinor:   rule.AmountMinor,
		Currency:      rule.Currency,
		PaidByID:      rule.PaidByID,
		SplitMethod:   rule.SplitMethod,
		Category:      rule.Category,
		FreqUnit:      rule.FreqUnit,
		FreqInterval:  rule.FreqInterval,
		Timezone:      rule.Timezone,
		FireLocalTime: pgTimeToHHMM(rule.FireLocalTime),
		Status:        rule.Status,
		NextFireAt:    rule.NextFireAt.Time,
		CreatedByID:   rule.CreatedByID,
		CreatedAt:     rule.CreatedAt.Time,
		UpdatedAt:     rule.UpdatedAt.Time,
	}
	if rule.Notes.Valid {
		s := rule.Notes.String
		resp.Notes = &s
	}
	if rule.StartDate.Valid {
		resp.StartDate = rule.StartDate.Time.Format("2006-01-02")
	}
	if rule.EndDate.Valid {
		s := rule.EndDate.Time.Format("2006-01-02")
		resp.EndDate = &s
	}
	if rule.PausedReason.Valid {
		s := rule.PausedReason.String
		resp.PausedReason = &s
	}
	if rule.LastFireAt.Valid {
		t := rule.LastFireAt.Time
		resp.LastFireAt = &t
	}
	resp.Splits = make([]recurringSplitResponse, len(splits))
	for i, s := range splits {
		resp.Splits[i] = recurringSplitResponse{MemberID: s.MemberID, Value: s.Value}
	}
	return resp
}

func pgTimeToHHMM(t pgtype.Time) string {
	if !t.Valid {
		return "09:00"
	}
	totalSecs := t.Microseconds / 1_000_000
	h := totalSecs / 3600
	m := (totalSecs % 3600) / 60
	return fmt.Sprintf("%02d:%02d", h, m)
}

// hhmmToPgTime parses "HH:MM" into a pgtype.Time. Caller has already
// validated the format via recurring.Validate.
func hhmmToPgTime(s string) pgtype.Time {
	if len(s) != 5 || s[2] != ':' {
		return pgtype.Time{Microseconds: 9 * 3600 * 1_000_000, Valid: true}
	}
	h := int64(s[0]-'0')*10 + int64(s[1]-'0')
	m := int64(s[3]-'0')*10 + int64(s[4]-'0')
	return pgtype.Time{
		Microseconds: (h*3600 + m*60) * 1_000_000,
		Valid:        true,
	}
}

// ── Request types ─────────────────────────────────────────────────────────────

type recurringSplitItem struct {
	MemberID string `json:"member_id"`
	Value    int64  `json:"value"`
}

type createRecurringReq struct {
	Title         string               `json:"title"`
	AmountMinor   int64                `json:"amount_minor"`
	Currency      *string              `json:"currency,omitempty"` // rejected if present
	PaidByID      string               `json:"paid_by_id"`
	SplitMethod   string               `json:"split_method"`
	Splits        []recurringSplitItem `json:"splits"`
	Category      string               `json:"category"`
	Notes         *string              `json:"notes"`
	FreqUnit      string               `json:"freq_unit"`
	FreqInterval  int                  `json:"freq_interval"`
	StartDate     string               `json:"start_date"`
	EndDate       *string              `json:"end_date"`
	Timezone      string               `json:"timezone"`
	FireLocalTime string               `json:"fire_local_time"`
}

type updateRecurringReq struct {
	Title         string               `json:"title"`
	AmountMinor   int64                `json:"amount_minor"`
	Currency      *string              `json:"currency,omitempty"`   // rejected if present
	StartDate     *string              `json:"start_date,omitempty"` // rejected if present
	PaidByID      string               `json:"paid_by_id"`
	SplitMethod   string               `json:"split_method"`
	Splits        []recurringSplitItem `json:"splits"`
	Category      string               `json:"category"`
	Notes         *string              `json:"notes"`
	FreqUnit      string               `json:"freq_unit"`
	FreqInterval  int                  `json:"freq_interval"`
	EndDate       *string              `json:"end_date"`
	Timezone      string               `json:"timezone"`
	FireLocalTime string               `json:"fire_local_time"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// writeErrorCode is like writeError but emits {"error": msg, "code": code}
// so the client can dispatch on stable codes instead of string-matching
// the human-readable message.
func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg, "code": code})
}

func (h *RecurringHandler) requireMember(w http.ResponseWriter, r *http.Request, groupID string) bool {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return false
	}
	_, err := h.queries.GetGroupMemberByUserAndGroup(r.Context(), db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusForbidden, "not a member of this group")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return false
	}
	return true
}

// validateMembership ensures every memberID belongs to groupID. Returns a
// generic error to avoid leaking which group an ID lives in.
func (h *RecurringHandler) validateMembership(ctx context.Context, groupID string, memberIDs []string) error {
	seen := map[string]struct{}{}
	for _, id := range memberIDs {
		if id == "" {
			return fmt.Errorf("invalid member")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		m, err := h.queries.GetGroupMember(ctx, id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("invalid member")
			}
			return err
		}
		if m.GroupID != groupID {
			return fmt.Errorf("invalid member")
		}
	}
	return nil
}

// validateSplits checks the per-method sum invariants. amount_minor is in
// minor units; values are minor units (exact) or basis points (percentage).
func validateSplits(method string, amount int64, items []recurringSplitItem) error {
	if len(items) == 0 {
		return fmt.Errorf("splits required")
	}
	switch method {
	case "equal":
		for _, s := range items {
			if s.Value != 0 {
				return fmt.Errorf("equal split values must be 0")
			}
		}
		return nil
	case "exact":
		var sum int64
		for _, s := range items {
			if s.Value < 0 {
				return fmt.Errorf("split value must be non-negative")
			}
			sum += s.Value
		}
		if sum != amount {
			return fmt.Errorf("exact split sums to %d, expected %d", sum, amount)
		}
		return nil
	case "percentage":
		var sum int64
		for _, s := range items {
			if s.Value < 0 {
				return fmt.Errorf("split value must be non-negative")
			}
			sum += s.Value
		}
		if sum != 10000 {
			return fmt.Errorf("percentage basis points sum to %d, must be 10000", sum)
		}
		return nil
	default:
		return fmt.Errorf("unknown split_method %q", method)
	}
}

// computeFirstFireAt returns the UTC instant of the first occurrence:
// start_date at fire_local_time in tz, converted to UTC. Caller has
// already validated tz and fire_local_time.
func computeFirstFireAt(startDate time.Time, fireLocalTime, tz string) time.Time {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	hh, mm := parseHHMM(fireLocalTime)
	return time.Date(
		startDate.Year(), startDate.Month(), startDate.Day(),
		hh, mm, 0, 0, loc,
	).UTC()
}

func parseHHMM(s string) (int, int) {
	if len(s) != 5 || s[2] != ':' {
		return 9, 0
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	return h, m
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *RecurringHandler) Create(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	if !h.requireMember(w, r, groupID) {
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

	var req createRecurringReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Currency != nil {
		writeErrorCode(w, http.StatusBadRequest, "currency_immutable",
			"currency is derived from the group; do not send it")
		return
	}

	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.AmountMinor <= 0 {
		writeError(w, http.StatusBadRequest, "amount_minor must be positive")
		return
	}
	if req.PaidByID == "" {
		writeError(w, http.StatusBadRequest, "paid_by_id is required")
		return
	}
	if req.SplitMethod == "" {
		req.SplitMethod = "equal"
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if req.FireLocalTime == "" {
		req.FireLocalTime = "09:00"
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid start_date, expected YYYY-MM-DD")
		return
	}
	// start_date >= today (today in UTC; fire scheduling math handles tz)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	startDay := time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, time.UTC)
	if startDay.Before(today) {
		writeError(w, http.StatusBadRequest, "start_date must be today or later")
		return
	}

	var endDatePtr *time.Time
	if req.EndDate != nil {
		ed, err := time.Parse("2006-01-02", *req.EndDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid end_date, expected YYYY-MM-DD")
			return
		}
		endDatePtr = &ed
	}

	rule := recurring.Rule{
		FreqUnit:      req.FreqUnit,
		FreqInterval:  req.FreqInterval,
		StartDate:     startDate,
		EndDate:       endDatePtr,
		Timezone:      req.Timezone,
		FireLocalTime: req.FireLocalTime,
	}
	if err := recurring.Validate(rule); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := validateSplits(req.SplitMethod, req.AmountMinor, req.Splits); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// All paid_by + split members must be current members of this group.
	memberIDs := make([]string, 0, len(req.Splits)+1)
	memberIDs = append(memberIDs, req.PaidByID)
	for _, s := range req.Splits {
		memberIDs = append(memberIDs, s.MemberID)
	}
	if err := h.validateMembership(r.Context(), groupID, memberIDs); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	group, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load group")
		return
	}

	endDatePg := pgtype.Date{Valid: false}
	if endDatePtr != nil {
		endDatePg = pgtype.Date{Time: *endDatePtr, Valid: true}
	}
	notesPg := pgtype.Text{Valid: false}
	if req.Notes != nil {
		notesPg = pgtype.Text{String: *req.Notes, Valid: true}
	}

	firstFire := computeFirstFireAt(startDate, req.FireLocalTime, req.Timezone)

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	id := ulid.New()
	created, err := q.CreateRecurringExpense(r.Context(), db.CreateRecurringExpenseParams{
		ID:            id,
		GroupID:       groupID,
		Title:         req.Title,
		AmountMinor:   req.AmountMinor,
		Currency:      group.Currency,
		PaidByID:      req.PaidByID,
		SplitMethod:   req.SplitMethod,
		Category:      req.Category,
		Notes:         notesPg,
		FreqUnit:      req.FreqUnit,
		FreqInterval:  int32(req.FreqInterval),
		StartDate:     pgtype.Date{Time: startDate, Valid: true},
		EndDate:       endDatePg,
		Timezone:      req.Timezone,
		FireLocalTime: hhmmToPgTime(req.FireLocalTime),
		NextFireAt:    pgtype.Timestamptz{Time: firstFire, Valid: true},
		CreatedByID:   claims.UserID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create recurring expense")
		return
	}

	for _, s := range req.Splits {
		if err := q.CreateRecurringSplit(r.Context(), db.CreateRecurringSplitParams{
			RecurringID: id,
			MemberID:    s.MemberID,
			Value:       s.Value,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "could not write splits")
			return
		}
	}

	splits, err := q.ListRecurringSplits(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, buildRecurringResponse(created, splits))
}

func (h *RecurringHandler) List(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if !h.requireMember(w, r, groupID) {
		return
	}

	rules, err := h.queries.ListRecurringExpensesByGroup(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := make([]recurringResponse, len(rules))
	for i, rule := range rules {
		splits, err := h.queries.ListRecurringSplits(r.Context(), rule.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		resp[i] = buildRecurringResponse(rule, splits)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *RecurringHandler) Get(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	id := chi.URLParam(r, "recurringID")
	if !h.requireMember(w, r, groupID) {
		return
	}

	rule, err := h.queries.GetRecurringExpense(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "recurring expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if rule.GroupID != groupID {
		writeError(w, http.StatusNotFound, "recurring expense not found")
		return
	}
	splits, err := h.queries.ListRecurringSplits(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, buildRecurringResponse(rule, splits))
}

func (h *RecurringHandler) Update(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	id := chi.URLParam(r, "recurringID")
	if !h.requireMember(w, r, groupID) {
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

	existing, err := h.queries.GetRecurringExpense(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "recurring expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if existing.GroupID != groupID {
		writeError(w, http.StatusNotFound, "recurring expense not found")
		return
	}

	var req updateRecurringReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Currency != nil {
		writeErrorCode(w, http.StatusBadRequest, "currency_immutable",
			"currency cannot be changed; create a new rule for a different currency")
		return
	}
	if req.StartDate != nil {
		writeErrorCode(w, http.StatusBadRequest, "start_date_immutable",
			"start_date cannot be changed; create a new rule")
		return
	}

	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.AmountMinor <= 0 {
		writeError(w, http.StatusBadRequest, "amount_minor must be positive")
		return
	}
	if req.PaidByID == "" {
		writeError(w, http.StatusBadRequest, "paid_by_id is required")
		return
	}
	if req.SplitMethod == "" {
		req.SplitMethod = "equal"
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if req.FireLocalTime == "" {
		req.FireLocalTime = "09:00"
	}

	var endDatePtr *time.Time
	if req.EndDate != nil {
		ed, err := time.Parse("2006-01-02", *req.EndDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid end_date, expected YYYY-MM-DD")
			return
		}
		endDatePtr = &ed
	}

	rule := recurring.Rule{
		FreqUnit:      req.FreqUnit,
		FreqInterval:  req.FreqInterval,
		StartDate:     existing.StartDate.Time,
		EndDate:       endDatePtr,
		Timezone:      req.Timezone,
		FireLocalTime: req.FireLocalTime,
	}
	if err := recurring.Validate(rule); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateSplits(req.SplitMethod, req.AmountMinor, req.Splits); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	memberIDs := make([]string, 0, len(req.Splits)+1)
	memberIDs = append(memberIDs, req.PaidByID)
	for _, s := range req.Splits {
		memberIDs = append(memberIDs, s.MemberID)
	}
	if err := h.validateMembership(r.Context(), groupID, memberIDs); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Recompute next_fire_at if schedule-affecting fields changed.
	scheduleChanged := req.FreqUnit != existing.FreqUnit ||
		int32(req.FreqInterval) != existing.FreqInterval ||
		req.Timezone != existing.Timezone ||
		req.FireLocalTime != pgTimeToHHMM(existing.FireLocalTime) ||
		!datesEqual(endDatePtr, existing.EndDate)

	nextFire := existing.NextFireAt
	if scheduleChanged {
		var anchor time.Time
		if existing.LastFireAt.Valid {
			anchor = existing.LastFireAt.Time
		} else {
			anchor = computeFirstFireAt(existing.StartDate.Time, req.FireLocalTime, req.Timezone)
			// Recomputing from start: use that as next_fire_at directly,
			// no advancement needed because nothing has fired yet.
			nextFire = pgtype.Timestamptz{Time: anchor, Valid: true}
		}
		if existing.LastFireAt.Valid {
			_, nf, _ := recurring.NextFire(rule, anchor)
			nextFire = pgtype.Timestamptz{Time: nf, Valid: true}
		}
	}

	endDatePg := pgtype.Date{Valid: false}
	if endDatePtr != nil {
		endDatePg = pgtype.Date{Time: *endDatePtr, Valid: true}
	}
	notesPg := pgtype.Text{Valid: false}
	if req.Notes != nil {
		notesPg = pgtype.Text{String: *req.Notes, Valid: true}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	updated, err := q.UpdateRecurringExpense(r.Context(), db.UpdateRecurringExpenseParams{
		ID:            id,
		Title:         req.Title,
		AmountMinor:   req.AmountMinor,
		PaidByID:      req.PaidByID,
		SplitMethod:   req.SplitMethod,
		Category:      req.Category,
		Notes:         notesPg,
		FreqUnit:      req.FreqUnit,
		FreqInterval:  int32(req.FreqInterval),
		EndDate:       endDatePg,
		Timezone:      req.Timezone,
		FireLocalTime: hhmmToPgTime(req.FireLocalTime),
		NextFireAt:    nextFire,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update recurring expense")
		return
	}
	if err := q.DeleteRecurringSplits(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write splits")
		return
	}
	for _, s := range req.Splits {
		if err := q.CreateRecurringSplit(r.Context(), db.CreateRecurringSplitParams{
			RecurringID: id,
			MemberID:    s.MemberID,
			Value:       s.Value,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "could not write splits")
			return
		}
	}
	splits, err := q.ListRecurringSplits(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, buildRecurringResponse(updated, splits))
}

func datesEqual(a *time.Time, b pgtype.Date) bool {
	if a == nil && !b.Valid {
		return true
	}
	if a == nil || !b.Valid {
		return false
	}
	return a.Year() == b.Time.Year() && a.Month() == b.Time.Month() && a.Day() == b.Time.Day()
}

func (h *RecurringHandler) Delete(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	id := chi.URLParam(r, "recurringID")
	if !h.requireMember(w, r, groupID) {
		return
	}

	existing, err := h.queries.GetRecurringExpense(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "recurring expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if existing.GroupID != groupID {
		writeError(w, http.StatusNotFound, "recurring expense not found")
		return
	}

	// Hard delete: row + splits go via ON DELETE CASCADE. Materialized
	// expense rows already in the expenses table are untouched —
	// historical occurrences must survive rule removal so balances and
	// activity feeds stay coherent.
	if err := h.queries.DeleteRecurringExpense(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RecurringHandler) Pause(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	id := chi.URLParam(r, "recurringID")
	if !h.requireMember(w, r, groupID) {
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

	existing, err := h.queries.GetRecurringExpense(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "recurring expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if existing.GroupID != groupID {
		writeError(w, http.StatusNotFound, "recurring expense not found")
		return
	}

	updated, err := h.queries.SetRecurringStatus(r.Context(), db.SetRecurringStatusParams{
		ID:           id,
		Status:       "paused",
		PausedReason: pgtype.Text{String: "manual", Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	splits, _ := h.queries.ListRecurringSplits(r.Context(), id)
	writeJSON(w, http.StatusOK, buildRecurringResponse(updated, splits))
}

func (h *RecurringHandler) Resume(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	id := chi.URLParam(r, "recurringID")
	if !h.requireMember(w, r, groupID) {
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

	existing, err := h.queries.GetRecurringExpense(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "recurring expense not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	if existing.GroupID != groupID {
		writeError(w, http.StatusNotFound, "recurring expense not found")
		return
	}

	// Reset next_fire_at to NOW() so resume doesn't immediately fire a
	// catch-up burst for the entire paused window.
	if _, err := h.pool.Exec(r.Context(),
		`UPDATE recurring_expenses SET next_fire_at = NOW() WHERE id = $1`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	updated, err := h.queries.SetRecurringStatus(r.Context(), db.SetRecurringStatusParams{
		ID:           id,
		Status:       "active",
		PausedReason: pgtype.Text{Valid: false},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	splits, _ := h.queries.ListRecurringSplits(r.Context(), id)
	writeJSON(w, http.StatusOK, buildRecurringResponse(updated, splits))
}

// ResumeAllAfterUnlock resumes every group-locked-paused rule whose
// creator is the calling user. Rules paused for other reasons or by
// other creators are untouched.
func (h *RecurringHandler) ResumeAllAfterUnlock(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	if !h.requireMember(w, r, groupID) {
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

	ids, err := h.queries.ResumeAllGroupLockedRecurringByCreator(r.Context(),
		db.ResumeAllGroupLockedRecurringByCreatorParams{
			GroupID:     groupID,
			CreatedByID: claims.UserID,
		})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if ids == nil {
		ids = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"resumed_ids": ids})
}
