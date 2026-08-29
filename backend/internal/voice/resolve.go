package voice

import (
	"time"

	"github.com/DowLucas/chara/internal/category"
	"github.com/DowLucas/chara/internal/currency"
	"github.com/DowLucas/chara/internal/money"
	"github.com/DowLucas/chara/internal/split"
)

// rawDraft is the model's unvalidated output for one expense. Nothing in
// here is trusted; resolveDrafts is what turns it into a [Draft].
type rawDraft struct {
	SourcePhrase   string       `json:"source_phrase"`
	Title          string       `json:"title"`
	Amount         string       `json:"amount"`
	Currency       string       `json:"currency"`
	Category       string       `json:"category"`
	Date           string       `json:"date"`
	PaidByMemberID string       `json:"paid_by_member_id"`
	SplitMethod    string       `json:"split_method"`
	Participants   []string     `json:"participant_member_ids"`
	Shares         []rawShare   `json:"shares"`
	Percentages    []rawPercent `json:"percentages"`
}

type rawShare struct {
	MemberID string `json:"member_id"`
	Amount   string `json:"amount"`
}

type rawPercent struct {
	MemberID string  `json:"member_id"`
	Percent  float64 `json:"percent"`
}

// resolveDrafts turns the model's raw output into validated drafts.
//
// This is the trust boundary. Nothing the model says about money survives
// unchecked: member ids are matched against the real roster, amounts go
// through money.ParseDecimal, and every split is RECOMPUTED by
// internal/split rather than copied.
//
// Where the model is wrong we degrade rather than fail — fall back to an
// equal split, drop an unknown member, clear an off-catalog category. A
// partially correct draft the user can fix beats an error toast, and the
// user reviews all of it before anything is saved anyway.
//
// degraded counts splits that had to fall back; unresolved counts member
// ids that did not exist. Both are recorded in ai_generations as the first
// signal that a prompt or model upgrade has drifted.
func resolveDrafts(raws []rawDraft, vc Context) (drafts []Draft, degraded, unresolved int) {
	for _, raw := range raws {
		amount, err := money.ParseDecimal(raw.Amount)
		if err != nil || amount <= 0 {
			// No usable amount means no expense. Drop it rather than
			// create a zero-value draft the user has to notice and delete.
			continue
		}

		d := Draft{
			SourcePhrase: raw.SourcePhrase,
			Title:        raw.Title,
			AmountMinor:  amount,
			Date:         resolveDate(raw.Date, vc.LocalDate),
			Currency:     resolveCurrency(raw.Currency, vc.Currency),
			Category:     resolveCategory(raw.Category, vc.Categories),
		}

		participants, dropped := resolveParticipants(raw.Participants, vc)
		unresolved += dropped
		d.Participants = participants
		// Flag only when the model named people and we discarded every one
		// of them. Naming nobody at all is normal ("groceries, split it").
		if len(raw.Participants) > 0 && dropped == len(raw.Participants) {
			d.LowConfidence = append(d.LowConfidence, "participants")
		}

		if vc.HasMember(raw.PaidByMemberID) {
			d.PaidByID = raw.PaidByMemberID
		} else {
			if raw.PaidByMemberID != "" {
				unresolved++
			}
			// The speaker is the likeliest payer, and a wrong payer the
			// user can see and change beats no draft at all.
			d.PaidByID = vc.CallerMemberID
			d.LowConfidence = append(d.LowConfidence, "paid_by")
		}

		shares, pcts, method, fellBack := resolveShares(raw, amount, d.Participants)
		if fellBack {
			degraded++
			d.LowConfidence = append(d.LowConfidence, "split")
		}
		d.SplitMethod = method
		d.Shares = shares
		d.Percentages = pcts

		drafts = append(drafts, d)
	}
	return drafts, degraded, unresolved
}

// resolveParticipants keeps only real members, returning how many ids were
// discarded. An empty result falls back to the whole group.
func resolveParticipants(raw []string, vc Context) (participants []string, dropped int) {
	for _, id := range raw {
		if vc.HasMember(id) {
			participants = append(participants, id)
		} else {
			dropped++
		}
	}
	if len(participants) == 0 {
		for _, m := range vc.Members {
			participants = append(participants, m.ID)
		}
	}
	return participants, dropped
}

// resolveCurrency falls back to the group's currency. A foreign currency
// the model heard correctly ("40 euros") is preserved for the FX path.
func resolveCurrency(raw, groupCurrency string) string {
	if code, ok := currency.Normalize(raw); ok {
		return code
	}
	return groupCurrency
}

// resolveCategory accepts a guess only if it is a real category AND one
// this group has enabled. Anything else becomes "no suggestion".
func resolveCategory(raw string, catalog []string) string {
	if raw == "" || !category.IsValid(raw) {
		return ""
	}
	for _, c := range catalog {
		if c == raw {
			return raw
		}
	}
	return ""
}

// resolveShares recomputes the split. fellBack is true when the model's
// exact/percentage numbers did not validate and equal was used instead.
//
// The returned percentages are non-nil only for a percentage split that
// validated: a degraded one must not keep the numbers that just failed.
func resolveShares(raw rawDraft, amount money.Amount, participants []string) ([]MemberShare, []MemberPct, string, bool) {
	equal := func() []MemberShare {
		parts, err := split.Equal(amount, participants)
		if err != nil {
			return nil
		}
		return toMemberShares(parts)
	}

	switch raw.SplitMethod {
	case "exact":
		in := make([]split.MemberShare, 0, len(raw.Shares))
		for _, s := range raw.Shares {
			if !containsStr(participants, s.MemberID) {
				return equal(), nil, "equal", true
			}
			v, err := money.ParseDecimal(s.Amount)
			if err != nil {
				return equal(), nil, "equal", true
			}
			in = append(in, split.MemberShare{MemberID: s.MemberID, Share: v})
		}
		out, err := split.Exact(amount, in)
		if err != nil {
			return equal(), nil, "equal", true
		}
		return toMemberShares(out), nil, "exact", false

	case "percentage":
		in := make([]split.MemberPct, 0, len(raw.Percentages))
		for _, p := range raw.Percentages {
			if !containsStr(participants, p.MemberID) {
				return equal(), nil, "equal", true
			}
			in = append(in, split.MemberPct{
				MemberID: p.MemberID,
				// Percent arrives as a float ("70"); basis points are the
				// integer representation internal/split works in.
				BasisPoints: int(p.Percent*100 + 0.5),
			})
		}
		out, err := split.Percentage(amount, in)
		if err != nil {
			return equal(), nil, "equal", true
		}
		pcts := make([]MemberPct, len(in))
		for i, p := range in {
			pcts[i] = MemberPct{MemberID: p.MemberID, BasisPoints: p.BasisPoints}
		}
		return toMemberShares(out), pcts, "percentage", false

	default:
		// Includes "equal" and anything the model invented.
		return equal(), nil, "equal", false
	}
}

func toMemberShares(in []split.MemberShare) []MemberShare {
	out := make([]MemberShare, len(in))
	for i, s := range in {
		out[i] = MemberShare{MemberID: s.MemberID, Share: s.Share}
	}
	return out
}

// resolveDate keeps a well-formed YYYY-MM-DD and otherwise falls back to
// the client's local date — never the server's, which can be a day out.
func resolveDate(raw, localDate string) string {
	if _, err := time.Parse("2006-01-02", raw); err == nil {
		return raw
	}
	return localDate
}

func containsStr(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}
