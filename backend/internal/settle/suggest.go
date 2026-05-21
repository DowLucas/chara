// Package settle computes minimum-transaction settle-up suggestions
// from per-member net balances.
//
// The exact "minimum number of transfers" problem is NP-hard (reduces to
// 3-PARTITION). We use the classic greedy heap algorithm: repeatedly match
// the largest creditor with the largest debtor, transferring the smaller of
// the two magnitudes. Each iteration zeros at least one party, so the
// algorithm emits at most N-1 transfers per currency bucket — the same bound
// Splitwise's "simplify debts" feature relies on.
package settle

import (
	"container/heap"
	"sort"
)

type Balance struct {
	MemberID string
	Currency string
	Amount   int64 // minor units; positive = owed to this member, negative = owes the group
}

type Transfer struct {
	FromMemberID string
	ToMemberID   string
	Currency     string
	Amount       int64 // minor units, always positive
}

// Suggest returns the minimum-cardinality set of transfers (greedy bound:
// ≤ N-1 per currency bucket) that zeros every member's balance. Input order
// does not affect output; ties are broken by member ID for determinism.
func Suggest(balances []Balance) []Transfer {
	byCurrency := make(map[string][]Balance)
	for _, b := range balances {
		if b.Amount == 0 {
			continue
		}
		byCurrency[b.Currency] = append(byCurrency[b.Currency], b)
	}

	currencies := make([]string, 0, len(byCurrency))
	for c := range byCurrency {
		currencies = append(currencies, c)
	}
	sort.Strings(currencies)

	var out []Transfer
	for _, c := range currencies {
		out = append(out, suggestOneCurrency(byCurrency[c])...)
	}
	return out
}

func suggestOneCurrency(balances []Balance) []Transfer {
	creditors := &balanceHeap{}
	debtors := &balanceHeap{}
	heap.Init(creditors)
	heap.Init(debtors)

	for _, b := range balances {
		if b.Amount > 0 {
			heap.Push(creditors, b)
		} else if b.Amount < 0 {
			heap.Push(debtors, Balance{MemberID: b.MemberID, Currency: b.Currency, Amount: -b.Amount})
		}
	}

	var transfers []Transfer
	for creditors.Len() > 0 && debtors.Len() > 0 {
		c := heap.Pop(creditors).(Balance)
		d := heap.Pop(debtors).(Balance)

		amount := c.Amount
		if d.Amount < amount {
			amount = d.Amount
		}

		transfers = append(transfers, Transfer{
			FromMemberID: d.MemberID,
			ToMemberID:   c.MemberID,
			Currency:     c.Currency,
			Amount:       amount,
		})

		c.Amount -= amount
		d.Amount -= amount
		if c.Amount > 0 {
			heap.Push(creditors, c)
		}
		if d.Amount > 0 {
			heap.Push(debtors, d)
		}
	}
	return transfers
}

// balanceHeap is a max-heap of Balance by Amount, with MemberID as tiebreaker
// so that input order does not affect output.
type balanceHeap []Balance

func (h balanceHeap) Len() int { return len(h) }
func (h balanceHeap) Less(i, j int) bool {
	if h[i].Amount != h[j].Amount {
		return h[i].Amount > h[j].Amount
	}
	return h[i].MemberID < h[j].MemberID
}
func (h balanceHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *balanceHeap) Push(x any)   { *h = append(*h, x.(Balance)) }
func (h *balanceHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}
