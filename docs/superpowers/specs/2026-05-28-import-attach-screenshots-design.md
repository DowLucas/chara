# Import — attach source screenshots to opening-balance expenses

**Date:** 2026-05-28
**Status:** Approved, pending implementation
**Builds on:** `docs/superpowers/specs/2026-05-28-import-from-another-app-design.md`

## Problem

When a user imports balances from another app, the commit step creates one
"Opening balance" expense per counterparty but keeps no record of *where those
numbers came from*. The screenshots the user captured are sent to `/extract`,
read once, and discarded. There is no audit trail linking an imported balance
to its source.

## Goal

When import commit creates the opening-balance expenses, **merge the captured
screenshots into a single image and attach a copy to every created expense** as
a receipt, using the existing expense-attachment system.

## Decisions

- **Attach target:** every imported opening-balance expense gets its **own
  copy** of the merged image (each expense is independently traceable). One
  merge, N uploads, N attachment rows.
- **Merge location:** server-side, during commit. Rejected client-side merge
  (React Native cannot composite multiple images without significant tooling)
  and keeps the weakest layer thin.
- **Merge format:** a single vertically-stacked **JPEG**. It is in the
  attachment MIME allowlist (`image/jpeg`), renders inline in the existing
  receipt viewer, and needs no new dependency. Rejected PDF (would add a lib).
- **Failure handling:** best-effort. Attachment failures are logged and never
  roll back the imported balances. Mirrors `add-expense`'s receipt-upload
  behavior.

## Architecture

### 1. Wire change — commit carries the images (additive, optional)

`importCommitReq` gains an optional field:

```go
type importCommitReq struct {
    Source    string                    `json:"source"`
    Standings []importCommitStandingReq `json:"standings"`
    Images    []importImageReq          `json:"images"` // optional; reuses the extract image shape
}
```

The client (`app/app/groups/[server]/[id]/import/[source].tsx`, `runCommit`)
sends the same tray images it captured — they remain in component state through
the review step. `api.importCommit` adds an `images` parameter.

The field is **optional**: additive, so no `PROTOCOL_VERSION` bump
(per the multi-server compat rules in CLAUDE.md). Older clients that omit it
simply get no attachment.

The commit handler wraps the body in `http.MaxBytesReader` with the same cap
the extract endpoint uses (`maxImportRequestBytes`), since the payload now
carries images.

### 2. Merge helper — `internal/importer`

New pure function:

```go
// MergeImagesVertically decodes each image (jpeg/png), stacks them top-to-
// bottom at a uniform width, and encodes the result as JPEG, downscaling /
// stepping quality as needed to stay under maxBytes. Returns the encoded
// bytes. No DB, no model.
func MergeImagesVertically(images []Image, maxBytes int) ([]byte, error)
```

- Target width = `min(widest input, 1080px)`. Every image is scaled to that
  width preserving aspect ratio; the stacked height is the sum of the scaled
  heights. The 1080px ceiling bounds output size for high-DPI screenshots.
- Output: `image/jpeg`. Encodes at a starting quality; if the result exceeds
  `maxBytes`, reduce dimensions/quality and re-encode until it fits or a floor
  is hit.
- Empty input → error. Single image → that image re-encoded as JPEG.
- Unit-tested independently of the handler.

### 3. Attach during commit — after the transaction

`Commit` already obtains each created expense's ID from `expense.Create`.
Updated flow:

1. Run the existing all-or-nothing expense transaction; **collect the created
   expense IDs** (already returned, currently discarded).
2. `tx.Commit`.
3. **Best-effort attachment** (only if `h.store != nil` and `len(req.Images) > 0`):
   - Decode/validate the images (same caps as extract: ≤10 images, ≤5 MB each).
   - `merged, err := MergeImagesVertically(images, maxAttachmentBytes)`.
   - For each created expense ID:
     - `key := "expenses/" + expenseID + "/" + ulid.New() + ".jpg"`
     - `store.Upload(ctx, key, merged, "image/jpeg")`
     - `queries.CreateExpenseAttachment(...)` with `MimeType: "image/jpeg"`,
       `SizeBytes: len(merged)`.
   - On any per-step failure: log via `slog`, continue. Do not fail the request.
4. Response is unchanged: `201 {"imported": N}`.

### 4. Handler dependency

`ImportHandler` gains `store *storage.Client`:

```go
func NewImportHandler(pool *pgxpool.Pool, queries *db.Queries,
    extractor importer.Extractor, store *storage.Client) *ImportHandler
```

`server.go` passes the existing `store` (already constructed for the attachment
handler). `store` is **nil** when object storage is not configured — the same
value that gates the attachment routes today (`if store != nil`). The import
handler checks `h.store == nil` and skips attachments in that case (the import
itself still works). `NewWithImport` test seam updated to pass a store.

## Data flow

```
capture screenshots ──► (state) ──► review ──► commit { standings, images }
                                                   │
                                   tx: create N opening-balance expenses
                                                   │ commit
                                                   ▼
                            merge images → 1 JPEG (≤6 MB)
                                                   │
                          for each expense: upload copy + attachment row
                                                   ▼
                                         201 { imported: N }
```

## Error handling

| Condition | Behavior |
|---|---|
| No `images` in request | Import succeeds, no attachments. |
| Storage not configured | Import succeeds, no attachments. |
| Merge fails (bad/undecodable image) | Log, import succeeds, no attachments. |
| One upload/insert fails | Log that one, continue with the rest; import succeeds. |
| Expense transaction fails | Existing behavior: 500, nothing created, nothing attached. |

Attachment work happens **after** the balance transaction commits, so a storage
problem can never lose the imported balances.

## Testing (TDD)

**`importer` unit tests (`merge_test.go`):**
- Two PNGs of known sizes → valid JPEG; decoded height ≈ sum of (scaled) input
  heights; width = target width.
- Single image → valid JPEG.
- Empty slice → error.
- Oversized inputs → output bytes ≤ `maxBytes`.

**Handler tests (`import_test.go`, fake extractor + storage):**
- Commit *with* images and storage → N expenses **and** N attachments (one per
  expense), each `image/jpeg`.
- Commit *without* images → N expenses, 0 attachments, `201`.
- Commit *with* images but storage disabled → N expenses, 0 attachments, `201`.
- A failing upload for one expense does not fail the request or block the others.

## Out of scope

- Changing the `/extract` step or the extraction prompts.
- De-duplicating the stored copies (shared S3 key across rows).
- PDF output.
- Attaching anything to manually-created (non-import) expenses.
