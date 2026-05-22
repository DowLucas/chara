package money_test

import (
	"encoding/json"
	"testing"

	"github.com/DowLucas/chara/internal/money"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAmount_SplitEqual(t *testing.T) {
	tests := []struct {
		name  string
		total money.Amount
		n     int
		want  []money.Amount
	}{
		{"divides evenly", 9, 3, []money.Amount{3, 3, 3}},
		{"remainder goes to first", 10, 3, []money.Amount{4, 3, 3}},
		{"100 into 3", 100, 3, []money.Amount{34, 33, 33}},
		{"zero total", 0, 5, []money.Amount{0, 0, 0, 0, 0}},
		{"one person", 99, 1, []money.Amount{99}},
		{"large amount", 10000, 3, []money.Amount{3334, 3333, 3333}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.total.SplitEqual(tt.n)
			assert.Equal(t, tt.want, got)
			// sum must always equal original total
			var sum money.Amount
			for _, v := range got {
				sum += v
			}
			assert.Equal(t, tt.total, sum, "split pieces must sum to total")
		})
	}
}

func TestAmount_SplitEqual_Panics(t *testing.T) {
	assert.Panics(t, func() { money.Amount(100).SplitEqual(0) })
	assert.Panics(t, func() { money.Amount(100).SplitEqual(-1) })
}

func TestAmount_MarshalJSON(t *testing.T) {
	tests := []struct {
		amount money.Amount
		want   string
	}{
		{12345, `"123.45"`},
		{100, `"1.00"`},
		{1, `"0.01"`},
		{0, `"0.00"`},
		{-12345, `"-123.45"`},
		{1000000, `"10000.00"`},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			b, err := json.Marshal(tt.amount)
			require.NoError(t, err)
			assert.Equal(t, tt.want, string(b))
		})
	}
}

func TestAmount_UnmarshalJSON(t *testing.T) {
	tests := []struct {
		input string
		want  money.Amount
	}{
		{`"123.45"`, 12345},
		{`"1.00"`, 100},
		{`"0.01"`, 1},
		{`"0.00"`, 0},
		{`"-123.45"`, -12345},
		{`"10000.00"`, 1000000},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			var a money.Amount
			require.NoError(t, json.Unmarshal([]byte(tt.input), &a))
			assert.Equal(t, tt.want, a)
		})
	}
}

func TestAmount_UnmarshalJSON_RejectsFloat(t *testing.T) {
	var a money.Amount
	err := json.Unmarshal([]byte(`123.45`), &a)
	assert.Error(t, err, "bare JSON number must be rejected")
}

func TestAmount_UnmarshalJSON_RejectsThreeDecimals(t *testing.T) {
	var a money.Amount
	err := json.Unmarshal([]byte(`"123.456"`), &a)
	assert.Error(t, err, "three decimal places must be rejected")
}

func TestAmount_UnmarshalJSON_RejectsInvalidString(t *testing.T) {
	var a money.Amount
	err := json.Unmarshal([]byte(`"abc"`), &a)
	assert.Error(t, err)
}

func TestAmount_String(t *testing.T) {
	assert.Equal(t, "123.45", money.Amount(12345).String())
	assert.Equal(t, "0.00", money.Amount(0).String())
	assert.Equal(t, "-1.00", money.Amount(-100).String())
}
