# Chara — App Store Screenshot Sequence

Ten screens, in this order. The first three matter most — they're what shows in the App Store search result preview and the listing's above-the-fold carousel.

Each entry specifies:
- **Eyebrow** (mono caps, citrine, 13pt)
- **Headline** (display sans, graphite)
- **Subhead** (body sans, graphite 75%)
- **Device shows** — what the real screen capture must contain
- **Why this slide** — what value it sells

---

## Slide 1 — Hero

- **Eyebrow:** `OPEN SOURCE · NATIVE · NORDIC`
- **Headline:** Split it. Settle it. Call it Chara.
- **Subhead:** Bill splitting that respects your data. Run it on our servers, or your own.
- **Device shows:** Home tab. Giant hero amount `SEK 240,00` in mono, label "You're owed" in graphite, three group cards below (bone surface, mono amounts).
- **Why:** Sets brand voice, palette, and the core promise in two sentences.

## Slide 2 — Multi-server accounts (the unique one)

- **Eyebrow:** `MULTI-SERVER`
- **Headline:** Your homelab. Their server. One app.
- **Subhead:** Hold every Chara account at once. Groups, balances, and activity aggregated into one inbox.
- **Device shows:** Settings → Accounts list, three rows with different server hostnames (chara.app, lurkhuset.com, friend.example), each with a status dot.
- **Why:** Differentiator nobody else has. Lead with the moat.

## Slide 3 — Standings + Settle-up suggestions

- **Eyebrow:** `MINIMUM TRANSFERS`
- **Headline:** Pay the fewest people possible.
- **Subhead:** Chara computes the minimum-cardinality settlement. No "I'll Venmo you, you Swish them" chains.
- **Device shows:** Group standings tab. Suggestion list at top — three rows like "Alice → Bob · SEK 420,00" with citrine chevrons. Below, per-member balances colored rust/sage.
- **Why:** Concrete algorithmic value. Shows the math working.

## Slide 4 — Add expense + receipt scan

- **Eyebrow:** `ADD AN EXPENSE IN SECONDS`
- **Headline:** Snap. Split. Done.
- **Subhead:** Photograph the receipt. Chara pulls merchant, date, and total. Equal split unless you say otherwise.
- **Device shows:** Add-expense screen mid-flow. Scanner overlay near the top with viewfinder ticks. Form below pre-filled with merchant `ICA Maxi`, amount `1 240,00 SEK`.
- **Why:** Speed claim, backed by visible OCR.

## Slide 5 — Itemized split

- **Eyebrow:** `ITEM-BY-ITEM`
- **Headline:** Itemized splits without the spreadsheet.
- **Subhead:** Tap each line to assign it to whoever ordered it. Chara builds the split for you.
- **Device shows:** ScanItemsAssign screen. Receipt line items down the left, member avatar chips beside each. Selected lines highlighted in moss.
- **Why:** Demonstrates a feature Splitwise gates behind Pro and most OSS doesn't have at all.

## Slide 6 — Swish settle

- **Eyebrow:** `SWISH · SE`
- **Headline:** One tap to settle. Real Swish, not a workaround.
- **Subhead:** Settle SEK in two seconds via the Swish app. Vipps and MobilePay next.
- **Device shows:** Settlement Impact Sheet open. Citrine "Settle with Swish" button at the bottom. Above, recipient name, `SEK 420,00`, and the message `Chara · Tokyo trip`.
- **Why:** The Nordic wedge. Shows the moat working.

## Slide 7 — Activity feed

- **Eyebrow:** `EVERY CHANGE, LOGGED`
- **Headline:** A receipt for every move.
- **Subhead:** Edits and deletes are audit-trailed in the same transaction as the change. Trust by construction.
- **Device shows:** Activity tab. Timeline of mono-dated entries: "Alice added · ICA Maxi · SEK 1 240,00", "You settled · Bob · SEK 420,00", in graphite with soft hairline dividers.
- **Why:** Sells the trust story. Critical for finance-adjacent apps.

## Slide 8 — Self-host

- **Eyebrow:** `RUN IT YOURSELF`
- **Headline:** Or run it on your own server.
- **Subhead:** Docker Compose, ARM64 + AMD64, OIDC out of the box. Same app, same code, your hardware.
- **Device shows:** Settings → "Add a server" flow with URL field `https://chara.lurkhuset.com`. Behind it, faint terminal mock with `docker compose up -d` text.
- **Why:** Captures the self-hosting audience. Signals AGPL gravity.

## Slide 9 — Multi-currency, per-currency truthful

- **Eyebrow:** `MONEY MATH YOU CAN TRUST`
- **Headline:** Per-currency, never per-floating-point.
- **Subhead:** Every value stored as integer minor units. FX for display, never for silent conversion.
- **Device shows:** Group with mixed currencies. Balances panel showing `SEK 240,00 to be paid` and `EUR 22,50 owed`, each on its own line. Citrine FX rate row underneath.
- **Why:** Differentiator for the technically careful. Catches the "I tried Splitwise and the math was off" complaint.

## Slide 10 — Localized

- **Eyebrow:** `SVENSKA · BOKMÅL · DANSK · ENGLISH`
- **Headline:** Speaks your language. Quietly.
- **Subhead:** Swedish, Norwegian Bokmål, Danish, and English on launch. Add a new locale by dropping in a JSON file.
- **Device shows:** Same group view in Swedish — "Du är skyldig", "Att betala", "Avräkna". Flag chips along the side or a language picker open.
- **Why:** Closes the Nordic positioning. Signals i18n maturity.

---

## Optional eleventh slide (Play Store only)

**Privacy & data**

- **Eyebrow:** `YOUR DATA, FULL STOP`
- **Headline:** No ads. No trackers. No bank linking.
- **Subhead:** AGPLv3 source. Full CSV/JSON export. EU-hosted on Chara Cloud, or your basement on self-host.

---

## Copy notes

- **Headlines:** one line, two at the absolute maximum. Period at the end is fine — these are statements, not slogans.
- **Subheads:** one sentence. If it needs a second, the headline is wrong.
- **Never:** exclamation points, emoji in headlines, "🚀", "world's first", "10x", "AI-powered", "next-gen", "revolutionary."
- **Always:** specific over abstract. "SEK 240,00" beats "your balance." `ICA Maxi` beats "Grocery Store."

## Localized versions

If shipping screenshots in Swedish, the headlines translate as:

| EN | SV |
|---|---|
| Split it. Settle it. Call it Chara. | Dela. Avräkna. Klart. |
| Your homelab. Their server. One app. | Din server. Deras server. En app. |
| Pay the fewest people possible. | Betala så få som möjligt. |
| Snap. Split. Done. | Knäpp. Dela. Klart. |
| One tap to settle. Real Swish. | En knapp. Riktigt Swish. |
| Or run it on your own server. | Eller kör den själv. |
