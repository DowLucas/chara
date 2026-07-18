package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/DowLucas/chara/internal/billing"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/receipt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// MaxReceiptImageBytes caps the decoded image size sent to Gemini. ~6 MB is
// well above what a JPEG from a phone camera produces at sensible quality
// and well under Gemini's per-request inline-data limit.
const MaxReceiptImageBytes = 6 * 1024 * 1024

// OCRFeatureKey is the usage_counters.feature identifier for OCR scans.
const OCRFeatureKey = "ocr"

// ReceiptHandler implements the /api/receipts/scan endpoint. The counter
// is optional: when nil (e.g. self-hosted instances where the operator
// pays the Gemini bill), the handler skips all metering. When non-nil, it
// reserves a slot before each scan and refunds on downstream failure.
type ReceiptHandler struct {
	scanner   receipt.Scanner
	counter   *billing.Counter
	freeCap   int
	overrides CapOverrides
	groups    GroupCategoriesLookup
}

// CapOverrides resolves a per-user OCR cap override. The billing counter
// already takes the cap as a per-call argument; this is the per-user lookup
// the global FreeOCRCap always anticipated. *db.Queries satisfies it.
type CapOverrides interface {
	GetOCRCapOverride(ctx context.Context, userID string) (pgtype.Int4, error)
}

// GroupCategoriesLookup resolves a group's configured (or default) category
// catalog, used to restrict the AI's category guess to categories the group
// actually has enabled. userID must be a member of groupID — implementations
// reject (and callers should fail open, not 403) otherwise, so a client can't
// probe another group's category configuration via group_id. Use
// [NewGroupCategoriesLookup] to adapt *db.Queries.
type GroupCategoriesLookup interface {
	GetGroupCategorySlugs(ctx context.Context, groupID, userID string) ([]string, error)
}

// dbGroupCategories adapts *db.Queries to GroupCategoriesLookup.
type dbGroupCategories struct{ queries *db.Queries }

// NewGroupCategoriesLookup wires the real DB-backed lookup for production use.
func NewGroupCategoriesLookup(queries *db.Queries) GroupCategoriesLookup {
	return dbGroupCategories{queries: queries}
}

func (d dbGroupCategories) GetGroupCategorySlugs(ctx context.Context, groupID, userID string) ([]string, error) {
	if _, err := d.queries.GetGroupMemberByUserAndGroup(ctx, db.GetGroupMemberByUserAndGroupParams{
		GroupID: groupID,
		UserID:  pgtype.Text{String: userID, Valid: true},
	}); err != nil {
		return nil, err
	}
	g, err := d.queries.GetGroupByID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	return resolveCategorySlugs(g.CategorySlugs), nil
}

func NewReceiptHandler(scanner receipt.Scanner) *ReceiptHandler {
	return &ReceiptHandler{scanner: scanner}
}

// WithCounter wires the anti-abuse / paywall counter. cap is the free-tier
// monthly limit; v1.0 hosted = 3. Pass nil counter to disable metering
// entirely (selfhost behavior). Returns the receiver for chaining.
func (h *ReceiptHandler) WithCounter(counter *billing.Counter, cap int) *ReceiptHandler {
	h.counter = counter
	h.freeCap = cap
	return h
}

// WithCapOverrides wires the per-user cap lookup. Only consulted when a
// counter is set (hosted instances). Returns the receiver for chaining.
func (h *ReceiptHandler) WithCapOverrides(o CapOverrides) *ReceiptHandler {
	h.overrides = o
	return h
}

// WithGroupCategories wires the group-category lookup used to restrict the
// AI's category guess to the requesting group's configured catalog. Optional
// — without it (or without a group_id on the request), the scanner falls
// back to the full default catalog. Returns the receiver for chaining.
func (h *ReceiptHandler) WithGroupCategories(g GroupCategoriesLookup) *ReceiptHandler {
	h.groups = g
	return h
}

type scanRequest struct {
	ImageBase64 string `json:"image_base64"`
	MIMEType    string `json:"mime_type"`
	// Language is the ISO 639-1 code the AI should generate the title in.
	// Optional — empty means "use the receipt's own language". Callers
	// (typically the mobile app) pass the active group's language so all
	// members see the same title regardless of who scanned the receipt.
	Language string `json:"language"`
	// GroupID scopes the AI's category guess to that group's configured
	// category_slugs. Optional — omitted/unknown falls back to the full
	// default catalog rather than failing the scan.
	GroupID string `json:"group_id"`
}

type scanResponse struct {
	Title         string             `json:"title"`
	Merchant      string             `json:"merchant"`
	Date          string             `json:"date,omitempty"`
	Currency      string             `json:"currency"`
	// Category is one of the fixed EXPENSE_CATEGORIES ids the mobile app
	// renders, or omitted when the scanner had no confident guess.
	Category      string             `json:"category,omitempty"`
	TotalMinor    int64              `json:"total_minor"`
	SubtotalMinor int64              `json:"subtotal_minor,omitempty"`
	TaxMinor      int64              `json:"tax_minor,omitempty"`
	TipMinor      int64              `json:"tip_minor,omitempty"`
	// DepositMinor is container deposit ("pant") included in the total but
	// not in Items. Clients offer it as an evenly-shared extra charge.
	DepositMinor  int64              `json:"deposit_minor,omitempty"`
	Items         []scanResponseItem `json:"items,omitempty"`

	// Hosted-only fields. Omitted on selfhost instances where the counter
	// is disabled. The client uses these to update its cached counter
	// display and decide whether to surface upsells in the future.
	Tier           string `json:"tier,omitempty"`
	Remaining      *int   `json:"remaining,omitempty"`
	PeriodResetsAt string `json:"period_resets_at,omitempty"`
}

type scanResponseItem struct {
	Description    string `json:"description"`
	Qty            int    `json:"qty"`
	UnitPriceMinor int64  `json:"unit_price_minor"`
	TotalMinor     int64  `json:"total_minor"`
}

// capReachedResponse is the structured 429 body. The client recognises
// `code` to switch from a generic error toast to the waitlist modal.
type capReachedResponse struct {
	Code           string `json:"code"`
	Message        string `json:"message"`
	Remaining      int    `json:"remaining"`
	PeriodResetsAt string `json:"period_resets_at"`
	WaitlistPrompt bool   `json:"waitlist_prompt"`
}

var allowedReceiptMIME = map[string]struct{}{
	"image/jpeg": {},
	"image/jpg":  {},
	"image/png":  {},
	"image/webp": {},
	"image/heic": {},
	"image/heif": {},
}

// Scan handles POST /api/receipts/scan.
func (h *ReceiptHandler) Scan(w http.ResponseWriter, r *http.Request) {
	// Cap the raw request body BEFORE json.Decode. Without this, a 100 MB
	// JSON body would be fully buffered into the image_base64 string field
	// — a trivial OOM vector. The factor of 2 accounts for base64 overhead
	// (~33%) plus a small allowance for JSON envelope.
	r.Body = http.MaxBytesReader(w, r.Body, int64(MaxReceiptImageBytes)*2)

	var req scanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.ImageBase64 == "" {
		writeError(w, http.StatusBadRequest, "image_base64 is required")
		return
	}
	if req.MIMEType == "" {
		req.MIMEType = "image/jpeg"
	}
	if _, ok := allowedReceiptMIME[strings.ToLower(req.MIMEType)]; !ok {
		writeError(w, http.StatusBadRequest, "unsupported mime_type")
		return
	}

	// Strip any data-URL prefix the client might send by accident.
	b64 := req.ImageBase64
	if i := strings.Index(b64, ","); strings.HasPrefix(b64, "data:") && i > 0 {
		b64 = b64[i+1:]
	}

	imgData, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "image_base64 is not valid base64")
		return
	}
	if len(imgData) == 0 {
		writeError(w, http.StatusBadRequest, "image_base64 decoded to zero bytes")
		return
	}
	if len(imgData) > MaxReceiptImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "image exceeds 6 MB limit")
		return
	}

	// Extracted unconditionally: billing (below) only needs it when a
	// counter is configured, but the group-category lookup needs it
	// regardless of billing mode, to verify group membership.
	claims := middleware.ClaimsFromContext(r.Context())

	// Reserve a slot before invoking Gemini. Without a counter (selfhost
	// or unit tests), the reservation is nil and there's nothing to refund.
	// `metered` tracks whether this request actually consumed a slot — an
	// unlimited user (negative override) is hosted but bypasses metering, so
	// its response omits the billing fields just like selfhost.
	var reservation *billing.Reservation
	var meterResult billing.Result
	var metered bool
	if h.counter != nil {
		if claims == nil || claims.UserID == "" {
			writeError(w, http.StatusUnauthorized, "missing user context")
			return
		}

		cap := h.freeCap
		unlimited := false
		if h.overrides != nil {
			ov, oErr := h.overrides.GetOCRCapOverride(r.Context(), claims.UserID)
			if oErr != nil && !errors.Is(oErr, pgx.ErrNoRows) {
				writeError(w, http.StatusInternalServerError, "usage counter unavailable")
				return
			}
			if ov.Valid {
				if ov.Int32 < 0 {
					unlimited = true
				} else {
					cap = int(ov.Int32)
				}
			}
		}

		if !unlimited {
			res, mErr := h.counter.Reserve(r.Context(), claims.UserID, OCRFeatureKey, cap)
			if mErr != nil {
				writeError(w, http.StatusInternalServerError, "usage counter unavailable")
				return
			}
			if !res.Allowed {
				writeCapReached(w, res)
				return
			}
			reservation = res.Reservation
			meterResult = res
			metered = true
		}
	}

	var allowedCategories []string
	if req.GroupID != "" && h.groups != nil && claims != nil && claims.UserID != "" {
		if slugs, err := h.groups.GetGroupCategorySlugs(r.Context(), req.GroupID, claims.UserID); err == nil {
			allowedCategories = slugs
		}
		// A lookup failure — unknown/deleted group, the caller isn't a
		// member (GetGroupMemberByUserAndGroup returns ErrNoRows), or a
		// transient DB error — falls back to the full default catalog
		// rather than failing the scan. The category guess is advisory,
		// not load-bearing, and this keeps "not a member" indistinguishable
		// from "unknown group" so group_id can't be used to probe another
		// group's category configuration.
	}

	res, scanErr := h.scanner.Scan(r.Context(), imgData, req.MIMEType, req.Language, allowedCategories)
	if scanErr != nil {
		// Free the slot we reserved so the user isn't billed for a failure.
		if reservation != nil {
			// Use a fresh context to make sure the refund still fires if the
			// caller already cancelled the request.
			_ = h.counter.Refund(context.Background(), *reservation)
		}
		if errors.Is(scanErr, receipt.ErrUnreadable) {
			writeError(w, http.StatusUnprocessableEntity, "could not read a receipt from this image")
			return
		}
		// Log the detail server-side only: a transport error can embed the
		// request URL (and anything it carries) in its message, which must
		// never reach the client.
		slog.Error("receipts: scan failed", "error", scanErr)
		writeError(w, http.StatusBadGateway, "receipt scanner failed")
		return
	}

	var items []scanResponseItem
	if len(res.Items) > 0 {
		items = make([]scanResponseItem, len(res.Items))
		for i, it := range res.Items {
			items[i] = scanResponseItem{
				Description:    it.Description,
				Qty:            it.Qty,
				UnitPriceMinor: int64(it.UnitPriceMinor),
				TotalMinor:     int64(it.TotalMinor),
			}
		}
	}

	body := scanResponse{
		Title:         res.Title,
		Merchant:      res.Merchant,
		Date:          res.Date,
		Currency:      res.Currency,
		Category:      res.Category,
		TotalMinor:    int64(res.TotalMinor),
		SubtotalMinor: int64(res.SubtotalMinor),
		TaxMinor:      int64(res.TaxMinor),
		TipMinor:      int64(res.TipMinor),
		DepositMinor:  int64(res.DepositMinor),
		Items:         items,
	}
	if metered {
		remaining := meterResult.Remaining
		body.Tier = "free"
		body.Remaining = &remaining
		body.PeriodResetsAt = meterResult.PeriodResetsAt.UTC().Format("2006-01-02T15:04:05Z")
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func writeCapReached(w http.ResponseWriter, res billing.Result) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(capReachedResponse{
		Code:           "ocr_cap_reached",
		Message:        "You've reached the free OCR scan limit for this month.",
		Remaining:      res.Remaining,
		PeriodResetsAt: res.PeriodResetsAt.UTC().Format("2006-01-02T15:04:05Z"),
		WaitlistPrompt: true,
	})
}
