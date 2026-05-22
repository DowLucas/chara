package handler

import (
	"net/http"
	"strconv"
	"time"

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
	ID         string    `json:"id"`
	GroupID    string    `json:"group_id"`
	GroupName  string    `json:"group_name"`
	ActorID    string    `json:"actor_id"`
	ActorName  string    `json:"actor_name"`
	EventType  string    `json:"event_type"`
	EntityID   *string   `json:"entity_id,omitempty"`
	EntityType *string   `json:"entity_type,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// ListMyActivity returns recent activity across every group the user belongs
// to. Supports `?limit=` (default 50, max 200) and `?offset=` for paging.
func (h *ActivityHandler) ListMyActivity(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	limit := int32(50)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	offset := int32(0)
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = int32(n)
		}
	}

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
		resp = append(resp, item)
	}

	writeJSON(w, http.StatusOK, resp)
}
