/**
 * Cookieless web analytics for the marketing site.
 *
 * `cookieless_mode: "always"` is the whole reason this needs no consent
 * banner: posthog-js writes nothing to cookies, localStorage or
 * sessionStorage, and visitors are counted by a hash PostHog derives on its
 * own servers and rotates daily. That keeps the promise made on /cookies
 * intact. The corollary is that `identify()` can never be called from here —
 * in this mode there is no visitor identity to attach, by design.
 *
 * It does not replace `lib/access-log.ts`. That log is server-side and sees
 * every request including the ones this script never runs for (bots, blockers,
 * JS off); this sees in-page behaviour the server cannot infer. Expect the two
 * to disagree, and expect the server log to be the larger number.
 *
 * The project key comes from `VITE_POSTHOG_KEY`, which only the official image
 * build supplies (see Dockerfile / .github/workflows/marketing-image.yml).
 * Forks and local dev leave it unset and this module is a permanent no-op —
 * the same contract as the mobile app's `app/lib/analytics.ts`.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const API_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";

let started = false;

export function initAnalytics(): void {
  // SSR renders this module too; posthog-js must only ever run in the browser.
  if (started || typeof window === "undefined" || !KEY) return;
  started = true;

  // Imported dynamically, not at module scope: a static import pulls ~370 kB
  // of posthog-js into the SSR bundle, where it is never executed.
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: API_HOST,
        ui_host: "https://eu.posthog.com",
        cookieless_mode: "always",
        // The site is a SPA after first paint. Without this only the landing
        // page a visitor happened to arrive on would ever record a pageview,
        // so every /vs/* comparison page reached by in-site navigation would
        // silently show zero traffic.
        capture_pageview: "history_change",
        // Both would be a materially different privacy claim than the one the
        // legal pages make. Off deliberately, not by omission.
        disable_session_recording: true,
        disable_surveys: true,
      });
    })
    .catch((err: unknown) => {
      // Analytics never breaks the page.
      console.warn("[analytics] init failed:", err);
    });
}
