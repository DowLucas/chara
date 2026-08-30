# Changelog

All notable changes to Chara are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.4.1 — 2026-08-30

### Added

- **Chara asks what you think at the moment something went right.** The rating
  sheet now appears just after a debt closes and someone gets paid back,
  instead of only hiding behind You → Rate us. It is the OS sheet, so you
  never leave Chara, and it stays rare: once per version, at most every 120
  days, and never in your first three days. Rate us stays where it was, since
  the OS caps how often the sheet may appear at all.

### Changed

- **Android installs ask for less.** Chara no longer requests permission to
  start itself at boot, and no longer ships the media-playback service it
  never used. Nothing changes in the app; there is simply less of it declared
  to your phone.

## 1.4.0 — 2026-08-29

### Added

- **Say the expense.** Tap the mic on Add expense and describe what you paid
  for — "I paid 480 for dinner with Anna and Sara, and Anna paid 120 for the
  taxi" — and Chara turns it into expense drafts, filling in the amount, who
  paid, who it's split between, and how. One sentence can produce several
  expenses; they queue up and you review each before saving.
- **It understands how people actually talk.** Any language, including
  switching mid-sentence. Spoken numbers ("fyrahundraåttio", "quatre-vingts")
  become amounts, colloquial currency words ("spänn", "bucks") become the
  right currency, and "yesterday" resolves against your own day. Titles are
  written in the group's language so everyone reads the same list, while the
  transcript stays in the words you actually said, so you can correct it.
- **Splits, not just amounts.** "Split it 70/30", "Anna had the steak at 250
  and I had the pasta at 180", "everyone except Erik" — all understood. If
  two people share a first name, Chara asks instead of guessing.
- **Review before anything is saved.** Each draft shows the words that
  produced it, who paid, what each person owes, and a one-line explanation
  of how it was read — so an interpretation like "the rest of the guys"
  (which leaves you off the split) is visible before you commit to it.
  Anything Chara had to guess at is flagged.
- **Scan and Speak** now sit together as compact shortcuts on Add expense,
  instead of two full-width buttons that looked like required steps.

### Fixed

- **Arabic and Simplified Chinese groups could not be created.** The server's
  language list had drifted from the languages the app ships, so choosing
  either was rejected outright — and those users got English AI-generated
  expense titles. Both now work, along with regional codes generally.
- Text across the new screens now respects the system's large-text and
  display-zoom settings instead of overflowing.

### Notes

- Voice entry is limited to 5 recordings per month per person on Chara Cloud
  while we learn what it costs. Correcting a transcript and trying again
  doesn't count against that. Self-hosted instances are unlimited — the
  operator pays their own AI bill.
- Voice needs an AI key, so self-hosted instances only offer it when the
  operator has configured one. **Audio leaves the server** for Google's
  Gemini API when it is; it is never written to disk or logs, and the
  recording is deleted from your device as soon as it is sent.

## 1.0.13 — 2026-07-04

### Added

- **Group-scoped expense categories.** Group owners can now choose which
  expense categories are enabled for their group, and in what order
  (Settings → Preferences → Categories). Editing an expense whose category
  was since disabled still shows that category in the picker so it isn't
  silently dropped.
- **AI category suggestion on receipt scan.** Scanning a receipt now also
  suggests an expense category, scoped to the group's enabled catalog.
- **Offline category suggestion.** Typing an expense title (e.g. "Pizza with
  friends", "Uber to airport") suggests a matching category via local
  keyword matching — no network or AI dependency, works identically on
  self-hosted instances without a Gemini key.
- 15 new built-in categories: utilities, entertainment, travel, shopping,
  health, kids, pets, gifts, subscriptions, insurance, home, sports,
  personal care, electronics, charity.

### Fixed

- The category picker (and any other long `ActionSheet` list) is now
  scrollable instead of overflowing the screen with no way to reach the
  rest of the list or the Cancel button.

## 1.0.12 and earlier

See git history (`git log --oneline`) — changelog tracking starts at 1.0.13.
