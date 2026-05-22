# Privacy policy

*Last updated: 22 May 2026*

This policy covers the **Chara hosted service** at `chara.app`. If you self-host Chara on your own server, you are the data controller and this policy does not apply — you set your own.

## 1. Who we are

The hosted service is operated by **Chara AB**, registered in Stockholm, Sweden. You can reach us at [privacy@chara.app](mailto:privacy@chara.app).

## 2. What we collect

Stored against your account:

- **Email address** — required to sign in.
- **Display name** — shown to people in your groups.
- **Avatar URL** — optional.
- **Phone number** — optional; used so people can pay you back via Swish or a similar app. We do not send SMS.
- **Locale** — your preferred language, defaulted from your device.

Stored against your groups and expenses:

- **Expense entries** — amount, currency, date, description, payer, split, and group members.
- **Settlements** — who paid whom and when.
- **Receipts** — any photos or PDFs you choose to attach. If you opt in to receipt scanning, the image is sent to Google's Gemini API for text extraction; the extracted text is stored next to the receipt.
- **Activity log** — for each group we record what changed (expense added/edited/deleted, settlement, member joined/left) so the group has a coherent history.

Stored for operations:

- **Push tokens** — an opaque identifier issued by Expo, plus the platform (iOS / Android / Web) and last-used timestamp, so we can deliver notifications you've enabled.
- **Magic-link tokens** — a one-time random token (hashed at rest), valid for 15 minutes, deleted after use.
- **Request logs** — IP, user agent, path, and status code, written to the host's standard log. These are retained for the lifetime of the host instance; we do not yet run an automatic sweep. We are working on a 30-day retention job.

We do **not** collect: your contacts, your location, advertising identifiers, third-party analytics events, or payment card data (we don't process payments).

## 3. Why we collect it (lawful basis)

- **Contract** (GDPR Art. 6(1)(b)) — to provide the service you signed up for.
- **Legitimate interest** (Art. 6(1)(f)) — request logs for security, abuse prevention, and debugging.
- **Consent** (Art. 6(1)(a)) — push notifications, and the optional Gemini receipt-scanning feature.

## 4. Who sees your data

The people you share groups with see the expenses in those groups. That's the product. Outside that, we use the following processors, all bound by their standard data-processing terms:

- **{{HOSTING_PROVIDER}}** ({{REGION}}) — application hosting, Postgres, and object storage.
- **Cloudflare** (US / global) — DNS, TLS termination, DDoS and bot protection. Sees request metadata, IP, and user agent.
- **Expo / EAS** (US) — push notification delivery. Sees device push tokens and the contents of notifications we send.
- **{{EMAIL_PROVIDER}}** (US) — transactional email (magic-link sign-in). Sees your email address and the contents of those messages.
- **Google (Gemini API)** (US / global) — receipt OCR, only if you use receipt scanning. The receipt image is sent for text extraction.
- **Google (Sign in with Google)** (US) — only if you choose to sign in with Google. We receive your email and name from Google's identity token.
- **Apple (Sign in with Apple)** (US) — only if you choose to sign in with Apple. We receive your email (or a relay address) and name from Apple's identity token.
- **European Central Bank** (EU) — public daily FX reference rates. No personal data sent.
- **Google Fonts** (US / global) — webfonts loaded on the marketing site at `chara.app`. Your IP and user agent are visible to Google when those files load. The app itself does not load Google Fonts.

We do not sell, rent, license, or trade personal data. We do not run advertising on the service.

## 5. Where your data lives

Primary storage and backups are in {{REGION}}. Some processors above are based in the United States; those transfers rely on Standard Contractual Clauses with supplementary measures as required under EU law.

## 6. How long we keep it

- **Active accounts**: as long as the account exists.
- **Account deletion**: on request to [privacy@chara.app](mailto:privacy@chara.app). Self-service deletion from the app is on the roadmap. We action requests within 30 days, and backups holding deleted data rotate out within 90 days.
- **Request logs**: see §2 — currently retained for the lifetime of the host.
- **Billing records**: not applicable while the service is free. Once paid plans launch, 7 years per Swedish accounting law.

## 7. Your rights

Under GDPR you can access your data, correct it, export it, restrict processing, object, and delete your account. To exercise any of these rights, email [privacy@chara.app](mailto:privacy@chara.app). We respond within 30 days. In-app self-service export and deletion are on the roadmap; today these are handled manually by us. You also have the right to complain to your local supervisory authority — in Sweden, that's IMY.

## 8. Security

Transport is TLS, terminated at Cloudflare. The hosting volumes our database and object storage live on are encrypted at the provider level. Access to production is limited to the on-call engineer. Magic-link tokens are random and hashed at rest. We publish a [security overview](./security.md) describing what is in place today and what is still on the roadmap.

## 9. Children

Chara is not directed at children under 13. If you believe a child has signed up, contact us and we'll remove the account.

## 10. Changes

If we change this policy materially, we'll email active users and post a notice in-app. The "last updated" date above always reflects the current version.
