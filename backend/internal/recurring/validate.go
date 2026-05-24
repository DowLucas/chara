package recurring

import (
	"errors"
	"fmt"
	"time"
)

var (
	ErrBadFreqUnit      = errors.New("recurring: freq_unit must be day|week|month|year")
	ErrBadFreqInterval  = errors.New("recurring: freq_interval must be in [1, 365]")
	ErrEndBeforeStart   = errors.New("recurring: end_date must be after start_date")
	ErrBadTimezone      = errors.New("recurring: timezone must be a valid IANA zone")
	ErrBadFireLocalTime = errors.New("recurring: fire_local_time must be HH:MM")
)

func Validate(r Rule) error {
	switch r.FreqUnit {
	case "day", "week", "month", "year":
	default:
		return ErrBadFreqUnit
	}
	if r.FreqInterval < 1 || r.FreqInterval > 365 {
		return ErrBadFreqInterval
	}
	if r.EndDate != nil && !r.EndDate.After(r.StartDate) {
		return ErrEndBeforeStart
	}
	if _, err := time.LoadLocation(r.Timezone); err != nil {
		return fmt.Errorf("%w: %v", ErrBadTimezone, err)
	}
	if len(r.FireLocalTime) != 5 || r.FireLocalTime[2] != ':' {
		return ErrBadFireLocalTime
	}
	hh, mm := parseHHMM(r.FireLocalTime)
	if hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return ErrBadFireLocalTime
	}
	return nil
}
