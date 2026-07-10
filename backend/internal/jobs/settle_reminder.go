package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/pushsend"
)

// SettleReminderArgs is a targeted nudge asking specific debtors of one
// creditor to settle up. Unlike PushNotifyArgs (group-wide, actor-excluded),
// recipients are an explicit user-id set and the deep link lands on the
// group's settle-up screen rather than the group home.
type SettleReminderArgs struct {
	GroupID          string   `json:"group_id"`
	GroupName        string   `json:"group_name"`
	CreditorName     string   `json:"creditor_name"`
	RecipientUserIDs []string `json:"recipient_user_ids"`
}

func (SettleReminderArgs) Kind() string { return "settle_reminder" }

// SettleReminderWorker delivers the reminder push. Same fire-and-forget,
// English-only posture as PushNotifyWorker (see its doc comment).
type SettleReminderWorker struct {
	river.WorkerDefaults[SettleReminderArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Expo    expoSender
	BaseURL string // cfg.BaseURL, used to build the settle deep link
}

func (w *SettleReminderWorker) Work(ctx context.Context, job *river.Job[SettleReminderArgs]) error {
	return w.notify(ctx, job.Args)
}

// RemindForTest invokes the worker body directly, mirroring NotifyForTest.
func RemindForTest(ctx context.Context, w *SettleReminderWorker, args SettleReminderArgs) error {
	return w.notify(ctx, args)
}

func (w *SettleReminderWorker) notify(ctx context.Context, args SettleReminderArgs) error {
	if len(args.RecipientUserIDs) == 0 {
		return nil
	}
	tokens, err := w.Queries.ListPushTokensByUsers(ctx, args.RecipientUserIDs)
	if err != nil {
		return fmt.Errorf("settle_reminder: list tokens: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}

	title := args.GroupName
	body := fmt.Sprintf("%s is asking you to settle up", args.CreditorName)
	deepLink := buildSettleDeepLink(w.BaseURL, args.GroupID)

	msgs := make([]pushsend.Message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, pushsend.Message{
			To:    t.Token,
			Title: title,
			Body:  body,
			Data:  map[string]any{"url": deepLink},
		})
	}
	if err := w.Expo.Send(ctx, msgs); err != nil {
		slog.Warn("settle_reminder: send failed", "group_id", args.GroupID, "error", err)
	}
	return nil
}

// buildSettleDeepLink extends the group deep link with a trailing /settle
// segment. Older apps ignore the extra segment (their classifier keeps only
// the first three parts) and land on the group home; newer apps route to the
// settle-up screen.
func buildSettleDeepLink(baseURL, groupID string) string {
	return "chara://groups/" + url.PathEscape(baseURL) + "/" + groupID + "/settle"
}
