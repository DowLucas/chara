//go:build integration

package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/testutil"
)

func userLocale(t *testing.T, env *testutil.Env, userID string) string {
	t.Helper()
	var loc string
	require.NoError(t, env.Pool.QueryRow(context.Background(),
		`SELECT locale FROM users WHERE id = $1`, userID).Scan(&loc))
	return loc
}

// The app registers its push token on every launch, which is the one moment
// the backend reliably hears from the device — so it is where the device's
// language gets reported. Without this, users.locale is never written and
// the monthly summary push is English for everyone.
func TestPushToken_Register_RecordsLocale(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "loc"), "Loc User")
	token := env.MintToken(t, user.ID, user.Email)

	body := `{"token":"ExponentPushToken[loc1]","platform":"ios","locale":"sv"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
	require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())

	assert.Equal(t, "sv", userLocale(t, env, user.ID))
}

// The device reports its own locale names (zh-Hans, nb-NO, pt-BR). Storing
// the normalized base keeps every later lookup from having to repeat the
// normalisation.
func TestPushToken_Register_NormalizesLocale(t *testing.T) {
	env := newPushEnv(t)
	cases := map[string]string{"zh-Hans": "zh", "nb-NO": "no", "pt-BR": "pt", "SV": "sv"}
	for in, want := range cases {
		user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "norm"), "Norm User")
		token := env.MintToken(t, user.ID, user.Email)
		body := `{"token":"ExponentPushToken[` + want + `]","platform":"ios","locale":"` + in + `"}`
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
		require.Equal(t, http.StatusNoContent, rr.Code, rr.Body.String())
		assert.Equal(t, want, userLocale(t, env, user.ID), "locale %q", in)
	}
}

// The field is optional and best-effort: an older app omits it, and a locale
// this server has no translations for is not a reason to fail the
// registration — push delivery matters more than its language.
func TestPushToken_Register_IgnoresMissingOrUnknownLocale(t *testing.T) {
	env := newPushEnv(t)
	for _, body := range []string{
		`{"token":"ExponentPushToken[none]","platform":"ios"}`,
		`{"token":"ExponentPushToken[bad]","platform":"ios","locale":"klingon"}`,
		`{"token":"ExponentPushToken[empty]","platform":"ios","locale":""}`,
	} {
		user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "opt"), "Opt User")
		token := env.MintToken(t, user.ID, user.Email)
		rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token", body, token))
		require.Equal(t, http.StatusNoContent, rr.Code, body)
		// CreateUser's default stands rather than being blanked.
		assert.Equal(t, "en", userLocale(t, env, user.ID), body)
	}
}

// A user who changes their phone's language gets the new one on next launch.
func TestPushToken_Register_UpdatesLocaleOnChange(t *testing.T) {
	env := newPushEnv(t)
	user := testutil.CreateUser(t, env.Pool, uniqueEmail(t, "chg"), "Chg User")
	token := env.MintToken(t, user.ID, user.Email)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token",
		`{"token":"ExponentPushToken[chg]","platform":"ios","locale":"de"}`, token))
	require.Equal(t, http.StatusNoContent, rr.Code)
	require.Equal(t, "de", userLocale(t, env, user.ID))

	rr = env.Do(t, env.AuthRequest(t, "POST", "/api/me/push-token",
		`{"token":"ExponentPushToken[chg]","platform":"ios","locale":"fr"}`, token))
	require.Equal(t, http.StatusNoContent, rr.Code)
	assert.Equal(t, "fr", userLocale(t, env, user.ID))
}
