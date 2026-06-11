# Contributing to Chara

Thanks for your interest in Chara — an open-source, self-hostable bill-splitting app (a Splitwise alternative for people who care where their data lives).

Contributions of all kinds are welcome:

- **Bug reports** — clear reproductions are gold.
- **Features** — please open an issue to discuss before large work, so we can align on scope.
- **Documentation** — fixes and improvements to `docs/`, READMEs, and inline comments.
- **Translations** — see the [i18n](#i18n) section below.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

These mirror how the codebase is built. They bias toward caution — use judgment on trivial changes.

- **Think first.** State your assumptions before implementing. If multiple interpretations exist, surface them rather than picking one silently. When something is unclear, ask instead of guessing.
- **Minimum diff.** Write the smallest change that solves the problem. No abstractions for single-use code, no unrequested "flexibility," no error handling for impossible scenarios. If a senior engineer would call it overcomplicated, simplify.
- **Surgical changes.** Touch only what the task requires. Don't refactor adjacent code or normalize style you'd do differently — match what's there. If your change leaves an import or function unused, remove it. Every changed line should trace to the issue you're solving.
- **Verifiable goals.** Translate fuzzy tasks into checkable ones with a verification per step. "Add validation" → write failing tests for invalid inputs, then make them pass. "Fix the bug" → write a failing test that reproduces it, then make it pass.

## Test-Driven Development

This project uses TDD. **Write the failing test first, then the implementation.** No implementation code without a corresponding test written beforehand. When fixing a bug, the first commit-worthy artifact is a test that reproduces it.

## Development setup

Environment setup lives next to the code it concerns — please follow those guides rather than duplicating them here:

- **Backend (Go):** see `backend/README.md`.
- **Mobile/web app (Expo / React Native):** see `app/README.md`.

The repo-root `./run-backend` script is an idempotent way to bring up Postgres, the Go backend, and MinIO for local development.

## i18n

All user-facing strings in the app **must** go through `t()` — no hardcoded English in JSX, alerts, placeholders, `accessibilityLabel`, share sheets, etc.

- Wrap the string in `t('namespace.key')`, then run `pnpm i18n:extract` from `app/` to update the catalog.
- **English is the source of truth** (`app/lib/locales/en.json`), owned by the repo. After extracting, edit the English value to the real sentence in the same commit.
- Other languages are managed in a self-hosted Weblate instance and synced back to the repo. **Do not hand-edit non-English locale files** — let the translation platform produce those diffs.
- Currency codes (`SEK`, `EUR`, …) are data, not UI copy — leave them as plain strings.

PRs that introduce raw English strings are considered incomplete.

## Money

All monetary values are stored and computed as **`int64` minor units** (öre, cents). Decimal strings on the wire. **Never use floats for money** — not in Go, not in TypeScript, not in tests.

## Commits and pull requests

- Keep PRs **small and focused** — one logical change per PR.
- Write **descriptive commit messages** explaining the *why*, not just the *what*.
- Ensure **tests and lint pass** before opening the PR.
- Fill out the **PR template** so reviewers have the context they need.

### Sign-off and licensing

By submitting a pull request, you agree that your contribution is licensed under the project's **AGPL-3.0** license.

We use a [Developer Certificate of Origin](https://developercertificate.org/) style sign-off: add a `Signed-off-by` line to your commits with:

```
git commit -s
```

This certifies you have the right to submit the work under the project license. The maintainer may introduce a formal CLA in the future to allow relicensing flexibility — if so, it will be announced clearly. Until then, the `-s` sign-off is all we ask.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Please read it before participating.
