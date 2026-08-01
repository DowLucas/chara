//go:build integration

package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// inviteCounter shared across this file so each subtest mints unique
// emails/group names without colliding with the shared truncate-per-test
// fixture. We can't use t.Name() because some helpers want short strings.
var inviteCounter = 0

func nextSuffix() string {
	inviteCounter++
	return fmt.Sprintf("inv%d", inviteCounter)
}

// seedInviteGroup creates a user + group and returns the group's invite
// token along with the inviter's display name. The owner is recorded as the
// invite-token creator (matching production CreateGroup behaviour).
func seedInviteGroup(t *testing.T, env *testutil.Env, groupName, ownerName string, opts ...func(*db.Group)) (db.Group, string) {
	t.Helper()
	suffix := nextSuffix()
	owner := testutil.CreateUser(t, env.Pool, suffix+"@example.com", ownerName)
	group, _ := testutil.CreateGroup(t, env.Pool, groupName, "SEK", owner.ID, ownerName)
	for _, opt := range opts {
		opt(&group)
	}
	return group, owner.ID
}

// doRequest sends a request via env.Router with an explicit RemoteAddr so the
// per-IP rate limiter sees the address we want. httptest's ResponseRecorder
// doesn't set RemoteAddr automatically; we set it here so per-IP buckets can
// be exercised deterministically.
func doRequest(t *testing.T, env *testutil.Env, method, path, remoteAddr string) *httptest.ResponseRecorder {
	t.Helper()
	req, err := http.NewRequest(method, path, nil)
	require.NoError(t, err)
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	rr := httptest.NewRecorder()
	env.Router.ServeHTTP(rr, req)
	return rr
}

// ── Preview endpoint ─────────────────────────────────────────────────────────

func TestInvitePreview_OkState_WithInviter(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.1:1234")
	require.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "ok", body["state"])
	assert.Equal(t, "Roommates", body["groupName"])
	assert.EqualValues(t, 1, body["memberCount"])
	assert.Equal(t, "Lucas", body["inviterName"])
	assert.Equal(t, "localhost:8080", body["serverHost"])
	assert.NotEmpty(t, body["serverName"])
}

// On the hosted instance the preview's serverName is the friendly "Chara
// Cloud" display name while serverHost stays the raw host.
func TestInvitePreview_HostedState_ServerNameIsCharaCloud(t *testing.T) {
	env := setupEnv(t)
	env.Config.InstanceMode = "hosted"
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.20:1234")
	require.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "Chara Cloud", body["serverName"])
	assert.Equal(t, "localhost:8080", body["serverHost"])
}

func TestInvitePreview_OkState_NullInviter(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")

	// Clear the creator column to simulate a legacy token.
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE groups SET invite_token_created_by_user_id = NULL WHERE id = $1", group.ID)
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.2:1234")
	require.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "ok", body["state"])
	assert.Nil(t, body["inviterName"], "inviterName must be null when the column is NULL")
}

func TestInvitePreview_LockedState(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")
	_, err := env.Queries.SetGroupLocked(context.Background(), db.SetGroupLockedParams{
		ID: group.ID, IsLocked: true,
	})
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.3:1234")
	require.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "locked", body["state"])
	assert.Equal(t, "Roommates", body["groupName"])
	assert.Equal(t, "Lucas", body["inviterName"])
}

func TestInvitePreview_ArchivedState(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Old Trip", "Lucas")
	_, err := env.Queries.UpdateGroup(context.Background(), db.UpdateGroupParams{
		ID:         group.ID,
		IsArchived: pgtype.Bool{Bool: true, Valid: true},
	})
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.4:1234")
	require.Equal(t, http.StatusOK, rr.Code)

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "archived", body["state"])
	// Minimal payload — no group details leaked.
	_, hasName := body["groupName"]
	assert.False(t, hasName, "archived response must not include groupName")
}

func TestInvitePreview_InvalidState(t *testing.T) {
	env := setupEnv(t)

	rr := doRequest(t, env, "GET", "/api/invites/not_a_real_token/preview", "10.0.0.5:1234")
	require.Equal(t, http.StatusOK, rr.Code, "invalid tokens still return 200 with state discriminator")

	var body map[string]any
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "invalid", body["state"])
}

func TestInvitePreview_NoIndexHeader(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")
	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.6:1234")
	assert.Equal(t, "noindex, nofollow", rr.Header().Get("X-Robots-Tag"))
}

func TestInvitePreview_NoStoreHeader(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")
	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.7:1234")
	assert.Equal(t, "no-store", rr.Header().Get("Cache-Control"))
}

func TestInvitePreview_UnauthenticatedAllowed(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")
	// No Authorization header — must still succeed (preview is public).
	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.0.0.8:1234")
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestInvitePreview_RateLimited_PerIP(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")

	// Per-IP cap is 30/min. 30 calls succeed, the 31st returns 429.
	ip := "10.99.0.1:1111"
	for i := 0; i < 30; i++ {
		rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", ip)
		require.Equalf(t, http.StatusOK, rr.Code, "request %d should pass", i+1)
	}
	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", ip)
	assert.Equal(t, http.StatusTooManyRequests, rr.Code)
}

func TestInvitePreview_RateLimited_PerToken(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")

	// Per-token cap is 60/min. Fire 60 calls from rotating IPs (so the
	// per-IP bucket never fills), then the 61st must be 429 from the
	// per-token bucket.
	for i := 0; i < 60; i++ {
		ip := fmt.Sprintf("10.50.%d.%d:1234", i/256, i%256)
		rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", ip)
		require.Equalf(t, http.StatusOK, rr.Code, "request %d should pass", i+1)
	}
	rr := doRequest(t, env, "GET", "/api/invites/"+group.InviteToken+"/preview", "10.51.0.1:1234")
	assert.Equal(t, http.StatusTooManyRequests, rr.Code)
}

// ── Landing endpoint ─────────────────────────────────────────────────────────

func TestInviteLanding_OkState_ContainsExpectedStrings(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.1:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "Chara")
	assert.Contains(t, body, "Open-source bill splitting you can self-host.")
	assert.Contains(t, body, "Roommates")
	assert.Contains(t, body, "Lucas invited you to")
	assert.Contains(t, body, "apps.apple.com/app/id6773089720")
	assert.Contains(t, body, "play.google.com/store/apps/details?id=chara.app")
	assert.Contains(t, body, "chara://join?invite=")
	// The invite= value is the urlencoded BaseURL (test env uses http://) —
	// assert single-pass encoding, not double-encoded (%253A).
	assert.Contains(t, body, "http%3A%2F%2Flocalhost%3A8080%2Fi%2F"+group.InviteToken)
	assert.NotContains(t, body, "%253A", "URL must not be double-encoded")
	assert.Contains(t, body, "localhost:8080") // footer "Server: ..."
}

// doRequestUA is doRequest with a User-Agent header set, so we can exercise
// the OS-aware store-badge rendering on the landing page.
func doRequestUA(t *testing.T, env *testutil.Env, path, userAgent string) *httptest.ResponseRecorder {
	t.Helper()
	req, err := http.NewRequest("GET", path, nil)
	require.NoError(t, err)
	req.RemoteAddr = "10.0.1.1:1234"
	req.Header.Set("User-Agent", userAgent)
	rr := httptest.NewRecorder()
	env.Router.ServeHTTP(rr, req)
	return rr
}

const (
	iosUA     = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
	androidUA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
	desktopUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

// On iOS, only the App Store badge should render — showing a Play Store button
// to an iPhone user is the friction we're removing.
func TestInviteLanding_IOSUserAgent_ShowsOnlyAppStore(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequestUA(t, env, "/i/"+group.InviteToken, iosUA)
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "apps.apple.com/app/id6773089720")
	assert.NotContains(t, body, "play.google.com")
}

// On Android, only the Google Play badge should render.
func TestInviteLanding_AndroidUserAgent_ShowsOnlyPlay(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequestUA(t, env, "/i/"+group.InviteToken, androidUA)
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "play.google.com/store/apps/details?id=chara.app")
	assert.NotContains(t, body, "apps.apple.com")
}

// On desktop / unknown clients we can't pick a store, so show both badges.
func TestInviteLanding_DesktopUserAgent_ShowsBoth(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")

	rr := doRequestUA(t, env, "/i/"+group.InviteToken, desktopUA)
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "apps.apple.com/app/id6773089720")
	assert.Contains(t, body, "play.google.com/store/apps/details?id=chara.app")
}

// ── In-app browsers ──────────────────────────────────────────────────────────
//
// Snapchat, Instagram, Facebook et al. render links in an embedded WKWebView /
// Android WebView that silently drops navigation to non-http(s) schemes, and
// where iOS Universal Links never fire. So the chara:// button does nothing at
// all — no prompt, no error — and there is no page-side trick that can hand off
// to the installed app. The only working path is to get the visitor out to a
// real browser, so in those clients we replace the dead link with instructions.

const (
	snapchatIOSUA   = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.94.0.42 (like Safari/604.1)"
	instagramIOSUA  = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90 (iPhone14,3; iOS 17_5; en_US)"
	facebookIOSUA   = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.44.107;FBBV/605230101]"
	tiktokAndroidUA = "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 trill_320404 BytedanceWebview/d8a21c6"
)

// The reported bug: a friend opened the invite inside Snapchat on an iPhone and
// "Open in Chara" did nothing. Offering a link that cannot possibly work is the
// defect — show the escape route instead.
func TestInviteLanding_SnapchatIOS_ReplacesDeadLinkWithInstructions(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Skidresa", "Anna")

	rr := doRequestUA(t, env, "/i/"+group.InviteToken, snapchatIOSUA)
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	// The dead link must be gone — it is a silent no-op in this webview.
	assert.NotContains(t, body, "chara://join",
		"the chara:// link cannot work inside an in-app browser and must not be offered")
	// Name the app the user is actually in, the menu glyph they're looking
	// for, and the menu item — guessing at any of these is the difference
	// between a followable instruction and a dead end.
	assert.Contains(t, body, "Snapchat")
	assert.Contains(t, body, "&bull;&bull;&bull;")
	assert.Contains(t, body, "Open in Safari")
	// The steps must not stop at Safari: say what to tap once there, using
	// the exact label of the link that renders in a real browser.
	assert.Contains(t, body, "Open in Chara")
	// The invite itself still renders, and installing is still one tap away.
	assert.Contains(t, body, "Skidresa")
	assert.Contains(t, body, "apps.apple.com/app/id6773089720")
}

// Android in-app webviews have the same limitation; only the menu wording and
// the store badge differ.
func TestInviteLanding_TikTokAndroid_ShowsBrowserInstructions(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Skidresa", "Anna")

	rr := doRequestUA(t, env, "/i/"+group.InviteToken, tiktokAndroidUA)
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.NotContains(t, body, "chara://join")
	assert.Contains(t, body, "TikTok")
	assert.Contains(t, body, "Open in browser")
	assert.Contains(t, body, "Open in Chara")
	// Android's overflow menu is a vertical ellipsis, not iOS's horizontal one.
	assert.Contains(t, body, "&#8942;")
	assert.NotContains(t, body, "Open in Safari", "Safari wording is iOS-only")
	assert.NotContains(t, body, "&bull;&bull;&bull;", "horizontal ellipsis is iOS-only")
	assert.Contains(t, body, "play.google.com/store/apps/details?id=chara.app")
}

func TestInviteLanding_OtherInAppBrowsers_AreDetected(t *testing.T) {
	cases := []struct {
		name, ua, wantAppName string
	}{
		{"instagram", instagramIOSUA, "Instagram"},
		{"facebook", facebookIOSUA, "Facebook"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := setupEnv(t)
			group, _ := seedInviteGroup(t, env, "Skidresa", "Anna")

			rr := doRequestUA(t, env, "/i/"+group.InviteToken, tc.ua)
			require.Equal(t, http.StatusOK, rr.Code)
			body := rr.Body.String()

			assert.NotContains(t, body, "chara://join")
			assert.Contains(t, body, tc.wantAppName)
		})
	}
}

// Regression guard on the detector itself: a real browser must keep the
// working link. Safari's UA contains "Safari", Chrome's contains both
// "Chrome" and "Safari" — neither may trip an in-app-browser token.
func TestInviteLanding_RealBrowsers_KeepTheAppLink(t *testing.T) {
	for name, ua := range map[string]string{
		"ios safari":     iosUA,
		"android chrome": androidUA,
		"desktop chrome": desktopUA,
	} {
		t.Run(name, func(t *testing.T) {
			env := setupEnv(t)
			group, _ := seedInviteGroup(t, env, "Skidresa", "Anna")

			rr := doRequestUA(t, env, "/i/"+group.InviteToken, ua)
			require.Equal(t, http.StatusOK, rr.Code)
			body := rr.Body.String()

			assert.Contains(t, body, "chara://join?invite=")
			assert.NotContains(t, body, "Open in Safari")
		})
	}
}

// On the hosted instance the footer shows the friendly "Chara Cloud" name
// instead of the raw API host. Self-hosted instances keep showing their host
// (covered by TestInviteLanding_OkState_ContainsExpectedStrings above).
func TestInviteLanding_HostedState_FooterShowsCharaCloud(t *testing.T) {
	env := setupEnv(t)
	env.Config.InstanceMode = "hosted"
	group, _ := seedInviteGroup(t, env, "Kroatien", "Lucas")

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.20:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "Server: Chara Cloud")
	assert.NotContains(t, body, "Server: localhost")
}

func TestInviteLanding_OkState_NullInviter_FallsBackCopy(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")
	_, err := env.Pool.Exec(context.Background(),
		"UPDATE groups SET invite_token_created_by_user_id = NULL WHERE id = $1", group.ID)
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.2:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "You") // "You're invited to ..."
	assert.Contains(t, body, "invited to")
	assert.NotContains(t, body, "Lucas invited you to")
}

func TestInviteLanding_LockedState_ContainsLockCopy(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Roommates", "Lucas")
	_, err := env.Queries.SetGroupLocked(context.Background(), db.SetGroupLockedParams{
		ID: group.ID, IsLocked: true,
	})
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.3:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	assert.Contains(t, body, "stopped accepting members")
	assert.NotContains(t, body, "apps.apple.com")
	assert.NotContains(t, body, "chara://join")
}

func TestInviteLanding_InvalidState_ContainsInvalidCopy(t *testing.T) {
	env := setupEnv(t)
	rr := doRequest(t, env, "GET", "/i/garbage_not_a_real_token", "10.0.1.4:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()
	assert.Contains(t, body, "doesn")
	assert.Contains(t, body, "work")
	assert.NotContains(t, body, "apps.apple.com")
	assert.NotContains(t, body, "chara://join")
}

func TestInviteLanding_ArchivedState_ContainsInvalidCopy(t *testing.T) {
	// Archived + invalid render identical "doesn't work" copy per spec.
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Old Trip", "Lucas")
	_, err := env.Queries.UpdateGroup(context.Background(), db.UpdateGroupParams{
		ID:         group.ID,
		IsArchived: pgtype.Bool{Bool: true, Valid: true},
	})
	require.NoError(t, err)

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.5:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()
	assert.Contains(t, body, "doesn")
	assert.Contains(t, body, "work")
}

func TestInviteLanding_NoIndexHeader(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")

	cases := []string{
		"/i/" + group.InviteToken,     // ok
		"/i/garbage_not_a_real_token", // invalid
	}
	for _, path := range cases {
		rr := doRequest(t, env, "GET", path, "10.0.1.10:1234")
		assert.Equal(t, "noindex, nofollow", rr.Header().Get("X-Robots-Tag"),
			"X-Robots-Tag must be set on %s", path)
	}
}

func TestInviteLanding_ContentType(t *testing.T) {
	env := setupEnv(t)
	group, _ := seedInviteGroup(t, env, "Trip", "Lucas")
	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.11:1234")
	assert.Equal(t, "text/html; charset=utf-8", rr.Header().Get("Content-Type"))
}

func TestInviteLanding_AutoEscapesGroupName(t *testing.T) {
	env := setupEnv(t)
	suffix := nextSuffix()
	owner := testutil.CreateUser(t, env.Pool, suffix+"@example.com", "Lucas")
	group, _ := testutil.CreateGroup(t, env.Pool, "<script>alert(1)</script>", "SEK", owner.ID, "Lucas")

	rr := doRequest(t, env, "GET", "/i/"+group.InviteToken, "10.0.1.12:1234")
	require.Equal(t, http.StatusOK, rr.Code)
	body := rr.Body.String()

	// html/template must have escaped the angle brackets — raw <script> tag
	// must not appear in the output.
	assert.False(t, strings.Contains(body, "<script>alert(1)</script>"),
		"raw <script> tag must not appear in rendered HTML")
	assert.Contains(t, body, "&lt;script&gt;")
}
