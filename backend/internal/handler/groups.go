package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/currency"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/language"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/storage"
	"github.com/DowLucas/chara/internal/ulid"
)

type GroupHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
	cfg     *config.Config
	// store is optional — when present it's used to best-effort sweep
	// attachment bucket objects on permanent group delete.
	store *storage.Client
}

func NewGroupHandler(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config) *GroupHandler {
	return &GroupHandler{queries: queries, pool: pool, cfg: cfg}
}

// WithStorage returns a GroupHandler that will best-effort sweep
// attachment bucket objects when a group is permanently deleted.
func (h *GroupHandler) WithStorage(s *storage.Client) *GroupHandler {
	h.store = s
	return h
}

// ── Response types ────────────────────────────────────────────────────────────

type MemberResponse struct {
	ID              string    `json:"id"`
	UserID          *string   `json:"user_id,omitempty"`
	Name            string    `json:"name"`
	Role            string    `json:"role"`
	IsGhost         bool      `json:"is_ghost"`
	JoinedAt        time.Time `json:"joined_at"`
	// AvatarObjectURL points at the proxy endpoint. Always set when the
	// member is a real user (not a ghost) — the endpoint returns 404 if
	// they haven't uploaded one, letting the client fall back to initials
	// or the OAuth-provided avatar_url.
	AvatarObjectURL *string `json:"avatar_object_url,omitempty"`
	// Phone is the linked user's phone number (E.164 or national format).
	// Surfaced so the settle screen can build the Swish deep-link without
	// a second round-trip. Omitted for ghost members and users with no
	// phone on file.
	Phone *string `json:"phone,omitempty"`
}

type GroupResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Currency    string    `json:"currency"`
	// Language is an ISO 639-1 code (en, sv, ja, …). Used to localise
	// AI-generated content like receipt-scan titles into a consistent
	// language regardless of which member uploaded the receipt.
	Language    string    `json:"language"`
	CreatedBy   string    `json:"created_by"`
	InviteToken string    `json:"invite_token"`
	IsArchived  bool      `json:"is_archived"`
	// IsLocked, when true, freezes financial mutations on the group —
	// expenses, settlements, edits, invite regen all return 409
	// {"code":"group_locked"}. Lifecycle (archive / hard-delete) and
	// membership removal still work so an owner is never stuck with a
	// locked-and-forgotten group.
	IsLocked    bool      `json:"is_locked"`
	// CurrencyLocked mirrors the server-side rule that the group's currency
	// cannot change once any active expense exists. Exposed so the client
	// can disable currency pickers proactively instead of learning at save
	// time via 409 {"code":"group_currency_locked"}.
	CurrencyLocked bool      `json:"currency_locked"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type GroupDetailResponse struct {
	GroupResponse
	Members []MemberResponse `json:"members"`
}

func groupToResponse(g db.Group, currencyLocked bool) GroupResponse {
	return GroupResponse{
		ID:             g.ID,
		Name:           g.Name,
		Currency:       g.Currency,
		Language:       g.Language,
		CreatedBy:      g.CreatedBy,
		InviteToken:    g.InviteToken,
		IsArchived:     g.IsArchived,
		IsLocked:       g.IsLocked,
		CurrencyLocked: currencyLocked,
		CreatedAt:      g.CreatedAt.Time,
		UpdatedAt:      g.UpdatedAt.Time,
	}
}

// isCurrencyLocked returns true when the group has at least one active
// expense (the same condition the Update handler enforces). Errors are
// swallowed to false — the worst case is the client sees a stale unlocked
// state and the Update handler still rejects the change with 409.
func (h *GroupHandler) isCurrencyLocked(ctx context.Context, groupID string) bool {
	count, err := h.queries.CountActiveExpensesByGroup(ctx, groupID)
	if err != nil {
		return false
	}
	return count > 0
}

func memberToResponse(m db.ListGroupMembersWithUserRow) MemberResponse {
	r := MemberResponse{
		ID:       m.ID,
		Name:     m.Name,
		Role:     m.Role,
		IsGhost:  m.IsGhost,
		JoinedAt: m.JoinedAt.Time,
	}
	if m.UserID.Valid {
		r.UserID = &m.UserID.String
		u := avatarURL(m.UserID.String)
		r.AvatarObjectURL = &u
	}
	if m.UserPhone.Valid && m.UserPhone.String != "" {
		p := m.UserPhone.String
		r.Phone = &p
	}
	return r
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// isSupportedLanguage is a thin alias so the handler reads cleanly. Empty
// values are caller's responsibility to coerce to a default before this is
// called.
func isSupportedLanguage(code string) bool {
	return language.IsSupported(code)
}

// ErrGroupLocked sentinel is returned by requireGroupUnlocked when the group
// is locked. Handlers translate it to `409 {"code":"group_locked"}`.
var ErrGroupLocked = errors.New("group_locked")

// requireGroupUnlocked is the write-gate every handler that mutates group
// contents must call before opening its transaction. It deliberately
// accepts the read-only *db.Queries on the pool (not a tx) so it's cheap
// and can short-circuit before any locking work happens.
//
// Returns ErrGroupLocked when the group is currently locked, pgx.ErrNoRows
// when the group does not exist, or any other DB error.
func requireGroupUnlocked(ctx context.Context, q *db.Queries, groupID string) error {
	locked, err := q.GetGroupLockState(ctx, groupID)
	if err != nil {
		return err
	}
	if locked {
		return ErrGroupLocked
	}
	return nil
}

// writeLockedError emits the canonical `409 {"code":"group_locked"}` body.
// Exposed to other handlers in the package via writeLockedError.
func writeLockedError(w http.ResponseWriter) {
	writeJSON(w, http.StatusConflict, map[string]string{
		"code":  "group_locked",
		"error": "this group is locked",
	})
}

// requireMember looks up the authenticated user's membership in groupID.
// Returns the member and true on success; writes the error response and returns false on failure.
func (h *GroupHandler) requireMember(w http.ResponseWriter, r *http.Request, groupID string) (db.GroupMember, bool) {
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

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *GroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var req struct {
		Name     string `json:"name"`
		Currency string `json:"currency"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
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
	if req.Language == "" {
		req.Language = "en"
	}
	if !isSupportedLanguage(req.Language) {
		writeError(w, http.StatusBadRequest, "unsupported language code")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)

	group, err := q.CreateGroup(r.Context(), db.CreateGroupParams{
		ID:                         ulid.New(),
		Name:                       req.Name,
		Currency:                   req.Currency,
		Language:                   req.Language,
		CreatedBy:                  claims.UserID,
		InviteToken:                ulid.New(),
		InviteTokenCreatedByUserID: pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create group")
		return
	}

	// Fetch user display name for the member record
	user, err := q.GetUserByID(r.Context(), claims.UserID)
	displayName := claims.Email // fallback
	if err == nil {
		displayName = user.DisplayName
	}

	ownerMember, err := q.CreateGroupMember(r.Context(), db.CreateGroupMemberParams{
		ID:      ulid.New(),
		GroupID: group.ID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
		Name:    displayName,
		Role:    "owner",
		IsGhost: false,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create group member")
		return
	}

	if err := writeActivity(r.Context(), q, group.ID, claims.UserID,
		EventGroupCreated, group.ID, EntityGroup,
		&ActivityPayload{Snapshot: GroupSnapshot{Name: group.Name}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}
	if err := writeActivity(r.Context(), q, group.ID, claims.UserID,
		EventMemberJoined, ownerMember.ID, EntityMember,
		&ActivityPayload{Snapshot: MemberSnapshot{
			MemberID:    ownerMember.ID,
			DisplayName: ownerMember.Name,
		}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Brand-new group with no expenses yet — currency is by definition unlocked.
	writeJSON(w, http.StatusCreated, groupToResponse(group, false))
}

func (h *GroupHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	groups, err := h.queries.ListGroupsByUserID(r.Context(), pgtype.Text{String: claims.UserID, Valid: true})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	resp := make([]GroupResponse, len(groups))
	for i, g := range groups {
		resp[i] = groupToResponse(g, h.isCurrencyLocked(r.Context(), g.ID))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *GroupHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	_ = member

	members, err := h.queries.ListGroupMembersWithUser(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	memberResp := make([]MemberResponse, len(members))
	for i, m := range members {
		memberResp[i] = memberToResponse(m)
	}

	writeJSON(w, http.StatusOK, GroupDetailResponse{
		GroupResponse: groupToResponse(group, h.isCurrencyLocked(r.Context(), group.ID)),
		Members:       memberResp,
	})
}

func (h *GroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can update the group")
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

	var req struct {
		Name     *string `json:"name"`
		Currency *string `json:"currency"`
		Language *string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Load the previous state once. We use it both for the currency-lock
	// check and to compute the activity diff (so the snapshot can record
	// the old → new values).
	prev, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	params := db.UpdateGroupParams{ID: groupID}
	snapshot := GroupSnapshot{}

	if req.Name != nil && *req.Name != prev.Name {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
		snapshot.Changed = append(snapshot.Changed, "name")
		snapshot.Name = *req.Name
		snapshot.OldName = prev.Name
	}
	if req.Currency != nil {
		normalized, ok := currency.Normalize(*req.Currency)
		if !ok {
			writeError(w, http.StatusBadRequest, "unknown currency code")
			return
		}
		if normalized != prev.Currency {
			// Lock currency once any active expense exists — the member_balances
			// view groups by expenses.currency, so changing it mid-flight would
			// fragment balances into per-currency buckets.
			count, err := h.queries.CountActiveExpensesByGroup(r.Context(), groupID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
			if count > 0 {
				writeJSON(w, http.StatusConflict, map[string]string{
					"code":  "group_currency_locked",
					"error": "currency is locked once a group has expenses",
				})
				return
			}
			params.Currency = pgtype.Text{String: normalized, Valid: true}
			snapshot.Changed = append(snapshot.Changed, "currency")
			snapshot.Currency = normalized
			snapshot.OldCurrency = prev.Currency
		}
	}
	if req.Language != nil {
		if !isSupportedLanguage(*req.Language) {
			writeError(w, http.StatusBadRequest, "unsupported language code")
			return
		}
		if *req.Language != prev.Language {
			params.Language = pgtype.Text{String: *req.Language, Valid: true}
			snapshot.Changed = append(snapshot.Changed, "language")
			snapshot.Language = *req.Language
			snapshot.OldLanguage = prev.Language
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	group, err := q.UpdateGroup(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	if len(snapshot.Changed) > 0 {
		if err := writeActivity(r.Context(), q, groupID, claims.UserID,
			EventGroupUpdated, groupID, EntityGroup,
			&ActivityPayload{Snapshot: snapshot}); err != nil {
			writeError(w, http.StatusInternalServerError, "could not write activity")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, groupToResponse(group, h.isCurrencyLocked(r.Context(), group.ID)))
}

func (h *GroupHandler) Archive(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can archive the group")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	archived := true
	g, err := q.UpdateGroup(r.Context(), db.UpdateGroupParams{
		ID:         groupID,
		IsArchived: pgtype.Bool{Bool: archived, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		EventGroupArchived, groupID, EntityGroup,
		&ActivityPayload{Snapshot: GroupSnapshot{Name: g.Name}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *GroupHandler) GetInviteLink(w http.ResponseWriter, r *http.Request) {
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

	// Universal-link form: handled by GET /i/{token} at the router root. The
	// real landing page is Wave 3 of the invite-deep-links plan; today the
	// route is a 501 stub but the link itself is what we ship to users.
	inviteURL := h.cfg.BaseURL + "/i/" + group.InviteToken
	writeJSON(w, http.StatusOK, map[string]string{"invite_url": inviteURL})
}

func (h *GroupHandler) RegenerateInviteToken(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can rotate the invite link")
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

	claims := middleware.ClaimsFromContext(r.Context())

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	group, err := q.RegenerateInviteToken(r.Context(), db.RegenerateInviteTokenParams{
		ID:                         groupID,
		InviteToken:                ulid.New(),
		InviteTokenCreatedByUserID: pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	// No snapshot needed — the new token itself is sensitive and the actor
	// + timestamp is the audit-worthy info.
	if err := writeActivity(r.Context(), q, groupID, claims.UserID,
		EventInviteLinkRotated, groupID, EntityGroup, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, groupToResponse(group, h.isCurrencyLocked(r.Context(), group.ID)))
}

func (h *GroupHandler) JoinViaToken(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	claims := middleware.ClaimsFromContext(r.Context())

	group, err := h.queries.GetGroupByInviteToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "invalid invite token")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	if err := requireGroupUnlocked(r.Context(), h.queries, group.ID); err != nil {
		if errors.Is(err, ErrGroupLocked) {
			writeLockedError(w)
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Check already a member
	_, err = h.queries.GetGroupMemberByUserAndGroup(r.Context(), db.GetGroupMemberByUserAndGroupParams{
		GroupID: group.ID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err == nil {
		writeError(w, http.StatusConflict, "already a member of this group")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Fetch user display name
	user, err := h.queries.GetUserByID(r.Context(), claims.UserID)
	displayName := claims.Email
	if err == nil {
		displayName = user.DisplayName
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())
	q := db.New(tx)

	newMember, err := q.CreateGroupMember(r.Context(), db.CreateGroupMemberParams{
		ID:      ulid.New(),
		GroupID: group.ID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
		Name:    displayName,
		Role:    "member",
		IsGhost: false,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not join group")
		return
	}

	if err := writeActivity(r.Context(), q, group.ID, claims.UserID,
		EventMemberJoined, newMember.ID, EntityMember,
		&ActivityPayload{Snapshot: MemberSnapshot{
			MemberID:    newMember.ID,
			DisplayName: newMember.Name,
		}}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write activity")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	members, _ := h.queries.ListGroupMembersWithUser(r.Context(), group.ID)
	memberResp := make([]MemberResponse, len(members))
	for i, m := range members {
		memberResp[i] = memberToResponse(m)
	}

	writeJSON(w, http.StatusOK, GroupDetailResponse{
		GroupResponse: groupToResponse(group, h.isCurrencyLocked(r.Context(), group.ID)),
		Members:       memberResp,
	})
}
