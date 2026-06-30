const store = new Map<string, string>();
jest.mock('../storage', () => ({
  getFlag: async (k: string) => (store.has(k) ? store.get(k)! : null),
  setFlag: async (k: string, v: string) => {
    store.set(k, v);
  },
  clearFlag: async (k: string) => {
    store.delete(k);
  },
}));

import {
  draftKey,
  draftHasContent,
  loadDraft,
  saveDraft,
  clearDraft,
} from '../expense-draft';

beforeEach(() => store.clear());

describe('draftKey', () => {
  it('sanitizes the server URL to the SecureStore charset', () => {
    const key = draftKey('https://chara.example.com', 'grp_123');
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(key).toContain('grp_123');
  });

  it('is stable for the same server + group', () => {
    expect(draftKey('https://a.com', 'g1')).toBe(draftKey('https://a.com', 'g1'));
  });
});

describe('draftHasContent', () => {
  it('is false for an empty form', () => {
    expect(draftHasContent({})).toBe(false);
    expect(draftHasContent({ amount: '', title: '   ' })).toBe(false);
    expect(draftHasContent({ amount: '0' })).toBe(false);
  });

  it('is true once an amount or title is entered', () => {
    expect(draftHasContent({ amount: '12.50' })).toBe(true);
    expect(draftHasContent({ title: 'Dinner' })).toBe(true);
  });
});

describe('saveDraft / loadDraft / clearDraft', () => {
  const KEY = draftKey('https://a.com', 'g1');

  it('round-trips a draft with content', async () => {
    await saveDraft(KEY, { amount: '40.00', title: 'Taxi', category: 'transport' }, 1000);
    const d = await loadDraft(KEY, 1000);
    expect(d).toMatchObject({ amount: '40.00', title: 'Taxi', category: 'transport', savedAt: 1000 });
  });

  it('does not persist an empty draft', async () => {
    await saveDraft(KEY, { amount: '', title: '' }, 1000);
    expect(await loadDraft(KEY, 1000)).toBeNull();
  });

  it('treats a draft older than the max age as expired', async () => {
    await saveDraft(KEY, { title: 'Old' }, 0);
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    expect(await loadDraft(KEY, eightDaysMs)).toBeNull();
  });

  it('clears a draft', async () => {
    await saveDraft(KEY, { title: 'Bye' }, 1000);
    await clearDraft(KEY);
    expect(await loadDraft(KEY, 1000)).toBeNull();
  });

  it('returns null for malformed stored JSON', async () => {
    store.set(KEY, 'not json');
    expect(await loadDraft(KEY, 1000)).toBeNull();
  });
});
