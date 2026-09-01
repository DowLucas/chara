package handler

import (
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/DowLucas/chara/internal/money"
)

// Length ceilings for user-supplied free text.
//
// These columns are all unconstrained TEXT, so without a check a member can
// store a multi-megabyte string that then rides along in every list response
// for the group, in the activity feed payload, and in the body of the push
// notification sent to everyone else. The limits are generous enough that no
// real title, note or group name hits them, and small enough that none of
// those surfaces can be used as storage.
const (
	maxTitleLen     = 200
	maxNotesLen     = 2000
	maxGroupNameLen = 100
)

// validateText rejects a string longer than max characters. Length is counted
// in runes, not bytes: a title of 200 emoji is 200 characters to the user and
// 800 bytes to Go, and rejecting it would be surprising.
//
// `field` names the offending field in the error, which is surfaced to the
// client as the 400 body.
func validateText(s string, max int, field string) error {
	if utf8.RuneCountInString(s) > max {
		return fmt.Errorf("%s must be at most %d characters", field, max)
	}
	return nil
}

// decodeErrorMessage turns a JSON decode failure into a message that is safe
// and useful to return to the client.
//
// `err.Error()` from encoding/json leaks Go internals ("json: cannot unmarshal
// string into Go struct field createExpenseReq.amount of type money.Amount"),
// which tells the caller nothing actionable. But a custom UnmarshalJSON error
// travels through the decoder unwrapped, and money's range error is exactly
// the kind of thing the client needs to see, so it is passed through.
func decodeErrorMessage(err error) string {
	if errors.Is(err, money.ErrAmountOutOfRange) {
		return err.Error()
	}
	return "invalid JSON body"
}
