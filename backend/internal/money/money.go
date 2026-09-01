package money

import (
	"fmt"
	"strconv"
	"strings"
)

// Amount represents a monetary value as minor units (öre, cents, etc.).
// Always use this type for money — never float64.
type Amount int64

// MaxAmount is the largest magnitude any single monetary value may have, in
// minor units — one trillion major units (1 000 000 000 000.00).
//
// This is not arbitrary politeness about big numbers, it is an overflow
// contract. Amounts feed three pieces of int64 arithmetic that wrap silently:
//
//   - split.Percentage computes total * basisPoints, where basisPoints tops
//     out at 10 000. MaxAmount * 10 000 == 1e18, comfortably under the int64
//     ceiling of ~9.22e18.
//   - split.Exact sums the caller's shares. Wrapped shares can be made to sum
//     to any target, which would let a member post a split that does not add
//     up to the expense.
//   - the member_balances view casts a numeric SUM back to BIGINT. A single
//     ceiling-sized expense makes that cast raise "bigint out of range", and
//     every balance read for the group starts failing.
//
// Every parser that turns untrusted input into an Amount enforces this bound,
// so handlers do not each have to remember to.
const MaxAmount Amount = 1e14

// ErrAmountOutOfRange is returned when a parsed value exceeds ±MaxAmount.
var ErrAmountOutOfRange = fmt.Errorf("money: amount magnitude exceeds %s", MaxAmount)

// checkRange validates a parsed minor-unit value against ±MaxAmount.
func checkRange(v int64) error {
	if v > int64(MaxAmount) || v < -int64(MaxAmount) {
		return ErrAmountOutOfRange
	}
	return nil
}

// combine builds minor units from an already-validated major/minor pair,
// rejecting the multiplication before it can overflow.
func combine(major, minor int64, neg bool) (Amount, error) {
	if major > int64(MaxAmount)/100 {
		return 0, ErrAmountOutOfRange
	}
	v := major*100 + minor
	if neg {
		v = -v
	}
	if err := checkRange(v); err != nil {
		return 0, err
	}
	return Amount(v), nil
}

// SplitEqual divides total into n parts. Remainder pennies go to the first
// slots so the sum is always exactly total.
func (a Amount) SplitEqual(n int) []Amount {
	if n <= 0 {
		panic(fmt.Sprintf("money: SplitEqual called with n=%d", n))
	}
	base := a / Amount(n)
	remainder := int(a % Amount(n))
	parts := make([]Amount, n)
	for i := range parts {
		parts[i] = base
		if i < remainder {
			parts[i]++
		}
	}
	return parts
}

func (a Amount) String() string {
	sign := ""
	v := int64(a)
	if v < 0 {
		sign = "-"
		v = -v
	}
	return fmt.Sprintf("%s%d.%02d", sign, v/100, v%100)
}

func (a Amount) MarshalJSON() ([]byte, error) {
	return []byte(`"` + a.String() + `"`), nil
}

func (a *Amount) UnmarshalJSON(b []byte) error {
	s := string(b)
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return fmt.Errorf("money: amount must be a quoted decimal string, got %s", s)
	}
	s = s[1 : len(s)-1]

	parts := strings.Split(s, ".")
	if len(parts) != 2 {
		return fmt.Errorf("money: expected decimal with exactly one '.', got %q", s)
	}
	if len(parts[1]) != 2 {
		return fmt.Errorf("money: expected exactly 2 decimal places, got %q", s)
	}

	neg := false
	if strings.HasPrefix(parts[0], "-") {
		neg = true
		parts[0] = parts[0][1:]
	}

	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return fmt.Errorf("money: invalid major part %q: %w", parts[0], err)
	}
	minor, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return fmt.Errorf("money: invalid minor part %q: %w", parts[1], err)
	}

	v, err := combine(major, minor, neg)
	if err != nil {
		return err
	}
	*a = v
	return nil
}

// ParseDecimal converts a decimal string ("12", "12.5", "12.50", "-2.00")
// into minor units. An empty string is not an error — it returns 0, which
// callers treat as "the provider did not supply this field". Fraction
// digits beyond the second are truncated, not rounded.
//
// Stricter than [Amount.UnmarshalJSON], which requires exactly two decimal
// places: this parser exists for AI-provider output, where the number of
// decimals is whatever the model felt like emitting.
func ParseDecimal(s string) (Amount, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	parts := strings.SplitN(s, ".", 2)
	if !isDigits(parts[0]) {
		return 0, fmt.Errorf("money: invalid major part %q", parts[0])
	}
	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("money: invalid major part %q: %w", parts[0], err)
	}
	var minor int64
	if len(parts) == 2 && len(parts[1]) > 0 {
		frac := parts[1]
		if len(frac) > 2 {
			frac = frac[:2]
		}
		if !isDigits(frac) {
			return 0, fmt.Errorf("money: invalid minor part %q", parts[1])
		}
		n, err := strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("money: invalid minor part %q: %w", frac, err)
		}
		if len(frac) == 1 {
			n *= 10
		}
		minor = n
	}
	return combine(major, minor, neg)
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
