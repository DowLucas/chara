package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/expense"
	"github.com/DowLucas/chara/internal/importer"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/split"
	"github.com/DowLucas/chara/internal/ulid"
)

// Import caps. The extract endpoint runs a synchronous vision call per image,
// so both the count and per-image size are bounded for cost/latency.
const (
	MaxImportImages       = 10
	MaxImportImageBytes   = 5 * 1024 * 1024
	maxImportRequestBytes = MaxImportImages * MaxImportImageBytes * 2 // base64 + envelope slack
)

// ImportHandler implements the "import from another app" extract + commit
// endpoints. extractor is nil on instances without a vision provider — the
// extract endpoint returns 404 there, but commit still works (it never touches
// the extractor).
type ImportHandler struct {
	queries   *db.Queries
	pool      *pgxpool.Pool
	extractor importer.Extractor
}

func NewImportHandler(pool *pgxpool.Pool, queries *db.Queries, extractor importer.Extractor) *ImportHandler {
	return &ImportHandler{queries: queries, pool: pool, extractor: extractor}
}

// ── extract ──────────────────────────────────────────────────────────────────

type importImageReq struct {
	ImageBase64 string `json:"image_base64"`
	MIMEType    string `json:"mime_type"`
}

type importExtractReq struct {
	Source string           `json:"source"`
	Images []importImageReq `json:"images"`
}

// Extract handles POST /api/groups/{groupID}/import/extract.
func (h *ImportHandler) Extract(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")

	if _, ok := requireGroupMember(r.Context(), h.queries, w, groupID); !ok {
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
	if h.extractor == nil {
		writeError(w, http.StatusNotFound, "import extraction is not enabled on this instance")
		return
	}

	// Cap the raw body before decode so a huge payload can't OOM us.
	r.Body = http.MaxBytesReader(w, r.Body, int64(maxImportRequestBytes))

	var req importExtractReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.Images) == 0 {
		writeError(w, http.StatusBadRequest, "at least one image is required")
		return
	}
	if len(req.Images) > MaxImportImages {
		writeError(w, http.StatusBadRequest, "too many images (max 10)")
		return
	}

	images := make([]importer.Image, 0, len(req.Images))
	for _, raw := range req.Images {
		if raw.ImageBase64 == "" {
			writeError(w, http.StatusBadRequest, "image_base64 is required")
			return
		}
		b64 := raw.ImageBase64
		if i := strings.Index(b64, ","); strings.HasPrefix(b64, "data:") && i > 0 {
			b64 = b64[i+1:]
		}
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "image_base64 is not valid base64")
			return
		}
		if len(data) == 0 {
			writeError(w, http.StatusBadRequest, "image decoded to zero bytes")
			return
		}
		if len(data) > MaxImportImageBytes {
			writeError(w, http.StatusRequestEntityTooLarge, "image exceeds 5 MB limit")
			return
		}
		images = append(images, importer.Image{Data: data, MIMEType: raw.MIMEType})
	}

	// The extractor bounds its own concurrency + overall deadline so this call
	// stays inside the server's write timeout. A non-nil error means every
	// image failed (bad key / quota / unreadable) → 502, never an empty 200.
	out, err := h.extractor.Extract(r.Context(), images, req.Source)
	if err != nil {
		writeError(w, http.StatusBadGateway, "extraction failed")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// ── commit ───────────────────────────────────────────────────────────────────

type importCommitStandingReq struct {
	Name      string       `json:"name"`
	Direction string       `json:"direction"` // "owes_you" | "you_owe"
	Amount    money.Amount `json:"amount"`
	Title     string       `json:"title"`
}

type importCommitReq struct {
	Source    string                    `json:"source"`
	Standings []importCommitStandingReq `json:"standings"`
}

// Commit handles POST /api/groups/{groupID}/import/commit. For each extracted
// standing it resolves the counterparty by name (existing member or a freshly
// minted placeholder) and creates one opening-balance expense reproducing that
// net balance — all in one transaction, all-or-nothing.
//
//	owes_you → paid_by = importer, participants = [counterparty]
//	you_owe  → paid_by = counterparty, participants = [importer]
func (h *ImportHandler) Commit(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	claims := middleware.ClaimsFromContext(r.Context())

	if _, ok := requireGroupMember(r.Context(), h.queries, w, groupID); !ok {
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

	var req importCommitReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.Standings) == 0 {
		writeError(w, http.StatusBadRequest, "at least one standing is required")
		return
	}

	group, err := h.queries.GetGroupByID(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load group")
		return
	}

	// Validate every row up front so we fail with a clean 400 before opening
	// the transaction.
	for _, s := range req.Standings {
		if strings.TrimSpace(s.Name) == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if s.Direction != importer.DirectionOwesYou && s.Direction != importer.DirectionYouOwe {
			writeError(w, http.StatusBadRequest, "direction must be owes_you or you_owe")
			return
		}
		if s.Amount <= 0 {
			writeError(w, http.StatusBadRequest, "amount must be positive")
			return
		}
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "import"
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	qtx := h.queries.WithTx(tx)

	// Resolve the importing user's OWN member in this group (already known to
	// exist from requireGroupMember, but re-fetched on the tx for consistency).
	importerMember, err := qtx.GetGroupMemberByUserAndGroup(r.Context(), db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: claims.UserID, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not resolve importing member")
		return
	}

	// Fetch members ONCE into a case-insensitive name→id map (no per-row N+1).
	members, err := qtx.ListGroupMembers(r.Context(), groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load members")
		return
	}
	byName := make(map[string]string, len(members))
	for _, m := range members {
		byName[strings.ToLower(strings.TrimSpace(m.Name))] = m.ID
	}

	for _, s := range req.Standings {
		name := strings.TrimSpace(s.Name)
		key := strings.ToLower(name)

		// Resolve counterparty → existing member or new placeholder.
		counterpartyID, ok := byName[key]
		if !ok {
			placeholder, err := qtx.CreateGroupMember(r.Context(), db.CreateGroupMemberParams{
				ID:      ulid.New(),
				GroupID: groupID,
				UserID:  pgtype.Text{}, // NULL
				Name:    name,
				Role:    "member",
				IsGhost: true,
			})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not create placeholder member")
				return
			}
			counterpartyID = placeholder.ID
			byName[key] = counterpartyID
		}

		// owes_you: importer paid, counterparty owes the full amount.
		// you_owe:  counterparty paid, importer owes the full amount.
		var payerID string
		var participant string
		if s.Direction == importer.DirectionOwesYou {
			payerID = importerMember.ID
			participant = counterpartyID
		} else {
			payerID = counterpartyID
			participant = importerMember.ID
		}

		if err := validateMembersInGroup(r.Context(), qtx, []string{payerID, participant}, groupID); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		shares, err := split.Equal(s.Amount, []string{participant})
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		title := strings.TrimSpace(s.Title)
		if title == "" {
			title = "Opening balance"
		}

		if _, err := expense.Create(r.Context(), tx, h.queries, expense.Input{
			GroupID:         groupID,
			Title:           title,
			AmountMinor:     int64(s.Amount),
			Currency:        group.Currency,
			PaidByMemberID:  payerID,
			SplitMethod:     "equal",
			Splits:          sharesToSplitInputs(shares),
			Category:        "general",
			ExpenseDate:     time.Now(),
			CreatedByUserID: claims.UserID,
			ImportSource:    &source,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "could not create expense")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]int{"imported": len(req.Standings)})
}
