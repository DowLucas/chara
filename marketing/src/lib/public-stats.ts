import { useEffect, useState } from "react";

/**
 * Live usage figures from the Chara instance, served by the backend at
 * GET /api/public/stats. The endpoint is anonymous and aggregate-only — it
 * takes no parameters and returns no per-group, per-user or per-expense
 * field — so nothing here needs to be gated or scrubbed on this side.
 */
export type PublicStats = {
  /** Non-deleted expenses in groups not flagged as demo data. */
  expenses: number;
  /** Authoritative total in USD cents. Prefer this over `value_usd`. */
  value_usd_minor: number;
  /** Same figure as a display string, e.g. "13432.51". */
  value_usd: string;
  /** Currencies that contributed to the total, sorted. */
  currencies: string[];
  /** RFC3339 timestamp of the oldest counted expense, or null. */
  since: string | null;
  generated_at: string;
};

const API_BASE = import.meta.env.VITE_CHARA_API_URL ?? "https://chara-api.lurkhuset.com";

/** Give up rather than hold a section in a loading state indefinitely. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetches the public stats once on mount, client-side only.
 *
 * Deliberately NOT server-rendered: the marketing site's HTML must not depend
 * on the app API being up. A cold or unreachable backend costs us one absent
 * section, never a slow or failed page render.
 *
 * Returns null while loading AND on any failure — callers render nothing in
 * that case. There is no error state on purpose: a marketing page has no
 * useful way to show "stats unavailable", and showing a zero would be worse
 * than showing nothing.
 */
export function usePublicStats(): PublicStats | null {
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetch(`${API_BASE}/api/public/stats`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PublicStats | null) => {
        // Guard the shape as well as the request. A proxy that returns an
        // HTML error page with a 200 would otherwise reach the renderer.
        if (data && typeof data.expenses === "number" && typeof data.value_usd_minor === "number") {
          setStats(data);
        }
      })
      .catch(() => {
        /* Offline, aborted, CORS, malformed — all mean "render nothing". */
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return stats;
}

/**
 * True when the numbers are worth publishing. A brand-new or freshly reset
 * instance reports zeroes, and "0 expenses tracked" is worse copy than no
 * section at all — so the section removes itself instead.
 */
export function hasPublishableStats(stats: PublicStats | null): stats is PublicStats {
  return stats !== null && stats.expenses > 0 && stats.value_usd_minor > 0;
}

/** "2026-05-26T..." → "May 2026" / "maj 2026", or null if absent/unparseable. */
export function formatSince(since: string | null, locale: string): string | null {
  if (!since) return null;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Eases a number from 0 to `target` over `duration` ms on mount.
 *
 * Honours prefers-reduced-motion by jumping straight to the target — the
 * figures are the content, so they must be readable without the animation.
 */
export function useCountUp(target: number, duration: number, reduce: boolean) {
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setV(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);
  return v;
}
