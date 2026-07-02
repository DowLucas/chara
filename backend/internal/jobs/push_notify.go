package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/pushsend"
)

// PushNotifyArgs is one group-wide push notification triggered by a member
// action. GroupName/ActorName/Title/AmountMinor/Currency are embedded so the
// worker can build copy without a second round trip for anything but the
// recipient token list.
type PushNotifyArgs struct {
	EventKind   string `json:"kind"` // "expense_added" | "settlement_recorded"
	GroupID     string `json:"group_id"`
	GroupName   string `json:"group_name"`
	ActorUserID string `json:"actor_user_id"` // excluded from recipients
	ActorName   string `json:"actor_name"`
	Title       string `json:"title"` // expense title; "" for settlements
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

func (PushNotifyArgs) Kind() string { return "push_notify" }

// expoSender is the subset of *pushsend.ExpoClient the worker needs. An
// interface so tests can inject a fake instead of hitting the network.
type expoSender interface {
	Send(ctx context.Context, msgs []pushsend.Message) error
}

// PushNotifyWorker sends a push notification to every push-token-registered
// member of a group except the actor who triggered the event. v1 is
// fire-and-forget: send failures and per-message ticket errors are logged,
// never retried, and never fail the job.
//
// No i18n: notification copy is always English regardless of the
// recipient's device locale (backend has no per-user locale for push
// today). Acceptable v1 gap — flagged, not solved here.
type PushNotifyWorker struct {
	river.WorkerDefaults[PushNotifyArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Expo    expoSender
	BaseURL string // cfg.BaseURL, used to build the group deep link
}

func (w *PushNotifyWorker) Work(ctx context.Context, job *river.Job[PushNotifyArgs]) error {
	return w.notify(ctx, job.Args)
}

// NotifyForTest invokes the worker body directly, mirroring
// RecurringFireWorker's FireForTest pattern so tests don't need a running
// River client.
func NotifyForTest(ctx context.Context, w *PushNotifyWorker, args PushNotifyArgs) error {
	return w.notify(ctx, args)
}

func (w *PushNotifyWorker) notify(ctx context.Context, args PushNotifyArgs) error {
	tokens, err := w.Queries.ListPushTokensByGroup(ctx, db.ListPushTokensByGroupParams{
		GroupID: args.GroupID,
		UserID:  pgtype.Text{String: args.ActorUserID, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("push_notify: list tokens: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}

	title, body := buildCopy(args)
	deepLink := buildGroupDeepLink(w.BaseURL, args.GroupID)

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
		slog.Warn("push_notify: send failed", "group_id", args.GroupID, "kind", args.EventKind, "error", err)
	}
	return nil
}

// buildGroupDeepLink matches the shape the mobile app's
// classifyGroupDeepLink expects: chara://groups/<encoded serverUrl>/<groupId>.
// PathEscape (not QueryEscape) — the mobile side decodes with
// decodeURIComponent, which does not treat '+' as a space the way
// QueryEscape's encoding would imply.
func buildGroupDeepLink(baseURL, groupID string) string {
	return "chara://groups/" + url.PathEscape(baseURL) + "/" + groupID
}

// buildCopy generates plain-English notification title/body. No locale
// awareness — see the PushNotifyWorker doc comment.
func buildCopy(a PushNotifyArgs) (title, body string) {
	amount := fmt.Sprintf("%.2f %s", float64(a.AmountMinor)/100, a.Currency)
	switch a.EventKind {
	case "expense_added":
		return a.GroupName, fmt.Sprintf("%s added %s — %s", a.ActorName, a.Title, amount)
	case "settlement_recorded":
		return a.GroupName, fmt.Sprintf("%s settled up — %s", a.ActorName, amount)
	default:
		return a.GroupName, "New activity"
	}
}
