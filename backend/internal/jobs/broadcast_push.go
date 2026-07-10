package jobs

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/pushsend"
)

// BroadcastPushArgs is an operator-triggered push to every registered device
// (e.g. a short release note). URL is optional — when empty the notification
// simply opens the app; when set it rides as the deep-link `data.url`.
type BroadcastPushArgs struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"`
}

func (BroadcastPushArgs) Kind() string { return "broadcast_push" }

// BroadcastPushWorker fans one message out to all push tokens. Same
// fire-and-forget, English-only posture as PushNotifyWorker.
type BroadcastPushWorker struct {
	river.WorkerDefaults[BroadcastPushArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Expo    expoSender
}

func (w *BroadcastPushWorker) Work(ctx context.Context, job *river.Job[BroadcastPushArgs]) error {
	return w.broadcast(ctx, job.Args)
}

// BroadcastForTest invokes the worker body directly, mirroring NotifyForTest.
func BroadcastForTest(ctx context.Context, w *BroadcastPushWorker, args BroadcastPushArgs) error {
	return w.broadcast(ctx, args)
}

func (w *BroadcastPushWorker) broadcast(ctx context.Context, args BroadcastPushArgs) error {
	tokens, err := w.Queries.ListAllPushTokens(ctx)
	if err != nil {
		return fmt.Errorf("broadcast_push: list tokens: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}

	var data map[string]any
	if args.URL != "" {
		data = map[string]any{"url": args.URL}
	}

	msgs := make([]pushsend.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, pushsend.Message{
			To:    t.Token,
			Title: args.Title,
			Body:  args.Body,
			Data:  data,
		})
	}
	if err := w.Expo.Send(ctx, msgs); err != nil {
		slog.Warn("broadcast_push: send failed", "recipients", len(msgs), "error", err)
	}
	return nil
}
