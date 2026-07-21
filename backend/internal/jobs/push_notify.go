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

// PushNotifyArgs is one push notification triggered by a member action.
// GroupName/ActorName/Title/AmountMinor/Currency are embedded so the worker
// can build copy without a second round trip for anything but the recipient
// token list.
//
// RecipientUserIDs is the explicit set of users involved in the event (e.g.
// an expense's participants plus its payer, or the two parties to a
// settlement) — notifications are NOT fanned out to the whole group. Callers
// may include the actor; the worker filters them out.
//
// RecipientMemberIDs is an alternative for events that know the involved
// *members* but not their user ids: the worker resolves them (skipping
// unclaimed/ghost members). Resolving here rather than at enqueue time means a
// transient DB failure returns an error and River retries the job, instead of
// the caller swallowing it into an empty recipient set that looks like success.
// The two fields are unioned; either or both may be set.
type PushNotifyArgs struct {
	EventKind          string   `json:"kind"` // "expense_added" | "settlement_recorded"
	GroupID            string   `json:"group_id"`
	GroupName          string   `json:"group_name"`
	ActorUserID        string   `json:"actor_user_id"` // excluded from recipients
	ActorName          string   `json:"actor_name"`
	RecipientUserIDs   []string `json:"recipient_user_ids"`
	RecipientMemberIDs []string `json:"recipient_member_ids,omitempty"`
	Title              string   `json:"title"` // expense title; "" for settlements
	AmountMinor        int64    `json:"amount_minor"`
	Currency           string   `json:"currency"`
}

func (PushNotifyArgs) Kind() string { return "push_notify" }

// expoSender is the subset of *pushsend.ExpoClient the worker needs. An
// interface so tests can inject a fake instead of hitting the network.
type expoSender interface {
	Send(ctx context.Context, msgs []pushsend.Message) error
}

// PushNotifyWorker sends a push notification to the push-token-registered
// users involved in the event (args.RecipientUserIDs), excluding the actor
// who triggered it. v1 is fire-and-forget: send failures and per-message
// ticket errors are logged, never retried, and never fail the job.
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
	// Combine explicitly-passed user ids with any resolved from member ids.
	// A resolution failure is returned (not swallowed) so River retries.
	userIDs := append([]string(nil), args.RecipientUserIDs...)
	if len(args.RecipientMemberIDs) > 0 {
		resolved, err := w.resolveMemberUsers(ctx, args.GroupID, args.RecipientMemberIDs)
		if err != nil {
			return fmt.Errorf("push_notify: resolve members: %w", err)
		}
		userIDs = append(userIDs, resolved...)
	}

	// Recipients are the involved users only. Drop the actor (callers may
	// include them, e.g. the payer is normally also a participant), any blanks
	// from unclaimed members, and duplicates. No recipients means nothing to
	// send — deliberately fail closed rather than fall back to a group-wide blast.
	seen := make(map[string]bool, len(userIDs))
	recipients := make([]string, 0, len(userIDs))
	for _, uid := range userIDs {
		if uid == "" || uid == args.ActorUserID || seen[uid] {
			continue
		}
		seen[uid] = true
		recipients = append(recipients, uid)
	}
	if len(recipients) == 0 {
		return nil
	}

	tokens, err := w.Queries.ListPushTokensByUsers(ctx, recipients)
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

// resolveMemberUsers maps group member ids to the user ids behind them,
// skipping unclaimed/ghost members that have no user account. A DB failure is
// returned so the caller can retry rather than silently notify no one.
func (w *PushNotifyWorker) resolveMemberUsers(ctx context.Context, groupID string, memberIDs []string) ([]string, error) {
	members, err := w.Queries.ListGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	userByMember := make(map[string]string, len(members))
	for _, m := range members {
		if m.UserID.Valid && m.UserID.String != "" {
			userByMember[m.ID] = m.UserID.String
		}
	}
	out := make([]string, 0, len(memberIDs))
	for _, id := range memberIDs {
		if uid, ok := userByMember[id]; ok {
			out = append(out, uid)
		}
	}
	return out, nil
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
