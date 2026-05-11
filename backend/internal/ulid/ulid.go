package ulid

import (
	"crypto/rand"
	"fmt"
	"time"

	"github.com/oklog/ulid/v2"
)

// New generates a new ULID string.
func New() string {
	return ulid.MustNew(ulid.Timestamp(time.Now()), rand.Reader).String()
}

// Validate returns true if s is a valid ULID (26 Crockford base32 chars).
func Validate(s string) bool {
	_, err := ulid.ParseStrict(s)
	return err == nil
}

// MustParse panics if s is not a valid ULID. Use only in tests.
func MustParse(s string) ulid.ULID {
	id, err := ulid.ParseStrict(s)
	if err != nil {
		panic(fmt.Sprintf("ulid: invalid ULID %q: %v", s, err))
	}
	return id
}
