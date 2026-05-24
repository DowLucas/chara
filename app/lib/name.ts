/**
 * Build avatar initials from a user's full name.
 * Returns up to two uppercase letters, drawn from the first and last
 * whitespace-separated parts.
 */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** First word of a name, or null if empty. */
export function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

/**
 * Progressive shortening of a name to fit a target character budget.
 *
 * Tries in order — returns the first variant whose length ≤ `maxChars`:
 *   1. Full name                       — "Lucas Dow Heinonen"
 *   2. First + last                    — "Lucas Heinonen"
 *   3. First + last initial            — "Lucas H."
 *   4. First name only                 — "Lucas"
 *   5. First name truncated + ellipsis — "Luc…"
 *
 * Special inputs (untranslated dash `—`, the string "you") pass through
 * unchanged — they're already short and changing them would mangle UX
 * strings the caller wants to preserve verbatim.
 *
 * `maxChars` defaults to 12 — small enough that two of them plus an
 * arrow separator usually fit a single payments-row line; the caller
 * still gets to wrap if it doesn't.
 */
export function shortName(
  name: string | null | undefined,
  maxChars = 12,
): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Preserve already-short pronouns / dashes verbatim.
  if (trimmed.length <= maxChars) return trimmed;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    // Single-token name longer than budget — truncate with ellipsis,
    // reserving one char for the ellipsis itself.
    return parts[0].slice(0, Math.max(1, maxChars - 1)) + '…';
  }

  const first = parts[0];
  const last = parts[parts.length - 1];

  const firstLast = `${first} ${last}`;
  if (firstLast.length <= maxChars) return firstLast;

  const firstLastInitial = `${first} ${last[0]}.`;
  if (firstLastInitial.length <= maxChars) return firstLastInitial;

  if (first.length <= maxChars) return first;
  return first.slice(0, Math.max(1, maxChars - 1)) + '…';
}

/**
 * Builds a context-aware name shortener scoped to a fixed set of names
 * (typically a group's members). The returned function picks the
 * shortest unambiguous variant for each name:
 *
 *   - "Lucas"          — if no one else in the set shares the first name
 *   - "Lucas H."       — first + last initial, when another "Lucas" exists
 *                        but no other "Lucas H."
 *   - "Lucas Heinonen" — first + full last, when another "Lucas H." exists
 *
 * Multi-token names with the same `first + last-initial` collision fall
 * back to `first + last`. Single-token names are returned as-is — there
 * is nothing more to add for disambiguation. Empty / null returns "?".
 *
 * Comparison is case-insensitive; the returned string preserves the
 * original capitalization. Build once per render scope; calling per row
 * is fine but wasteful if N is large.
 */
export function makeNameShortener(
  names: ReadonlyArray<string | null | undefined>,
): (name: string | null | undefined) => string {
  const cleaned: string[] = [];
  for (const n of names) {
    const trimmed = (n ?? '').trim();
    if (trimmed) cleaned.push(trimmed);
  }

  const firstCounts = new Map<string, number>();
  const firstLastInitialCounts = new Map<string, number>();
  for (const n of cleaned) {
    const parts = n.split(/\s+/);
    const f = parts[0].toLowerCase();
    firstCounts.set(f, (firstCounts.get(f) ?? 0) + 1);
    if (parts.length > 1) {
      const li = parts[parts.length - 1][0].toLowerCase();
      const key = `${f} ${li}`;
      firstLastInitialCounts.set(key, (firstLastInitialCounts.get(key) ?? 0) + 1);
    }
  }

  return (name) => {
    if (!name) return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/);
    const first = parts[0];
    const firstLower = first.toLowerCase();

    // No collision on first name → first name wins.
    if ((firstCounts.get(firstLower) ?? 0) <= 1) return first;
    // Single-token name with a collision — nothing more to add.
    if (parts.length === 1) return first;

    const last = parts[parts.length - 1];
    const liKey = `${firstLower} ${last[0].toLowerCase()}`;
    if ((firstLastInitialCounts.get(liKey) ?? 0) <= 1) {
      return `${first} ${last[0]}.`;
    }
    return `${first} ${last}`;
  };
}
