package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/expense"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/recurring"
	"github.com/DowLucas/chara/internal/split"
)

// RecurringFireArgs is a single firing of a single rule. (RecurringID,
// FireAt) is the uniqueness key — re-enqueuing the same pair while it's
// still in flight is a no-op via River's UniqueOpts.
type RecurringFireArgs struct {
	RecurringID string    `json:"recurring_id"`
	FireAt      time.Time `json:"fire_at"`
}

func (RecurringFireArgs) Kind() string { return "recurring_fire" }

// CatchUpFactor is the multiplier applied to the rule's nominal interval
// to decide "you're way behind, pause for human review". 20x means a
// daily rule pauses after 20 missed days; a weekly rule pauses after
// ~5 months. Matches the catch-up overflow guard in the spec.
const CatchUpFactor = 20

// RecurringFireWorker fires one materialization of one rule. The body
// runs in a single transaction: re-check status, resolve splits, write
// the expense via expense.Create, then advance next_fire_at via
// recurring.NextFire. Idempotency:
//   - Tick-side: River's UniqueOpts prevents duplicate enqueue.
//   - Worker-side: we re-read the rule under tx and check that
//     last_fire_at is NOT >= the FireAt we were called for. If it is,
//     somebody (a parallel retry, a manual re-fire, …) already advanced
//     past this firing — we silently no-op.
type RecurringFireWorker struct {
	river.WorkerDefaults[RecurringFireArgs]
	Pool    *pgxpool.Pool
	Queries *db.Queries
}

func (w *RecurringFireWorker) Work(ctx context.Context, job *river.Job[RecurringFireArgs]) error {
	return w.fire(ctx, job.Args)
}

// FireForTest invokes the worker body directly. Tests use this instead
// of spinning up the full River client. Production code goes through
// (*RecurringFireWorker).Work which River drives.
func FireForTest(ctx context.Context, w *RecurringFireWorker, args RecurringFireArgs) error {
	return w.fire(ctx, args)
}

// fire is the actual body, factored out so tests can drive it without
// wrapping in a River Job.
func (w *RecurringFireWorker) fire(ctx context.Context, args RecurringFireArgs) error {
	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("recurring_fire: begin tx: %w", err)
	}
	defer tx.Rollback(context.Background())

	q := db.New(tx)
	rule, err := q.GetRecurringExpense(ctx, args.RecurringID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Rule was deleted between tick and fire. Clean no-op.
			slog.Info("recurring_fire: rule disappeared", "id", args.RecurringID)
			return nil
		}
		return fmt.Errorf("recurring_fire: load rule: %w", err)
	}

	// Status guard. Only active rules fire.
	if rule.Status != "active" {
		slog.Info("recurring_fire: rule not active",
			"id", rule.ID, "status", rule.Status)
		return nil
	}

	// Idempotency guard: if last_fire_at is at or after the firing time
	// we were asked to materialize, we've already done this one.
	if rule.LastFireAt.Valid && !rule.LastFireAt.Time.Before(args.FireAt) {
		slog.Info("recurring_fire: already fired",
			"id", rule.ID, "fire_at", args.FireAt, "last_fire_at", rule.LastFireAt.Time)
		return nil
	}

	// Lock guard — if the group got locked between tick and fire, pause.
	group, err := q.GetGroupByID(ctx, rule.GroupID)
	if err != nil {
		return fmt.Errorf("recurring_fire: load group: %w", err)
	}
	if group.IsLocked {
		if _, err := q.SetRecurringStatus(ctx, db.SetRecurringStatusParams{
			ID:           rule.ID,
			Status:       "paused",
			PausedReason: pgtype.Text{String: "group_locked", Valid: true},
		}); err != nil {
			return fmt.Errorf("recurring_fire: pause group_locked: %w", err)
		}
		return tx.Commit(ctx)
	}

	// Catch-up overflow guard. Compute the nominal interval and check the
	// gap between "last successful (or start)" and now. Zero expenses
	// written on this pass — operator/owner re-resumes after review.
	anchor := args.FireAt
	if rule.LastFireAt.Valid {
		anchor = rule.LastFireAt.Time
	} else if rule.StartDate.Valid {
		anchor = rule.StartDate.Time
	}
	intervalDur := approxInterval(rule.FreqUnit, int(rule.FreqInterval))
	if intervalDur > 0 && time.Since(anchor) > intervalDur*CatchUpFactor {
		if _, err := q.SetRecurringStatus(ctx, db.SetRecurringStatusParams{
			ID:           rule.ID,
			Status:       "paused",
			PausedReason: pgtype.Text{String: "catchup_overflow", Valid: true},
		}); err != nil {
			return fmt.Errorf("recurring_fire: pause catchup: %w", err)
		}
		return tx.Commit(ctx)
	}

	// Load rule splits + members to validate "paid_by + all split members
	// still in the group". If any member is gone, pause.
	ruleSplits, err := q.ListRecurringSplits(ctx, rule.ID)
	if err != nil {
		return fmt.Errorf("recurring_fire: load splits: %w", err)
	}
	members, err := q.ListGroupMembers(ctx, rule.GroupID)
	if err != nil {
		return fmt.Errorf("recurring_fire: load members: %w", err)
	}
	memberSet := make(map[string]struct{}, len(members))
	for _, m := range members {
		memberSet[m.ID] = struct{}{}
	}
	if _, ok := memberSet[rule.PaidByID]; !ok {
		if _, err := q.SetRecurringStatus(ctx, db.SetRecurringStatusParams{
			ID:           rule.ID,
			Status:       "paused",
			PausedReason: pgtype.Text{String: "member_left", Valid: true},
		}); err != nil {
			return fmt.Errorf("recurring_fire: pause member_left (payer): %w", err)
		}
		return tx.Commit(ctx)
	}
	for _, s := range ruleSplits {
		if _, ok := memberSet[s.MemberID]; !ok {
			if _, err := q.SetRecurringStatus(ctx, db.SetRecurringStatusParams{
				ID:           rule.ID,
				Status:       "paused",
				PausedReason: pgtype.Text{String: "member_left", Valid: true},
			}); err != nil {
				return fmt.Errorf("recurring_fire: pause member_left (split): %w", err)
			}
			return tx.Commit(ctx)
		}
	}

	// Catch-up: fire as many occurrences as are due, up to the cap. The
	// catch-up cap is the same factor (20) but applied as a count, not a
	// duration — we already handled the duration overflow above.
	occurrence := args.FireAt
	fired := 0
	for {
		if fired >= CatchUpFactor {
			// Should be unreachable given the overflow guard above, but
			// belt-and-braces: stop firing rather than spin forever.
			break
		}
		if err := materializeOnce(ctx, tx, q, rule, ruleSplits, occurrence); err != nil {
			return fmt.Errorf("recurring_fire: materialize: %w", err)
		}
		fired++

		// Advance using recurring.NextFire.
		var endPtr *time.Time
		if rule.EndDate.Valid {
			t := rule.EndDate.Time
			endPtr = &t
		}
		hh, mm := fireLocalTimeHHMM(rule.FireLocalTime)
		_, nextFire, status := recurring.NextFire(recurring.Rule{
			FreqUnit:      rule.FreqUnit,
			FreqInterval:  int(rule.FreqInterval),
			StartDate:     rule.StartDate.Time,
			EndDate:       endPtr,
			Timezone:      rule.Timezone,
			FireLocalTime: fmt.Sprintf("%02d:%02d", hh, mm),
		}, occurrence)

		newStatus := "active"
		if status == recurring.StatusEnded {
			newStatus = "ended"
		}

		if err := q.AdvanceRecurringAfterFire(ctx, db.AdvanceRecurringAfterFireParams{
			ID:         rule.ID,
			LastFireAt: pgtype.Timestamptz{Time: occurrence, Valid: true},
			NextFireAt: pgtype.Timestamptz{Time: nextFire, Valid: true},
			Status:     newStatus,
		}); err != nil {
			return fmt.Errorf("recurring_fire: advance: %w", err)
		}

		if status == recurring.StatusEnded || nextFire.After(time.Now()) {
			break
		}
		// Catch up another iteration. Move occurrence forward.
		occurrence = nextFire
	}

	return tx.Commit(ctx)
}

// materializeOnce resolves splits, then calls expense.Create.
// All-zero `Splits[i].Value` from recurring.Materialize is overwritten
// here — that is the critical correctness rule.
func materializeOnce(
	ctx context.Context,
	tx pgx.Tx,
	q *db.Queries,
	rule db.RecurringExpense,
	ruleSplits []db.RecurringExpenseSplit,
	occurrence time.Time,
) error {
	var resolved []split.MemberShare
	switch rule.SplitMethod {
	case "equal":
		memberIDs := make([]string, 0, len(ruleSplits))
		for _, s := range ruleSplits {
			memberIDs = append(memberIDs, s.MemberID)
		}
		r, err := split.Equal(money.Amount(rule.AmountMinor), memberIDs)
		if err != nil {
			return fmt.Errorf("split equal: %w", err)
		}
		resolved = r
	case "exact":
		shares := make([]split.MemberShare, 0, len(ruleSplits))
		for _, s := range ruleSplits {
			shares = append(shares, split.MemberShare{
				MemberID: s.MemberID,
				Share:    money.Amount(s.Value),
			})
		}
		r, err := split.Exact(money.Amount(rule.AmountMinor), shares)
		if err != nil {
			return fmt.Errorf("split exact: %w", err)
		}
		resolved = r
	case "percentage":
		pcts := make([]split.MemberPct, 0, len(ruleSplits))
		for _, s := range ruleSplits {
			pcts = append(pcts, split.MemberPct{
				MemberID:    s.MemberID,
				BasisPoints: int(s.Value),
			})
		}
		r, err := split.Percentage(money.Amount(rule.AmountMinor), pcts)
		if err != nil {
			return fmt.Errorf("split percentage: %w", err)
		}
		resolved = r
	default:
		return fmt.Errorf("unknown split_method %q", rule.SplitMethod)
	}

	// Build the Materializable + project into an expense.Input.
	mat := recurring.Materializable{
		RuleID:          rule.ID,
		GroupID:         rule.GroupID,
		Title:           rule.Title,
		AmountMinor:     rule.AmountMinor,
		Currency:        rule.Currency,
		PaidByMemberID:  rule.PaidByID,
		SplitMethod:     rule.SplitMethod,
		Category:        rule.Category,
		CreatedByUserID: rule.CreatedByID,
		Timezone:        rule.Timezone,
	}
	if rule.Notes.Valid {
		s := rule.Notes.String
		mat.Notes = &s
	}
	// Splits passed to Materialize are unused for the value (we overwrite
	// below) but Materialize copies their member IDs into the Input — pass
	// rule splits so the slice has the right shape.
	for _, s := range ruleSplits {
		mat.Splits = append(mat.Splits, recurring.SplitDef{MemberID: s.MemberID, Value: s.Value})
	}

	input := recurring.Materialize(mat, occurrence)

	// Overwrite with resolved shares — Materialize leaves equal-splits
	// at zero and we must never persist zero splits.
	input.Splits = input.Splits[:0]
	for _, sh := range resolved {
		input.Splits = append(input.Splits, expense.SplitInput{
			MemberID: sh.MemberID,
			Value:    int64(sh.Share),
		})
	}

	if _, err := expense.Create(ctx, tx, q, input); err != nil {
		return err
	}
	return nil
}

// approxInterval returns the nominal length of one tick of the schedule.
// Used only for the catch-up overflow guard, hence "approx" — month/year
// vary slightly but the 20x factor swallows the rounding.
func approxInterval(unit string, n int) time.Duration {
	if n <= 0 {
		return 0
	}
	switch unit {
	case "day":
		return time.Duration(n) * 24 * time.Hour
	case "week":
		return time.Duration(n) * 7 * 24 * time.Hour
	case "month":
		return time.Duration(n) * 30 * 24 * time.Hour
	case "year":
		return time.Duration(n) * 365 * 24 * time.Hour
	default:
		return 0
	}
}

// fireLocalTimeHHMM unpacks a pgtype.Time (microseconds since midnight)
// into hours+minutes. We round to the minute — fire_local_time only ever
// stores HH:MM through the migration's DEFAULT and the validator.
func fireLocalTimeHHMM(t pgtype.Time) (int, int) {
	if !t.Valid {
		return 9, 0
	}
	totalSecs := t.Microseconds / 1_000_000
	h := int(totalSecs / 3600)
	m := int((totalSecs % 3600) / 60)
	return h, m
}
