/**
 * Per-page translation bundles.
 *
 * The two big catalogues (`en.ts` / `sv.ts`) cover the shell and the landing
 * page. Long-form pages that exist to answer one search query bring their own
 * bundle instead, for two reasons: the copy is page-shaped rather than
 * component-shaped, and several people can add pages without every one of them
 * editing the same two files.
 *
 * A bundle exports `{ en, sv }` under a namespace key; `config.ts` deep-merges
 * them into `translation` so `t("selfHost.title")` resolves the same way a
 * landing-page key does.
 */
import { splitwiseAlternative } from "./splitwise-alternative";
import { switchFromSplitwise } from "./switch-from-splitwise";
import { selfHost } from "./self-host";
import { splitwiseDailyLimit } from "./splitwise-daily-limit";
import { versus } from "./versus";

type Bundle = { en: Record<string, unknown>; sv: Record<string, unknown> };

const BUNDLES: Record<string, Bundle> = {
  splitwiseAlternative,
  switchFromSplitwise,
  selfHost,
  splitwiseDailyLimit,
  versus,
};

/**
 * Merge page bundles onto the shell catalogue, one level deep.
 *
 * A shallow spread would be a trap: `selfHost` already exists in `en.ts` for
 * the landing page's terminal strip, so a page bundle under the same
 * namespace would replace it and the homepage would silently render raw keys.
 * Merging the namespace objects instead means a page can extend a namespace
 * the landing page already uses, and only a genuine key-for-key clash is
 * lost — which is the behaviour a reader would assume.
 */
export function mergePageResources(
  lang: "en" | "sv",
  shell: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...shell };
  for (const [ns, bundle] of Object.entries(BUNDLES)) {
    const existing = merged[ns];
    const incoming = bundle[lang];
    merged[ns] =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), ...incoming }
        : incoming;
  }
  return merged;
}
