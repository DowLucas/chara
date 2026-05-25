package email

import (
	"fmt"
	"html"
)

// MagicLinkSubject is the subject for the sign-in magic-link email.
const MagicLinkSubject = "Your sign-in link for Chara"

// MagicLinkBody renders the text and HTML bodies for the magic-link email.
// expiryMinutes is interpolated from the actual MagicLinkTTL configured on
// the server so the user sees the real expiry, not a hardcoded guess.
//
// The HTML version is intentionally minimal: no images, no inline-CSS
// framework, no tracking pixels. Just a real <a> tag so picky clients
// (Outlook, Apple Mail) render the link correctly.
func MagicLinkBody(link string, expiryMinutes int) (text, htmlBody string) {
	text = fmt.Sprintf(`Hi,

Tap the link to sign in to Chara:

%s

This link expires in %d minutes. If you didn't request a sign-in link, you can ignore this email — no action is needed.

— Chara
`, link, expiryMinutes)

	safeLink := html.EscapeString(link)
	htmlBody = fmt.Sprintf(`<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5;">
<p>Hi,</p>
<p>Tap the link to sign in to Chara:</p>
<p><a href="%s" style="font-family: -apple-system, sans-serif; color: #1a1a1a;">%s</a></p>
<p>This link expires in %d minutes. If you didn't request a sign-in link, you can ignore this email — no action is needed.</p>
<p>— Chara</p>
</body>
</html>`, safeLink, safeLink, expiryMinutes)

	return text, htmlBody
}
