package money

import (
	"fmt"
	"strconv"
	"strings"
)

// Amount represents a monetary value as minor units (öre, cents, etc.).
// Always use this type for money — never float64.
type Amount int64

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

	v := major*100 + minor
	if neg {
		v = -v
	}
	*a = Amount(v)
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
	v := major*100 + minor
	if neg {
		v = -v
	}
	return Amount(v), nil
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
