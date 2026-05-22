# Cookie policy

*Last updated: 22 May 2026*

Chara keeps cookies and storage to the bare minimum. We don't run analytics scripts and we don't load advertising tags. There's no cookie banner because there's nothing to consent to.

## The marketing site (this page)

The marketing site is static. It sets no cookies and uses no localStorage. It does load webfonts from **Google Fonts** (`fonts.googleapis.com` and `fonts.gstatic.com`); Google Fonts does not set cookies, but Google can see your IP and user agent when those files load.

## The app

The Chara app authenticates you with a JSON Web Token sent in the HTTP `Authorization` header. It is **not** a cookie. The token is held in the mobile app's secure storage (Expo SecureStore on iOS / Android, or browser storage on web) and is never visible to third parties.

The web client may use localStorage for small UI preferences — language and theme. Those values stay on your device and are not sent to the server.

## Third parties

We sit behind Cloudflare. Cloudflare may set `__cf_bm` (bot management, up to 30 minutes) and, on challenged requests, `cf_clearance`. Neither contains personal data; both are set by Cloudflare, not by us.

That's the whole list. If you spot anything we missed, write to [privacy@chara.app](mailto:privacy@chara.app).
