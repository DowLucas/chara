# Chara — App Store Screenshot Sequence

Ten screens, in this order. The first three are what shows in the App Store search-result preview and the listing's above-the-fold carousel — they carry the most weight.

Headlines are taken from or written in the voice of the live marketing site at [getchara.lovable.app](https://getchara.lovable.app/). Read [`voice-and-copy.md`](./voice-and-copy.md) before changing a single word.

Each entry specifies:
- **Eyebrow** (mono caps, citrine, 13pt, letter-spacing 1.0)
- **Headline** (display sans, graphite)
- **Subhead** (body sans, graphite at 75%)
- **Device shows** — what the real screen capture must contain
- **Why this slide** — the moment of value it sells

---

## Slide 1 — Hero

- **Eyebrow:** `CH.01 · THE PROMISE`
- **Headline:** Splitwise capped you. Steven dropped you. Chara won't.
- **Subhead:** Take a photo of the receipt. Chara figures out the rest.
- **Device shows:** Home tab. Giant hero amount `SEK 240,00` in mono, label "You're owed" in graphite, three group cards below ("Tokyo trip · oct", "Apartment 4B", "Mira's wedding") on bone surfaces.
- **Why:** Names the pain by name. Sets brand voice, palette, and the core promise in one breath.

## Slide 2 — Snap

- **Eyebrow:** `CH.02 · SNAP`
- **Headline:** The receipt reads itself.
- **Subhead:** Snap the photo. Chara pulls merchant, date, total — and every line item.
- **Device shows:** Add-expense screen mid-flow. Camera viewfinder overlay at the top with corner ticks. Form below pre-filled from a scan — merchant `ICA Maxi`, amount `1 240,00 SEK`, date `oct 12`.
- **Why:** The headline value. If only one screen makes it into the search preview, this is the one.

## Slide 3 — Fair

- **Eyebrow:** `CH.03 · FAIR`
- **Headline:** You pay for what you ate.
- **Subhead:** Tap each line to assign it to whoever ordered it. The split builds itself.
- **Device shows:** ScanItemsAssign screen. Receipt line items down the left ("Sushi platter", "Sapporo · 2", "Tofu salad"), member-avatar chips beside each. Selected lines highlighted in moss.
- **Why:** Itemized splits — a feature Splitwise gates behind Pro and most OSS doesn't have. Specificity (wine vs. dessert) is the entire trick.

## Slide 4 — Home (any currency)

- **Eyebrow:** `CH.04 · HOME`
- **Headline:** In your own currency, at today's rate.
- **Subhead:** Per-currency truthful. FX for display, never for silent conversion.
- **Device shows:** Group balances panel with mixed currencies — `SEK 240,00 to be paid` and `EUR 22,50 owed`, each on its own line. Citrine FX rate row underneath ("EUR 1 = SEK 11,30 · today").
- **Why:** The travel scenario from the site's hero. Closes the multi-currency story without the technical jargon.

## Slide 5 — Done (settle in a tap)

- **Eyebrow:** `CH.05 · DONE`
- **Headline:** Settled in a tap.
- **Subhead:** Swish in Sweden. Vipps and MobilePay next. Or any payment link you already use.
- **Device shows:** Settlement Impact Sheet open. Citrine "Settle with Swish" button at the bottom. Above, recipient name, `SEK 420,00`, and the message `Chara · Tokyo trip`.
- **Why:** The Nordic wedge. Shows the moat working.

## Slide 6 — Pay the fewest people

- **Eyebrow:** `CH.06 · ONE TAB, ZERO CHAIN`
- **Headline:** Pay the fewest people possible.
- **Subhead:** Chara computes the minimum-cardinality settlement. No "I'll Venmo you, you Swish them."
- **Device shows:** Group standings tab. Suggestion list at top — three rows like "Alice → Bob · SEK 420,00" with citrine chevrons. Per-member balances below in rust/sage.
- **Why:** Concrete algorithmic value. Shows the math working without explaining it.

## Slide 7 — Rent, Netflix, the cleaner

- **Eyebrow:** `CH.07 · IT REPEATS`
- **Headline:** Rent, Netflix, the cleaner.
- **Subhead:** Set the recurring once. Chara drops the expense in and pings the right people to settle.
- **Device shows:** Recurring expenses list in a group. Three rows — "Rent · 12 000 SEK · 1st of each month", "Netflix · 159 SEK · monthly", "Cleaner · 600 SEK · every other week".
- **Why:** The household scenario. Splitwise charges for this. Chara doesn't.
- *Note: only ship this slide once recurring expenses lands (currently P1).*

## Slide 8 — Your homelab. Their server.

- **Eyebrow:** `CH.08 · MULTI-SERVER`
- **Headline:** Your homelab. Their server. One app.
- **Subhead:** Hold every Chara account at once. Groups, balances, and activity aggregated into one inbox.
- **Device shows:** Settings → Accounts list, three rows with different server hostnames (`chara.app`, `split.example.com`, `friend.example`), each with a status dot.
- **Why:** Differentiator nobody else has. The technically-curious audience will pause on this one.

## Slide 9 — One file. One command.

- **Eyebrow:** `CH.09 · SELF-HOST`
- **Headline:** One file. One command.
- **Subhead:** Docker Compose, ARM64 and AMD64, OIDC out of the box. Same app, same code.
- **Device shows:** "Add a server" flow with a URL field `https://split.example.com`. Faint terminal mock behind showing `docker compose up -d` and a green health-check line.
- **Why:** Captures the self-hoster. Quiet signal of AGPL gravity without the lecture.

## Slide 10 — Keep your peace

- **Eyebrow:** `CH.10 · THE OUTRO`
- **Headline:** Split bills. Keep your peace.
- **Subhead:** Open source. EU-hosted, or your own server. Your data stays yours.
- **Device shows:** Activity feed showing a settled timeline. Moss "settled" stamps on each row, mono dates, soft hairline dividers. A small `CHARA` mono stamp top-right of the card.
- **Why:** Closes on the emotional outcome from the site's outro. "Keep your peace" is the line the user remembers.

---

## Optional eleventh slide (Play Store / longer carousel)

**Localized**

- **Eyebrow:** `SVENSKA · BOKMÅL · DANSK · ENGLISH`
- **Headline:** Speaks your language. Quietly.
- **Subhead:** Swedish, Norwegian Bokmål, Danish, and English on launch.
- **Device shows:** Same group view in Swedish — "Du är skyldig", "Att betala", "Avräkna".

---

## Headline cadence rules

Every headline on this list follows the same set of patterns from `voice-and-copy.md`:

- **Three-clause cadence with periods**, no commas: *"Splitwise capped you. Steven dropped you. Chara won't."*
- **Triple-negative closer**: *"No spreadsheet, no awkward Venmo request, no 'I'll get you next time.'"*
- **Outcome over feature**: *"Keep your peace."* not *"Audit-trailed activity log."*
- **Specifics over abstractions**: *"Rent, Netflix, the cleaner."* not *"Recurring expenses."*

If a proposed headline doesn't match one of these patterns, it's wrong for the slide. Rewrite.

## Localized versions (Swedish storefront)

For the `sv-SE` storefront, translate to:

| EN | SV |
|---|---|
| Splitwise capped you. Steven dropped you. Chara won't. | Splitwise tog betalt. Steven gick ner. Chara stannar. |
| The receipt reads itself. | Kvittot läser sig självt. |
| You pay for what you ate. | Du betalar för det du åt. |
| In your own currency, at today's rate. | I din valuta, dagens kurs. |
| Settled in a tap. | Avräknat med en knapp. |
| Pay the fewest people possible. | Betala så få som möjligt. |
| Rent, Netflix, the cleaner. | Hyran, Netflix, städaren. |
| Your homelab. Their server. One app. | Din server. Deras server. En app. |
| One file. One command. | En fil. Ett kommando. |
| Split bills. Keep your peace. | Dela notan. Behåll lugnet. |

## Copy notes

- **Headlines:** one line, two at the absolute maximum. Period at the end is fine — these are statements, not slogans.
- **Subheads:** one sentence. If it needs a second, the headline is wrong.
- **Never:** exclamation points, emoji in headlines, "🚀", "world's first", "10x", "AI-powered", "next-gen", "revolutionary."
- **Always:** specific over abstract. `SEK 240,00` beats "your balance." `ICA Maxi` beats "Grocery Store." "Wine vs. dessert" beats "itemized splits."
