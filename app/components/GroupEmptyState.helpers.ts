/**
 * Route builders for the empty-group Overview on-ramp.
 *
 * Per the multi-server composite-identity rule (CLAUDE.md), `serverUrl` is
 * always `encodeURIComponent`-encoded in the path; the consuming screen
 * decodes it on read. The return type is `Href` so expo-router's typed-route
 * checking accepts these at `router.push` call sites.
 */

import type { Href } from 'expo-router';

export function importHref(serverUrl: string, groupId: string): Href {
  return `/groups/${encodeURIComponent(serverUrl)}/${groupId}/import`;
}

export function addExpenseHref(serverUrl: string, groupId: string): Href {
  return `/groups/${encodeURIComponent(serverUrl)}/${groupId}/add-expense`;
}
