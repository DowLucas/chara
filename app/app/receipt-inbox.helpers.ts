/**
 * Pure route + list construction for the receipt inbox. Split out from the
 * screen because the repo has no render-testing setup — see
 * components/__tests__/GroupEmptyState.test.tsx for the same pattern.
 */

import type { AccountRead } from '@/lib/aggregated-reads';
import type { Group } from '@/lib/api';

export interface GroupChoice {
  serverUrl: string;
  groupId: string;
  name: string;
  currency: string;
}

/** Composite identity: the server is always encodeURIComponent-encoded in
 *  the path (CLAUDE.md). */
export function addExpenseHref(serverUrl: string, groupId: string): string {
  return `/groups/${encodeURIComponent(serverUrl)}/${groupId}/add-expense`;
}

/**
 * Flatten every linked account's groups into one pick list.
 *
 * Order: the sticky server first (choosing a group for a shared file is a
 * server-ambiguous action, which CLAUDE.md routes via lastUsedCreateServerUrl),
 * then the remaining accounts in list order. Within an account the server's
 * own group order is preserved — `Group` carries no last-activity field, so
 * inventing a sort key here would be inventing data.
 */
export function flattenGroupChoices(
  reads: AccountRead<Group[]>[],
  stickyServerUrl: string | null,
): GroupChoice[] {
  const ordered = [...reads].sort((x, y) => {
    if (x.serverUrl === stickyServerUrl) return -1;
    if (y.serverUrl === stickyServerUrl) return 1;
    return 0;
  });

  const out: GroupChoice[] = [];
  for (const r of ordered) {
    if (r.status === 'error' || !r.data) continue;
    for (const g of r.data) {
      out.push({
        serverUrl: r.serverUrl,
        groupId: g.id,
        name: g.name,
        currency: g.currency,
      });
    }
  }
  return out;
}
