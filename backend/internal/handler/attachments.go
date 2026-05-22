package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/storage"
	"github.com/DowLucas/chara/internal/ulid"
)

type AttachmentHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	store   *storage.Client
}

func NewAttachmentHandler(pool *pgxpool.Pool, queries *db.Queries, store *storage.Client) *AttachmentHandler {
	return &AttachmentHandler{pool: pool, queries: queries, store: store}
}

const (
	// 6 MB limit on the decoded image to match what /api/receipts/scan
	// accepts. Anything larger almost certainly isn't a receipt photo and
	// would just inflate our bucket.
	maxAttachmentBytes = 6 * 1024 * 1024
)

// attachmentURL returns the API-relative path the client uses to fetch the
// receipt bytes. We proxy through the backend rather than handing out
// presigned MinIO URLs because (a) phones/emulators can't reach the
// bucket host when MinIO is on localhost in compose, and (b) it keeps
// bucket credentials and topology private. The client prefixes its
// configured BASE_URL when fetching.
func attachmentURL(groupID, expenseID, attachmentID string) string {
	return "/api/groups/" + groupID + "/expenses/" + expenseID + "/attachments/" + attachmentID + "/content"
}

var allowedMimeTypes = map[string]string{
	"image/jpeg": "jpg",
	"image/jpg":  "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	"image/heic": "heic",
}

type uploadAttachmentRequest struct {
	// Receipt photo as a standard base64 string (no data: prefix). The
	// frontend already encodes this for /api/receipts/scan, so reusing
	// the same wire format lets the scanner upload immediately after
	// expense save without re-encoding.
	ImageBase64 string `json:"image_base64"`
	MimeType    string `json:"mime_type"`
}

type AttachmentResponse struct {
	ID        string    `json:"id"`
	ExpenseID string    `json:"expense_id"`
	MimeType  string    `json:"mime_type"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
	// URL is the API-relative path to the proxied /content route. The
	// client prefixes its configured BASE_URL and sends its Bearer token;
	// the backend re-checks group membership and streams the bytes.
	URL string `json:"url"`
}

// CreateAttachment uploads a receipt image to object storage and links it
// to the expense. The caller must be a member of the expense's group; we
// re-verify via requireGroupMember semantics through the embedded query.
func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")

	if !h.callerInGroup(r, groupID) {
		writeError(w, http.StatusForbidden, "not a member of this group")
		return
	}
	if !h.expenseInGroup(r.Context(), expenseID, groupID) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}

	var req uploadAttachmentRequest
	// Decoder with a generous-but-finite cap. Base64 is ~33% larger than
	// the decoded bytes, so cap the JSON body at maxAttachmentBytes * 2.
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(maxAttachmentBytes)*2))
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ext, ok := allowedMimeTypes[strings.ToLower(req.MimeType)]
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported mime_type")
		return
	}
	if req.ImageBase64 == "" {
		writeError(w, http.StatusBadRequest, "image_base64 is required")
		return
	}

	data, err := base64.StdEncoding.DecodeString(req.ImageBase64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "image_base64 is not valid base64")
		return
	}
	if len(data) == 0 {
		writeError(w, http.StatusBadRequest, "image is empty")
		return
	}
	if len(data) > maxAttachmentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "image exceeds 6 MB")
		return
	}

	id := ulid.New()
	// Key layout mirrors how the data is queried: by expense. The .ext
	// suffix is cosmetic — clients should rely on the content-type header,
	// not the URL — but it helps when poking at the bucket directly.
	key := "expenses/" + expenseID + "/" + id + "." + ext

	if err := h.store.Upload(r.Context(), key, data, req.MimeType); err != nil {
		slog.Error("attachment upload failed", "expense", expenseID, "err", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	row, err := h.queries.CreateExpenseAttachment(r.Context(), db.CreateExpenseAttachmentParams{
		ID:        id,
		ExpenseID: expenseID,
		S3Key:     key,
		MimeType:  req.MimeType,
		SizeBytes: int64(len(data)),
	})
	if err != nil {
		// Best-effort orphan cleanup so a half-failed insert doesn't leave
		// data in the bucket that nothing references. We don't surface the
		// cleanup error — the DB write is the user-visible failure.
		_ = h.store.Delete(context.Background(), key)
		slog.Error("attachment insert failed", "expense", expenseID, "err", err)
		writeError(w, http.StatusInternalServerError, "could not record attachment")
		return
	}

	writeJSON(w, http.StatusCreated, AttachmentResponse{
		ID:        row.ID,
		ExpenseID: row.ExpenseID,
		MimeType:  row.MimeType,
		SizeBytes: row.SizeBytes,
		CreatedAt: row.CreatedAt.Time,
		URL:       attachmentURL(groupID, expenseID, row.ID),
	})
}

// List returns every attachment for an expense with a presigned URL each.
// The list is small (1–2 receipts per expense in practice) so we don't
// paginate.
func (h *AttachmentHandler) List(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")

	if !h.callerInGroup(r, groupID) {
		writeError(w, http.StatusForbidden, "not a member of this group")
		return
	}
	if !h.expenseInGroup(r.Context(), expenseID, groupID) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}

	rows, err := h.queries.ListAttachmentsByExpense(r.Context(), expenseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list attachments")
		return
	}

	resp := make([]AttachmentResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, AttachmentResponse{
			ID:        row.ID,
			ExpenseID: row.ExpenseID,
			MimeType:  row.MimeType,
			SizeBytes: row.SizeBytes,
			CreatedAt: row.CreatedAt.Time,
			URL:       attachmentURL(groupID, expenseID, row.ID),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// Content streams the receipt bytes back to the client. Reuses the standard
// Authenticate middleware (the route is registered inside the authed group)
// so the caller's JWT is enforced. We re-check membership + that the
// attachment actually belongs to the expense+group so a leaked attachment
// id can't be used cross-group.
func (h *AttachmentHandler) Content(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")
	attachmentID := chi.URLParam(r, "attachmentID")

	if !h.callerInGroup(r, groupID) {
		writeError(w, http.StatusForbidden, "not a member of this group")
		return
	}
	if !h.expenseInGroup(r.Context(), expenseID, groupID) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}

	att, err := h.queries.GetExpenseAttachment(r.Context(), attachmentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "attachment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if att.ExpenseID != expenseID {
		// Cross-expense lookup attempt — same response as not-found so we
		// don't leak existence.
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}

	obj, err := h.store.Open(r.Context(), att.S3Key)
	if err != nil {
		slog.Warn("attachment open failed", "key", att.S3Key, "err", err)
		writeError(w, http.StatusBadGateway, "could not load attachment")
		return
	}
	defer obj.Close()

	// Prefer the DB-stored mime type (set by the client at upload) over the
	// one reported by the store — they should match, but the DB record is
	// the audit-of-record.
	w.Header().Set("Content-Type", att.MimeType)
	if obj.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	if _, err := io.Copy(w, obj); err != nil {
		slog.Warn("attachment stream failed", "key", att.S3Key, "err", err)
	}
}

// Delete removes an attachment from the bucket and the DB. Any group
// member may delete — attachments are a group resource, mirroring the
// existing expense edit permissions.
func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	expenseID := chi.URLParam(r, "expenseID")
	attachmentID := chi.URLParam(r, "attachmentID")

	if !h.callerInGroup(r, groupID) {
		writeError(w, http.StatusForbidden, "not a member of this group")
		return
	}
	if !h.expenseInGroup(r.Context(), expenseID, groupID) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}

	att, err := h.queries.GetExpenseAttachment(r.Context(), attachmentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "attachment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if att.ExpenseID != expenseID {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}

	if err := h.store.Delete(r.Context(), att.S3Key); err != nil {
		// Best-effort: log and keep going. A stale bucket object is
		// recoverable; a stale DB row is what the user sees.
		slog.Warn("attachment bucket delete failed", "key", att.S3Key, "err", err)
	}
	if err := h.queries.DeleteAttachment(r.Context(), attachmentID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete attachment")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AttachmentHandler) callerInGroup(r *http.Request, groupID string) bool {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		return false
	}
	_, err := h.queries.GetGroupMemberByUserAndGroup(r.Context(), db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
	})
	return err == nil
}

func (h *AttachmentHandler) expenseInGroup(ctx context.Context, expenseID, groupID string) bool {
	_, err := h.queries.GetExpenseByIDAndGroup(ctx, db.GetExpenseByIDAndGroupParams{
		ID:      expenseID,
		GroupID: groupID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false
		}
		slog.Warn("expense lookup failed", "expense", expenseID, "err", err)
		return false
	}
	return true
}
