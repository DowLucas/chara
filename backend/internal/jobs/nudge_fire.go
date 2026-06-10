package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/push"
)

// NudgeFireArgs is one nudge for one (user, group) pair. The pair is the
// uniqueness key — re-enqueuing while a fire is in flight is a no-op via
// River's UniqueOpts, and the worker re-checks eligibility anyway.
type NudgeFireArgs struct {
	UserID  string `json:"user_id"`
	GroupID string `json:"group_id"`
}

func (NudgeFireArgs) Kind() string { return "nudge_fire" }

// NudgeFireWorker sends the "you still owe …" push for one pair.
// Idempotency: the eligibility re-check includes the repeat-window guard
// against balance_nudges, so a duplicate fire (or a retry after the upsert
// committed) silently no-ops.
type NudgeFireWorker struct {
	river.WorkerDefaults[NudgeFireArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Sender  push.Sender
	Cfg     NudgeConfig
}

func (w *NudgeFireWorker) Work(ctx context.Context, job *river.Job[NudgeFireArgs]) error {
	return w.fire(ctx, job.Args)
}

// NudgeFireForTest invokes the worker body directly, so tests don't need a
// running River client. Production goes through Work.
func NudgeFireForTest(ctx context.Context, w *NudgeFireWorker, args NudgeFireArgs) error {
	return w.fire(ctx, args)
}

func (w *NudgeFireWorker) fire(ctx context.Context, args NudgeFireArgs) error {
	if w.Cfg.ServerURL == "" {
		slog.Warn("nudge_fire: ServerURL (BASE_URL) is not configured; skipping")
		return nil
	}

	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("nudge_fire: begin tx: %w", err)
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)
	debts, err := q.SelectNudgeDebts(ctx, db.SelectNudgeDebtsParams{
		UserID:     pgtype.Text{String: args.UserID, Valid: true},
		GroupID:    args.GroupID,
		AfterDays:  int32(w.Cfg.AfterDays),
		RepeatDays: int32(w.Cfg.RepeatDays),
	})
	if err != nil {
		return fmt.Errorf("nudge_fire: re-check eligibility: %w", err)
	}
	if len(debts) == 0 {
		// Settled, balance moved, or nudged in the meantime. Clean no-op.
		return nil
	}

	tokens, err := q.ListPushTokensByUser(ctx, args.UserID)
	if err != nil {
		return fmt.Errorf("nudge_fire: load tokens: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}

	// "You owe 240.00 SEK + 10.00 EUR in <group>" — amounts as positive
	// decimal strings, one entry per owed currency (query orders by
	// currency code). English-only v1: the server has no user locale.
	owed := make([]string, 0, len(debts))
	var lastChange time.Time
	for _, d := range debts {
		owed = append(owed, money.Amount(-d.NetBalance).String()+" "+d.Currency.String)
		if d.LastBalanceChangeAt.Valid && d.LastBalanceChangeAt.Time.After(lastChange) {
			lastChange = d.LastBalanceChangeAt.Time
		}
	}
	title := fmt.Sprintf("You owe %s in %s", strings.Join(owed, " + "), debts[0].GroupName)

	days := int(time.Since(lastChange).Hours() / 24)
	unit := "days"
	if days == 1 {
		unit = "day"
	}
	body := fmt.Sprintf("Outstanding for %d %s — settle up?", days, unit)

	// Deep link the app's notification-tap handler understands; the
	// originating server URL is embedded per the multi-server design.
	link := fmt.Sprintf("chara://groups/%s/%s", url.QueryEscape(w.Cfg.ServerURL), args.GroupID)

	msgs := make([]push.Message, 0, len(tokens))
	for _, tok := range tokens {
		msgs = append(msgs, push.Message{
			To:    tok.Token,
			Title: title,
			Body:  body,
			Data:  map[string]string{"url": link},
		})
	}

	res, err := w.Sender.Send(ctx, msgs)
	if err != nil {
		// Tx rolls back (nothing written yet); River retries the job.
		return fmt.Errorf("nudge_fire: send: %w", err)
	}

	if err := q.UpsertBalanceNudge(ctx, db.UpsertBalanceNudgeParams{
		UserID:  args.UserID,
		GroupID: args.GroupID,
	}); err != nil {
		return fmt.Errorf("nudge_fire: record nudge: %w", err)
	}

	for _, dead := range res.DeviceNotRegistered {
		if err := q.DeletePushToken(ctx, db.DeletePushTokenParams{
			Token:  dead,
			UserID: args.UserID,
		}); err != nil {
			return fmt.Errorf("nudge_fire: drop dead token: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("nudge_fire: commit: %w", err)
	}
	return nil
}
