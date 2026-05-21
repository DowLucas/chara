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

	"github.com/DowLucas/quits/internal/config"
	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/middleware"
	"github.com/DowLucas/quits/internal/ulid"
)

type GroupHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
	cfg     *config.Config
}

func NewGroupHandler(pool *pgxpool.Pool, queries *db.Queries, cfg *config.Config) *GroupHandler {
	return &GroupHandler{queries: queries, pool: pool, cfg: cfg}
}

// ── Response types ────────────────────────────────────────────────────────────

type MemberResponse struct {
	ID          string    `json:"id"`
	UserID      *string   `json:"user_id,omitempty"`
	Name        string    `json:"name"`
	Role        string    `json:"role"`
	IsGhost     bool      `json:"is_ghost"`
	JoinedAt    time.Time `json:"joined_at"`
	SwishNumber *string   `json:"swish_number"`
}

type GroupResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Currency    string    `json:"currency"`
	CreatedBy   string    `json:"created_by"`
	InviteToken string    `json:"invite_token"`
	IsArchived  bool      `json:"is_archived"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type GroupDetailResponse struct {
	GroupResponse
	Members []MemberResponse `json:"members"`
}

func groupToResponse(g db.Group) GroupResponse {
	return GroupResponse{
		ID:          g.ID,
		Name:        g.Name,
		Currency:    g.Currency,
		CreatedBy:   g.CreatedBy,
		InviteToken: g.InviteToken,
		IsArchived:  g.IsArchived,
		CreatedAt:   g.CreatedAt.Time,
		UpdatedAt:   g.UpdatedAt.Time,
	}
}

func memberToResponse(m db.GroupMember) MemberResponse {
	r := MemberResponse{
		ID:       m.ID,
		Name:     m.Name,
		Role:     m.Role,
		IsGhost:  m.IsGhost,
		JoinedAt: m.JoinedAt.Time,
	}
	if m.UserID.Valid {
		r.UserID = &m.UserID.String
	}
	return r
}

func memberWithUserToResponse(m db.ListGroupMembersWithUserRow) MemberResponse {
	r := MemberResponse{
		ID:       m.ID,
		Name:     m.Name,
		Role:     m.Role,
		IsGhost:  m.IsGhost,
		JoinedAt: m.JoinedAt.Time,
	}
	if m.UserID.Valid {
		r.UserID = &m.UserID.String
	}
	if m.SwishNumber.Valid {
		s := m.SwishNumber.String
		r.SwishNumber = &s
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

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)

	group, err := q.CreateGroup(r.Context(), db.CreateGroupParams{
		ID:          ulid.New(),
		Name:        req.Name,
		Currency:    req.Currency,
		CreatedBy:   claims.UserID,
		InviteToken: ulid.New(),
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

	_, err = q.CreateGroupMember(r.Context(), db.CreateGroupMemberParams{
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

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, groupToResponse(group))
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
		resp[i] = groupToResponse(g)
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

	members, err := h.queries.ListGroupMembers(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	memberResp := make([]MemberResponse, len(members))
	for i, m := range members {
		memberResp[i] = memberToResponse(m)
	}

	writeJSON(w, http.StatusOK, GroupDetailResponse{
		GroupResponse: groupToResponse(group),
		Members:       memberResp,
	})
}

func (h *GroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can update the group")
		return
	}

	var req struct {
		Name     *string `json:"name"`
		Currency *string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateGroupParams{ID: groupID}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Currency != nil {
		params.Currency = pgtype.Text{String: *req.Currency, Valid: true}
	}

	group, err := h.queries.UpdateGroup(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "group not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	writeJSON(w, http.StatusOK, groupToResponse(group))
}

func (h *GroupHandler) Archive(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	member, ok := h.requireMember(w, r, groupID)
	if !ok {
		return
	}
	if member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only the group owner can archive the group")
		return
	}

	archived := true
	_, err := h.queries.UpdateGroup(r.Context(), db.UpdateGroupParams{
		ID:         groupID,
		IsArchived: pgtype.Bool{Bool: archived, Valid: true},
	})
	if err != nil {
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

	inviteURL := h.cfg.BaseURL + "/api/groups/join/" + group.InviteToken
	writeJSON(w, http.StatusOK, map[string]string{"invite_url": inviteURL})
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

	_, err = h.queries.CreateGroupMember(r.Context(), db.CreateGroupMemberParams{
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

	members, _ := h.queries.ListGroupMembers(r.Context(), group.ID)
	memberResp := make([]MemberResponse, len(members))
	for i, m := range members {
		memberResp[i] = memberToResponse(m)
	}

	writeJSON(w, http.StatusOK, GroupDetailResponse{
		GroupResponse: groupToResponse(group),
		Members:       memberResp,
	})
}

// ListMembers returns all members of a group with their (optional) swish_number.
// Only group members may read.
func (h *GroupHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if _, ok := h.requireMember(w, r, groupID); !ok {
		return
	}
	members, err := h.queries.ListGroupMembersWithUser(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	resp := make([]MemberResponse, len(members))
	for i, m := range members {
		resp[i] = memberWithUserToResponse(m)
	}
	writeJSON(w, http.StatusOK, resp)
}
