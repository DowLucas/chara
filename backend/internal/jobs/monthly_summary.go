package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/pushsend"
)

// summaryFireHour is the local hour the monthly fan-out starts on the 1st.
// 09:00 is late enough not to arrive overnight and early enough that the
// notification is still the morning's news.
const summaryFireHour = 9

// summaryPageSize caps how many recipients one page of the fan-out loads.
// The pages are not offset-advanced (see notify), so this only bounds the
// working set held in memory per iteration.
const summaryPageSize = 500

// summaryMaxPages stops the paging loop from spinning forever if a user
// somehow keeps coming back — a ledger write that silently does nothing
// would otherwise be an infinite loop rather than a bounded bug.
const summaryMaxPages = 1000

// MonthlySummaryTickArgs is the hourly periodic job. Empty: the tick's only
// question is "is now the moment?", answered by shouldFire.
//
// Hourly rather than a cron expression because River's periodic jobs are
// intervals, and an interval anchored to process start would drift with
// every deploy. An hourly tick that mostly no-ops is cheap and, crucially,
// self-correcting: a deploy during the fire hour still catches it.
type MonthlySummaryTickArgs struct{}

func (MonthlySummaryTickArgs) Kind() string { return "monthly_summary_tick" }

// MonthlySummaryNotifyArgs is the fan-out for one period.
type MonthlySummaryNotifyArgs struct {
	Period string `json:"period"` // 'YYYY-MM', the month that just ended
}

func (MonthlySummaryNotifyArgs) Kind() string { return "monthly_summary_notify" }

// MonthlySummaryTickWorker enqueues the fan-out when the hourly tick lands
// on the 1st of the month at summaryFireHour, in Location.
//
// Enqueueing rather than fanning out inline keeps the tick fast and lets
// River retry the (long) fan-out independently. The insert is unique by
// args, so the several ticks that can land inside one hour after a restart
// enqueue one job, not several — and the ledger makes even that harmless.
type MonthlySummaryTickWorker struct {
	river.WorkerDefaults[MonthlySummaryTickArgs]
	Location *time.Location
	// Now is injectable so the fire window is testable without waiting for
	// the 1st of a month. Nil means time.Now.
	Now func() time.Time
}

func (w *MonthlySummaryTickWorker) Work(ctx context.Context, _ *river.Job[MonthlySummaryTickArgs]) error {
	now := time.Now
	if w.Now != nil {
		now = w.Now
	}
	loc := w.Location
	if loc == nil {
		loc = time.UTC
	}
	period, ok := shouldFire(now(), loc)
	if !ok {
		return nil
	}

	client := river.ClientFromContext[pgx.Tx](ctx)
	if client == nil {
		return fmt.Errorf("monthly_summary_tick: no River client in context")
	}
	_, err := client.Insert(ctx, MonthlySummaryNotifyArgs{Period: period}, &river.InsertOpts{
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			// The same required-state set RecurringTickWorker uses; omitting
			// any of them is rejected by River's validator.
			ByState: []rivertype.JobState{
				rivertype.JobStateAvailable,
				rivertype.JobStatePending,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
				rivertype.JobStateScheduled,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("monthly_summary_tick: enqueue %s: %w", period, err)
	}
	slog.Info("monthly_summary_tick: enqueued fan-out", "period", period)
	return nil
}

// shouldFire reports whether an hourly tick landing at now should start the
// fan-out, and for which period. True on the 1st of the month during the
// summaryFireHour hour, judged in loc — the tick itself is scheduled in
// whatever zone the process runs in, so the conversion has to happen here.
//
// The period returned is the month that just *ended*, which is what the
// summary is about. Derived by stepping back one day rather than
// subtracting a month, because AddDate(0, -1, 0) normalizes overflow (31
// March minus a month is 3 March) — irrelevant on the 1st, but the
// day-step is correct by construction rather than by luck.
func shouldFire(now time.Time, loc *time.Location) (string, bool) {
	local := now.In(loc)
	if local.Day() != 1 || local.Hour() != summaryFireHour {
		return "", false
	}
	return local.AddDate(0, 0, -1).Format("2006-01"), true
}

// MonthlySummaryNotifyWorker pushes "your summary is ready" to every user
// who had spend in the period, has a device, and has not opted out.
//
// Send failures are logged, not retried — the same fire-and-forget posture
// as PushNotifyWorker. A DB failure *is* returned so River retries, and the
// retry resumes cleanly: the ledger row written per user removes them from
// the recipient query, so a crash mid-fan-out re-runs only what is left.
type MonthlySummaryNotifyWorker struct {
	river.WorkerDefaults[MonthlySummaryNotifyArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Expo    expoSender
}

func (w *MonthlySummaryNotifyWorker) Work(ctx context.Context, job *river.Job[MonthlySummaryNotifyArgs]) error {
	return w.notify(ctx, job.Args)
}

// SummaryNotifyForTest invokes the worker body directly, mirroring
// NotifyForTest so tests don't need a running River client.
func SummaryNotifyForTest(ctx context.Context, w *MonthlySummaryNotifyWorker, args MonthlySummaryNotifyArgs) error {
	return w.notify(ctx, args)
}

func (w *MonthlySummaryNotifyWorker) notify(ctx context.Context, args MonthlySummaryNotifyArgs) error {
	start, err := time.Parse("2006-01", args.Period)
	if err != nil {
		// A malformed period is a bug in the enqueuer, not a transient
		// fault: returning an error would have River retry it forever.
		slog.Error("monthly_summary_notify: unparseable period", "period", args.Period)
		return nil
	}
	startPg := pgtype.Date{Time: start, Valid: true}
	endPg := pgtype.Date{Time: start.AddDate(0, 1, 0), Valid: true}
	deepLink := buildSummaryDeepLink(args.Period)

	sent := 0
	for page := 0; page < summaryMaxPages; page++ {
		// Offset stays 0 on purpose: each user notified gains a ledger row,
		// which removes them from this query. Advancing the offset would
		// skip the users that shift down into the window as rows are
		// written — the classic mutate-while-paging bug.
		recipients, err := w.Queries.ListMonthlySummaryRecipients(ctx, db.ListMonthlySummaryRecipientsParams{
			Period: args.Period, PeriodStart: startPg, PeriodEnd: endPg,
			Off: 0, Lim: summaryPageSize,
		})
		if err != nil {
			return fmt.Errorf("monthly_summary_notify: list recipients: %w", err)
		}
		if len(recipients) == 0 {
			slog.Info("monthly_summary_notify: done", "period", args.Period, "notified", sent)
			return nil
		}
		n, err := w.notifyPage(ctx, args.Period, deepLink, recipients)
		sent += n
		if err != nil {
			return err
		}
	}
	return fmt.Errorf("monthly_summary_notify: %s did not drain in %d pages", args.Period, summaryMaxPages)
}

// notifyPage sends one page of recipients and records every one of them in
// the ledger. Returns how many users were marked.
func (w *MonthlySummaryNotifyWorker) notifyPage(
	ctx context.Context, period, deepLink string, recipients []db.ListMonthlySummaryRecipientsRow,
) (int, error) {
	userIDs := make([]string, 0, len(recipients))
	locales := make(map[string]string, len(recipients))
	for _, r := range recipients {
		userIDs = append(userIDs, r.ID)
		locales[r.ID] = r.Locale
	}

	tokens, err := w.Queries.ListPushTokensByUsers(ctx, userIDs)
	if err != nil {
		return 0, fmt.Errorf("monthly_summary_notify: list tokens: %w", err)
	}
	msgs := make([]pushsend.Message, 0, len(tokens))
	for _, tok := range tokens {
		// Copy is per recipient, not per page: two users on one page can
		// hold different locales.
		title, body := summaryCopy(locales[tok.UserID])
		msgs = append(msgs, pushsend.Message{
			To: tok.Token, Title: title, Body: body,
			Data: map[string]any{"url": deepLink},
		})
	}
	if len(msgs) > 0 {
		if err := w.Expo.Send(ctx, msgs); err != nil {
			slog.Warn("monthly_summary_notify: send failed",
				"period", period, "recipients", len(msgs), "error", err)
		}
	}

	// Mark unconditionally, including after a send failure. The alternative
	// — retrying the page — re-sends to everyone Expo already accepted,
	// because Send is all-or-nothing from here. A missed monthly summary is
	// a smaller harm than a duplicated one, and this is also what keeps the
	// paging loop terminating.
	for _, r := range recipients {
		if err := w.Queries.MarkMonthlySummarySent(ctx, db.MarkMonthlySummarySentParams{
			UserID: r.ID, Period: period,
		}); err != nil {
			return 0, fmt.Errorf("monthly_summary_notify: mark sent: %w", err)
		}
	}
	return len(recipients), nil
}

// buildSummaryDeepLink addresses the summary screen for one period.
//
// Unlike the group links this carries no server segment: the feature is
// hosted-only, so there is exactly one server it can mean, and a link that
// cannot name a server cannot be crafted to point the app at someone else's.
func buildSummaryDeepLink(period string) string {
	return "chara://summary/" + period
}
