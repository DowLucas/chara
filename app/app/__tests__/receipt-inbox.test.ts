/**
 * Picking a group for a shared receipt is a server-ambiguous action, so it
 * follows the lastUsedCreateServerUrl sticky-server rule from CLAUDE.md, and
 * the composite-identity rule that serverUrl is encodeURIComponent-encoded in
 * every route.
 *
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */

import { addExpenseHref, flattenGroupChoices } from '../receipt-inbox.helpers';

function read(serverUrl: string, groups: Array<{ id: string; name: string }>, status = 'ok') {
  return {
    serverUrl,
    user: { id: 'u', email: 'a@b.c', name: 'a' },
    status,
    data: groups.map((g) => ({ ...g, currency: 'SEK' })),
    error: null,
    stale: false,
  } as never;
}

describe('addExpenseHref', () => {
  it('encodes the server url in the path', () => {
    expect(addExpenseHref('https://chara.cloud', 'g1'))
      .toBe('/groups/https%3A%2F%2Fchara.cloud/g1/add-expense');
  });

  it('encodes a self-hosted url with a port', () => {
    expect(addExpenseHref('http://192.168.1.10:8080', 'abc'))
      .toBe('/groups/http%3A%2F%2F192.168.1.10%3A8080/abc/add-expense');
  });
});

describe('flattenGroupChoices', () => {
  const a = read('https://a.example', [{ id: 'a1', name: 'Skidresan' }, { id: 'a2', name: 'Lgh 4B' }]);
  const b = read('https://b.example', [{ id: 'b1', name: 'Barcelona' }]);

  it('preserves each account order and each server group order', () => {
    expect(flattenGroupChoices([a, b], null).map((c) => c.groupId))
      .toEqual(['a1', 'a2', 'b1']);
  });

  it('hoists the sticky server to the front', () => {
    expect(flattenGroupChoices([a, b], 'https://b.example').map((c) => c.groupId))
      .toEqual(['b1', 'a1', 'a2']);
  });

  it('ignores a sticky server that is no longer linked', () => {
    expect(flattenGroupChoices([a, b], 'https://gone.example').map((c) => c.groupId))
      .toEqual(['a1', 'a2', 'b1']);
  });

  it('skips accounts that failed to load rather than showing an empty server', () => {
    const failed = read('https://c.example', [], 'error');
    expect(flattenGroupChoices([a, failed], null).map((c) => c.serverUrl))
      .toEqual(['https://a.example', 'https://a.example']);
  });

  it('returns an empty list when no account has groups', () => {
    expect(flattenGroupChoices([read('https://a.example', [])], null)).toEqual([]);
  });

  it('carries the group currency through', () => {
    expect(flattenGroupChoices([a], null)[0]).toMatchObject({
      serverUrl: 'https://a.example',
      groupId: 'a1',
      name: 'Skidresan',
      currency: 'SEK',
    });
  });
});
