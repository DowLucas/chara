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
