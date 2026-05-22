package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
)

type ActivityHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
}

func NewActivityHandler(pool *pgxpool.Pool, queries *db.Queries) *ActivityHandler {
	return &ActivityHandler{queries: queries, pool: pool}
}

type ActivityResponse struct {
	ID         string          `json:"id"`
	GroupID    string          `json:"group_id"`
	GroupName  string          `json:"group_name,omitempty"`
	ActorID    string          `json:"actor_id"`
	ActorName  string          `json:"actor_name"`
	EventType  string          `json:"event_type"`
	EntityID   *string         `json:"entity_id,omitempty"`
	EntityType *string         `json:"entity_type,omitempty"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

func parsePaging(r *http.Request) (limit, offset int32) {
	limit = 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	offset = 0
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = int32(n)
		}
	}
	return
}

// ListMyActivity returns recent activity across every group the user belongs
// to. Supports `?limit=` (default 50, max 200) and `?offset=` for paging.
func (h *ActivityHandler) ListMyActivity(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	limit, offset := parsePaging(r)

	rows, err := h.queries.ListActivityForUser(r.Context(), db.ListActivityForUserParams{
		UserID: pgtype.Text{String: claims.UserID, Valid: true},
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := make([]ActivityResponse, 0, len(rows))
	for _, a := range rows {
		item := ActivityResponse{
			ID:        a.ID,
			GroupID:   a.GroupID,
			GroupName: a.GroupName,
			ActorID:   a.ActorID,
			ActorName: a.ActorName,
			EventType: a.EventType,
			CreatedAt: a.CreatedAt.Time,
		}
		if a.EntityID.Valid {
			s := a.EntityID.String
			item.EntityID = &s
		}
		if a.EntityType.Valid {
			s := a.EntityType.String
			item.EntityType = &s
		}
		if len(a.Payload) > 0 {
			item.Payload = json.RawMessage(a.Payload)
		}
		resp = append(resp, item)
	}

	writeJSON(w, http.StatusOK, resp)
}

// ListGroupActivity returns activity for a single group, newest first. The
// caller must be a member of the group (403 otherwise). Supports `?limit=`
// (default 50, max 200) and `?offset=` for paging.
func (h *ActivityHandler) ListGroupActivity(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	// Auth: must be a member of the group.
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
		return
	}

	limit, offset := parsePaging(r)
	rows, err := h.queries.ListActivityByGroupWithActor(r.Context(), db.ListActivityByGroupWithActorParams{
		GroupID: groupID,
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp := make([]ActivityResponse, 0, len(rows))
	for _, a := range rows {
		item := ActivityResponse{
			ID:        a.ID,
			GroupID:   a.GroupID,
			ActorID:   a.ActorID,
			ActorName: a.ActorName,
			EventType: a.EventType,
			CreatedAt: a.CreatedAt.Time,
		}
		if a.EntityID.Valid {
			s := a.EntityID.String
			item.EntityID = &s
		}
		if a.EntityType.Valid {
			s := a.EntityType.String
			item.EntityType = &s
		}
		if len(a.Payload) > 0 {
			item.Payload = json.RawMessage(a.Payload)
		}
		resp = append(resp, item)
	}

	writeJSON(w, http.StatusOK, resp)
}
