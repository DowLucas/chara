/**
 * Canonical origin for every absolute URL the site emits.
 *
 * Absolute URLs matter more than they look: `og:url`, `rel=canonical`, the
 * sitemap and the JSON-LD graph are all statements to a crawler about which
 * host owns this content. When they disagree with the host actually serving
 * the page, search engines see two copies of the site and pick one — and the
 * one they pick is whichever the metadata votes for, not whichever you meant.
 *
 * So there is exactly one definition, and every absolute URL is built from it.
 */
export const SITE_URL = "https://getchara.dowtech.dev";

/** Absolute URL for a site-relative path (`/vs/splitwise` → full URL). */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/**
 * The `og:url` entry for a page, to be concatenated into its `meta` array.
 *
 * Deliberately returns the entries rather than a whole `{ meta, links }`
 * object: an object would be spread into `head()` alongside the page's own
 * `meta`, and whichever came last would silently replace the other — losing
 * either the title or the canonical with no error. Concatenation cannot do
 * that.
 */
export function canonicalMeta(path: string) {
  return [{ property: "og:url", content: absoluteUrl(path) }];
}

/** The `rel=canonical` link for a page, for its `links` array. */
export function canonicalLink(path: string) {
  return { rel: "canonical", href: absoluteUrl(path) };
}
