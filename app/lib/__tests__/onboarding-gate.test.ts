import { decideGroupsGate, GroupsGateRead } from '../onboarding-gate';

const read = (
  status: GroupsGateRead['status'],
  data: unknown[] | null = null,
): GroupsGateRead => ({ status, data });

describe('decideGroupsGate', () => {
  it('holds while no reads exist yet (accounts hydrating)', () => {
    expect(decideGroupsGate([])).toBe('pending');
  });

  it('holds on the initial all-idle frame', () => {
    expect(decideGroupsGate([read('idle')])).toBe('pending');
  });

  it('holds while a fetch is in flight with no data', () => {
    expect(decideGroupsGate([read('loading')])).toBe('pending');
  });

  it('goes to onboarding only when every account definitively reports zero groups', () => {
    expect(decideGroupsGate([read('ok', []), read('ok', [])])).toBe('onboarding');
  });

  it('renders tabs when any account has groups', () => {
    expect(decideGroupsGate([read('ok', []), read('ok', [{}])])).toBe('tabs');
  });

  it('renders tabs on cached/stale data even while a refresh errors', () => {
    expect(decideGroupsGate([read('error', [{}])])).toBe('tabs');
  });

  it('does NOT treat a failed fetch as zero groups (offline cold launch)', () => {
    expect(decideGroupsGate([read('error')])).toBe('tabs');
  });

  it('does not redirect when one account is empty but another is unknown', () => {
    expect(decideGroupsGate([read('ok', []), read('error')])).toBe('tabs');
    expect(decideGroupsGate([read('ok', []), read('idle')])).toBe('tabs');
  });

  it('prefers known groups over an in-flight sibling fetch', () => {
    expect(decideGroupsGate([read('loading'), read('ok', [{}])])).toBe('tabs');
  });
});
