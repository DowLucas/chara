# Chara App

The cross-platform client for [Chara](../README.md), an open-source, self-hostable bill-splitting app (a Splitwise alternative). One Expo/React Native codebase ships to **iOS, Android, and Web**.

## Stack

- **Expo SDK ~54** with **Expo Router** (file-based routing, typed routes)
- **React Native 0.81** / **React 19** / **TypeScript**
- **pnpm** for package management
- **i18next + react-i18next + expo-localization** for internationalization

### Multi-server architecture

Chara is not tied to a single backend. The app holds **N independent server-accounts at once** and aggregates their data into one UI — this is aggregation, not federation: the servers never talk to each other, and "linking" lives only inside the app on the device. A group is identified app-wide by the composite key `(serverUrl, groupId)`, reads fan out across accounts in parallel and tolerate partial failure, and writes are routed by context (the group's own server) rather than a global "active account". This lets one app talk to the hosted Chara Cloud and one or more self-hosted instances simultaneously.

## Prerequisites

- **Node.js** (LTS) and **[pnpm](https://pnpm.io)**
- **[Expo CLI](https://docs.expo.dev)** (used via `pnpm`/`npx`; EAS CLI for native builds)
- For native development: **Xcode** (iOS) and/or **Android Studio** (Android)

## Quick start

```sh
pnpm install
pnpm start          # start the Expo dev server (Metro)
```

Then launch a target:

```sh
pnpm ios            # open in the iOS simulator
pnpm android        # open on an Android device/emulator
pnpm web            # run in the browser
```

### Pointing the app at a backend

Chara's multi-server model means the backend is chosen at sign-in, not baked into the build. In the app, add a server account by URL:

- **Chara Cloud** (hosted) — `https://api.chara.app`
- **A local backend** — run the API from [`../backend`](../backend/README.md) (`./run-backend` from the repo root) and add its URL. On a simulator that's typically `http://localhost:8080`; on a physical device use your machine's LAN/Tailscale address.

> Self-hosted instances support email magic link and OIDC sign-in. Google and Apple Sign In are hosted-only.

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm start` | Start the Expo dev server. |
| `pnpm ios` | Start and open in the iOS simulator. |
| `pnpm android` | Start and open on Android. |
| `pnpm web` | Start the web build. |
| `pnpm test` | Run the Jest test suite. |
| `pnpm i18n:extract` | Walk every `t('…')` call and update `en.json`. |
| `pnpm i18n:check` | CI gate — fails if `en.json` is out of date with the source. |
| `pnpm build:android` | EAS production build for Android. |
| `pnpm submit:android` | Submit the Android production build via EAS. |

(`pnpm start:tailscale` is also available — same as `start` but binds Metro to the host's Tailscale IP.)

## Testing

Tests run with [Jest](https://jestjs.io) (ts-jest, tests under `__tests__/`):

```sh
pnpm test
```

This project follows TDD — write the failing test first, then the implementation.

## Internationalization

All user-facing strings go through `t()` — no hardcoded copy in JSX, alerts, placeholders, or accessibility labels. Translation catalogs live in `lib/locales/<lang>.json`, namespaced by screen.

- **English is the source of truth in the repo.** `en.json` is owned by the codebase.
- Add a key by wrapping the string in `t('namespace.key')`, then run `pnpm i18n:extract` and set the real English value in `en.json`. Commit the key in the same change.
- Non-English locales (`sv.json`, `de.json`, …) are produced by a self-hosted [Weblate](https://weblate.org) instance and synced back to the repo. Never hand-edit non-English JSON locally.

## Building

Native builds use [EAS Build](https://docs.expo.dev/build/introduction/). The build/submit profiles are defined in [`eas.json`](eas.json).

```sh
# Android (production)
pnpm build:android
pnpm submit:android

# iOS (production) — via EAS profiles
eas build -p ios --profile production
eas submit -p ios --profile production
```

The bundle identifiers are `app.chara` (iOS) and `chara.app` (Android).

## License

Chara is licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](../LICENSE).
