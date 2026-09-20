const store = new Map<string, string>();
jest.mock('../storage', () => ({
  getFlag: async (k: string) => store.get(k) ?? null,
  setFlag: async (k: string, v: string) => {
    store.set(k, v);
  },
  clearFlag: async (k: string) => {
    store.delete(k);
  },
}));

import {
  DRAFT_TTL_MS,
  OnboardingDraft,
  clearDraft,
  isDraftActive,
  loadDraft,
  nextAfterName,
  saveDraft,
  signUpHref,
  updateDraft,
} from '../onboarding-draft';

const HOSTED = 'https://api.example.com';
const NOW = 1_800_000_000_000;

const joinDraft = (serverUrl: string): OnboardingDraft => ({
  createdAt: NOW,
  intent: 'join',
  invite: { serverUrl, token: 'tok', groupName: 'Ski trip' },
});

beforeEach(() => store.clear());

describe('draft persistence', () => {
  it('round-trips a saved draft', async () => {
    const d: OnboardingDraft = { createdAt: NOW, name: 'Lucas', intent: 'create' };
    await saveDraft(d);
    expect(await loadDraft(NOW)).toEqual(d);
  });

  it('returns null and clears a corrupt draft', async () => {
    store.set('onboarding_draft', '{nope');
    expect(await loadDraft(NOW)).toBeNull();
    expect(store.has('onboarding_draft')).toBe(false);
  });

  it('returns null and clears a draft older than the TTL', async () => {
    await saveDraft({ createdAt: NOW - DRAFT_TTL_MS - 1, name: 'Old' });
    expect(await loadDraft(NOW)).toBeNull();
    expect(store.has('onboarding_draft')).toBe(false);
  });

  it('updateDraft starts a fresh draft when none exists', async () => {
    expect(await updateDraft({ name: 'Lucas' }, NOW)).toEqual({ createdAt: NOW, name: 'Lucas' });
  });

  it('updateDraft merges into the existing draft', async () => {
    await saveDraft({ createdAt: NOW, name: 'Lucas' });
    const d = await updateDraft({ intent: 'create' }, NOW + 5);
    expect(d).toEqual({ createdAt: NOW, name: 'Lucas', intent: 'create' });
    expect(await loadDraft(NOW + 5)).toEqual(d);
  });

  it('round-trips a chosen self-host server', async () => {
    await saveDraft({ createdAt: NOW, serverUrl: 'https://chara.example.org' });
    expect((await loadDraft(NOW))?.serverUrl).toBe('https://chara.example.org');
  });

  it('updateDraft with an undefined server clears the choice', async () => {
    await saveDraft({ createdAt: NOW, name: 'Lucas', serverUrl: 'https://chara.example.org' });
    const d = await updateDraft({ serverUrl: undefined }, NOW);
    expect(d.serverUrl).toBeUndefined();
    expect(await loadDraft(NOW)).toEqual({ createdAt: NOW, name: 'Lucas' });
  });

  it('clearDraft removes it', async () => {
    await saveDraft({ createdAt: NOW });
    await clearDraft();
    expect(await loadDraft(NOW)).toBeNull();
  });
});

describe('isDraftActive', () => {
  it('is false without an intent', () => {
    expect(isDraftActive({ createdAt: NOW, name: 'x' }, NOW)).toBe(false);
  });
  it('is false when stale', () => {
    expect(isDraftActive({ createdAt: NOW - DRAFT_TTL_MS - 1, intent: 'create' }, NOW)).toBe(false);
  });
  it('is true for a fresh draft with an intent', () => {
    expect(isDraftActive({ createdAt: NOW, intent: 'create' }, NOW)).toBe(true);
  });
  it('is false for null', () => {
    expect(isDraftActive(null, NOW)).toBe(false);
  });
});

describe('routing helpers', () => {
  it('create path signs up on the hosted server', () => {
    expect(signUpHref({ createdAt: NOW, intent: 'create' }, HOSTED)).toBe('/(auth)/sign-in');
  });
  it('join on the hosted server needs no server param', () => {
    expect(signUpHref(joinDraft(HOSTED), HOSTED)).toBe('/(auth)/sign-in');
  });
  it('join on another server targets that server', () => {
    expect(signUpHref(joinDraft('https://chara.example.org'), HOSTED)).toBe(
      `/(auth)/sign-in?server=${encodeURIComponent('https://chara.example.org')}`,
    );
  });
  it('a chosen self-host server targets that server on the create path', () => {
    expect(
      signUpHref(
        { createdAt: NOW, intent: 'create', serverUrl: 'https://chara.example.org' },
        HOSTED,
      ),
    ).toBe(`/(auth)/sign-in?server=${encodeURIComponent('https://chara.example.org')}`);
  });
  it('a chosen server equal to the hosted one needs no server param', () => {
    expect(signUpHref({ createdAt: NOW, intent: 'create', serverUrl: HOSTED }, HOSTED)).toBe(
      '/(auth)/sign-in',
    );
  });
  it("the invite's server wins over a chosen server on the join path", () => {
    // An invite token is minted by, and only valid on, its own server.
    expect(
      signUpHref(
        { ...joinDraft('https://invite.example.org'), serverUrl: 'https://chosen.example.org' },
        HOSTED,
      ),
    ).toBe(`/(auth)/sign-in?server=${encodeURIComponent('https://invite.example.org')}`);
  });
  it('after the name step, the create path goes to the choice screen', () => {
    expect(nextAfterName({ createdAt: NOW, name: 'L' }, HOSTED)).toBe('/welcome/choose');
  });
  it('after the name step, a pending invite goes straight to sign-up', () => {
    expect(nextAfterName(joinDraft('https://chara.example.org'), HOSTED)).toBe(
      signUpHref(joinDraft('https://chara.example.org'), HOSTED),
    );
  });
});
