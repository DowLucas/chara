package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	_ "image/gif" // not allowed for upload but harmless to register for decode-mismatch detection
	"image/jpeg"
	_ "image/png"
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
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/storage"
	"github.com/DowLucas/chara/internal/ulid"
)

type AvatarHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	store   *storage.Client
}

func NewAvatarHandler(pool *pgxpool.Pool, queries *db.Queries, store *storage.Client) *AvatarHandler {
	return &AvatarHandler{pool: pool, queries: queries, store: store}
}

const (
	// 5 MB cap on the decoded image. Avatars don't need to be large — we
	// resize them down to 512x512 anyway — and a smaller cap reduces the
	// abuse surface.
	maxAvatarBytes = 5 * 1024 * 1024
	avatarMaxDim   = 512
	avatarJPEGQ    = 85
)

// avatarURL is the API-relative path used by the client to fetch a user's
// avatar bytes. We proxy through the backend instead of exposing the bucket
// so we can enforce the group-mate access check on every read.
func avatarURL(userID string) string {
	return "/api/users/" + userID + "/avatar"
}

// avatarAllowedMimeTypes is the upload whitelist. Output is always JPEG.
var avatarAllowedMimeTypes = map[string]struct{}{
	"image/jpeg": {},
	"image/png":  {},
	"image/webp": {},
}

type uploadAvatarRequest struct {
	ImageBase64 string `json:"image_base64"`
	MimeType    string `json:"mime_type"`
}

type AvatarUploadResponse struct {
	URL       string    `json:"url"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Upload accepts a base64 image, sanitises it (decode + re-encode strips EXIF
// and defeats polyglot attacks), resizes it to a square 512x512 JPEG, and
// replaces any existing avatar for the caller.
func (h *AvatarHandler) Upload(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	var req uploadAvatarRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(maxAvatarBytes)*2))
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	mime := strings.ToLower(strings.TrimSpace(req.MimeType))
	if _, ok := avatarAllowedMimeTypes[mime]; !ok {
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
	if len(data) > maxAvatarBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "image exceeds 5 MB")
		return
	}

	// Content sniff must match the supplied mime. Defends against a caller
	// claiming image/jpeg while sending PNG bytes (or anything else).
	sniffLen := 512
	if len(data) < sniffLen {
		sniffLen = len(data)
	}
	sniffed := http.DetectContentType(data[:sniffLen])
	if !mimeMatches(sniffed, mime) {
		writeError(w, http.StatusBadRequest, "image content does not match mime_type")
		return
	}

	// Decode through Go's image package. This is the polyglot defense:
	// any payload that doesn't parse as a real raster image is rejected,
	// and re-encoding strips any EXIF / arbitrary chunks the source had.
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not decode image")
		return
	}

	jpegBytes, err := normalizeAvatar(src)
	if err != nil {
		slog.Error("avatar normalize failed", "user", claims.UserID, "err", err)
		writeError(w, http.StatusInternalServerError, "could not process image")
		return
	}

	// Record the previous key BEFORE overwriting so we can best-effort
	// delete the old object after the DB update commits.
	var prevKey string
	if prev, err := h.queries.GetUserByID(r.Context(), claims.UserID); err == nil && prev.AvatarObjectKey.Valid {
		prevKey = prev.AvatarObjectKey.String
	}

	key := "avatars/" + claims.UserID + "/" + ulid.New() + ".jpg"
	if err := h.store.Upload(r.Context(), key, jpegBytes, "image/jpeg"); err != nil {
		slog.Error("avatar upload failed", "user", claims.UserID, "err", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	user, err := h.queries.SetUserAvatar(r.Context(), db.SetUserAvatarParams{
		ID:              claims.UserID,
		AvatarObjectKey: pgtype.Text{String: key, Valid: true},
	})
	if err != nil {
		_ = h.store.Delete(context.Background(), key)
		slog.Error("avatar db update failed", "user", claims.UserID, "err", err)
		writeError(w, http.StatusInternalServerError, "could not record avatar")
		return
	}

	if prevKey != "" && prevKey != key {
		if delErr := h.store.Delete(context.Background(), prevKey); delErr != nil {
			slog.Warn("avatar: previous object delete failed", "key", prevKey, "err", delErr)
		}
	}

	writeJSON(w, http.StatusOK, AvatarUploadResponse{
		URL:       avatarURL(claims.UserID),
		UpdatedAt: user.AvatarUpdatedAt.Time,
	})
}

// Delete clears the caller's avatar. Idempotent — returns 204 even when no
// avatar was set so the client can call it blindly.
func (h *AvatarHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}

	var prevKey string
	if prev, err := h.queries.GetUserByID(r.Context(), claims.UserID); err == nil && prev.AvatarObjectKey.Valid {
		prevKey = prev.AvatarObjectKey.String
	}

	if _, err := h.queries.ClearUserAvatar(r.Context(), claims.UserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		slog.Error("avatar clear failed", "user", claims.UserID, "err", err)
		writeError(w, http.StatusInternalServerError, "could not clear avatar")
		return
	}

	if prevKey != "" {
		if delErr := h.store.Delete(context.Background(), prevKey); delErr != nil {
			slog.Warn("avatar: object delete failed", "key", prevKey, "err", delErr)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// Get proxies the avatar bytes back to the caller. The caller must be the
// target user OR share at least one group with the target — otherwise we
// return 404 (not 403) to avoid leaking the existence of the user.
func (h *AvatarHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		writeError(w, http.StatusNotFound, "no avatar")
		return
	}

	if targetID != claims.UserID {
		shares, err := h.queries.UsersShareGroup(r.Context(), db.UsersShareGroupParams{
			UserID:   pgtype.Text{String: claims.UserID, Valid: true},
			UserID_2: pgtype.Text{String: targetID, Valid: true},
		})
		if err != nil {
			slog.Error("avatar: share-group lookup failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !shares {
			writeError(w, http.StatusNotFound, "no avatar")
			return
		}
	}

	target, err := h.queries.GetUserByID(r.Context(), targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "no avatar")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !target.AvatarObjectKey.Valid || target.AvatarObjectKey.String == "" {
		writeError(w, http.StatusNotFound, "no avatar")
		return
	}

	sum := sha256.Sum256([]byte(targetID + "|" + target.AvatarObjectKey.String))
	etag := `"` + hex.EncodeToString(sum[:])[:16] + `"`
	if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNotModified)
		return
	}

	obj, err := h.store.Open(r.Context(), target.AvatarObjectKey.String)
	if err != nil {
		slog.Warn("avatar open failed", "key", target.AvatarObjectKey.String, "err", err)
		writeError(w, http.StatusBadGateway, "could not load avatar")
		return
	}
	defer obj.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	if obj.Size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.Header().Set("ETag", etag)
	if _, err := io.Copy(w, obj); err != nil {
		slog.Warn("avatar stream failed", "key", target.AvatarObjectKey.String, "err", err)
	}
}

// mimeMatches compares the sniffed content type to the user-supplied one.
// http.DetectContentType may append parameters (e.g. "image/jpeg; ...") and
// some encoders prefer "image/jpg" — normalise both before comparing.
func mimeMatches(sniffed, claimed string) bool {
	norm := func(s string) string {
		s = strings.ToLower(strings.TrimSpace(s))
		if i := strings.Index(s, ";"); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
		if s == "image/jpg" {
			return "image/jpeg"
		}
		return s
	}
	return norm(sniffed) == norm(claimed)
}

// normalizeAvatar produces our uniform output: square, 512x512 max, JPEG
// quality 85, no metadata. Centre-crops to a square based on the smaller
// dimension then scales down (never up) using a high-quality kernel.
func normalizeAvatar(src image.Image) ([]byte, error) {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	side := w
	if h < side {
		side = h
	}
	if side <= 0 {
		return nil, errors.New("avatar: image has zero dimension")
	}

	offX := b.Min.X + (w-side)/2
	offY := b.Min.Y + (h-side)/2
	square := image.NewRGBA(image.Rect(0, 0, side, side))
	draw.Draw(square, square.Bounds(), src, image.Point{X: offX, Y: offY}, draw.Src)

	target := side
	if target > avatarMaxDim {
		target = avatarMaxDim
	}
	dst := image.NewRGBA(image.Rect(0, 0, target, target))
	draw.CatmullRom.Scale(dst, dst.Bounds(), square, square.Bounds(), draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: avatarJPEGQ}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
