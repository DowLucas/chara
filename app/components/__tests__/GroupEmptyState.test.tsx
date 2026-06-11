/**
 * Tests for GroupEmptyState — the empty-group Overview on-ramp.
 *
 * The component itself is purely presentational (two buttons → two
 * callbacks); the repo intentionally omits @testing-library/react-native,
 * so render-time JSX is exercised only at runtime. The one correctness-
 * bearing bit is route construction: per the multi-server composite-identity
 * rule (CLAUDE.md), `serverUrl` must be `encodeURIComponent`-encoded in the
 * path. These helpers are tested here.
 *
 * Spec: docs/superpowers/specs/2026-05-30-import-empty-group-onramp-design.md
 */

import { addExpenseHref, importHref } from '../GroupEmptyState.helpers';

describe('GroupEmptyState route builders', () => {
  const serverUrl = 'https://chara.cloud';
  const groupId = 'g1';

  it('importHref targets the per-group import picker with an encoded server', () => {
    expect(importHref(serverUrl, groupId)).toBe(
      '/groups/https%3A%2F%2Fchara.cloud/g1/import',
    );
  });

  it('addExpenseHref targets add-expense with an encoded server', () => {
    expect(addExpenseHref(serverUrl, groupId)).toBe(
      '/groups/https%3A%2F%2Fchara.cloud/g1/add-expense',
    );
  });

  it('encodes a self-hosted server URL with a port', () => {
    expect(importHref('http://192.168.1.10:8080', 'abc')).toBe(
      '/groups/http%3A%2F%2F192.168.1.10%3A8080/abc/import',
    );
  });
});
