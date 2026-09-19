import type { OnboardingDraft } from '../onboarding-draft';
import { SetupDeps, postSetupNavigation, runSetup, setupSteps } from '../onboarding-setup';

const createDraft = (extra: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  createdAt: 1,
  name: 'Lucas',
  intent: 'create',
  group: { name: 'Ski trip', currency: 'SEK', color: '#ff0000' },
  ...extra,
});

const joinDraft: OnboardingDraft = {
  createdAt: 1,
  name: 'Lucas',
  intent: 'join',
  invite: { serverUrl: 'https://s', token: 'tok', groupName: 'Ski trip' },
};

function fakeDeps(over: Partial<SetupDeps> = {}) {
  const saved: OnboardingDraft[] = [];
  const deps: SetupDeps = {
    getMyName: jest.fn(async () => ''),
    updateName: jest.fn(async () => {}),
    createGroup: jest.fn(async () => ({ id: 'g1' })),
    setGroupColor: jest.fn(async () => {}),
    joinGroup: jest.fn(async () => ({ id: 'g2' })),
    save: jest.fn(async (d: OnboardingDraft) => {
      saved.push(d);
    }),
    ...over,
  };
  return { deps, saved };
}

describe('setupSteps', () => {
  it('lists name then group', () => {
    expect(setupSteps(createDraft())).toEqual(['name', 'group']);
  });
  it('omits the name step when the draft has no name', () => {
    expect(setupSteps(createDraft({ name: undefined }))).toEqual(['group']);
  });
});

describe('runSetup', () => {
  it('create path: saves the name, creates the group, records its id', async () => {
    const { deps, saved } = fakeDeps();
    const r = await runSetup(createDraft(), deps);
    expect(deps.updateName).toHaveBeenCalledWith('Lucas');
    expect(deps.createGroup).toHaveBeenCalledWith('Ski trip', 'SEK');
    expect(deps.setGroupColor).toHaveBeenCalledWith('g1', '#ff0000');
    expect(saved[saved.length - 1]).toMatchObject({ nameDone: true, groupId: 'g1' });
    expect(r).toEqual({ kind: 'done', intent: 'create', groupId: 'g1' });
  });

  it('keeps an existing server-side name', async () => {
    const { deps } = fakeDeps({ getMyName: jest.fn(async () => 'Existing') });
    await runSetup(createDraft(), deps);
    expect(deps.updateName).not.toHaveBeenCalled();
  });

  it('resumes without re-creating a group it already created', async () => {
    const { deps } = fakeDeps();
    const r = await runSetup(createDraft({ nameDone: true, groupId: 'g9' }), deps);
    expect(deps.getMyName).not.toHaveBeenCalled();
    expect(deps.createGroup).not.toHaveBeenCalled();
    expect(r).toEqual({ kind: 'done', intent: 'create', groupId: 'g9' });
  });

  it('a color failure never blocks setup', async () => {
    const { deps } = fakeDeps({
      setGroupColor: jest.fn(async () => {
        throw new Error('x');
      }),
    });
    expect((await runSetup(createDraft(), deps)).kind).toBe('done');
  });

  it('join path joins by token', async () => {
    const { deps } = fakeDeps();
    const r = await runSetup(joinDraft, deps);
    expect(deps.joinGroup).toHaveBeenCalledWith('tok');
    expect(r).toEqual({ kind: 'done', intent: 'join', groupId: 'g2' });
  });

  it('join path: already a member is done without a group id', async () => {
    const { deps } = fakeDeps({ joinGroup: jest.fn(async () => null) });
    expect(await runSetup(joinDraft, deps)).toEqual({ kind: 'done', intent: 'join', groupId: null });
  });

  it('reports the failing step with the progress made so far', async () => {
    const err = new Error('offline');
    const { deps } = fakeDeps({
      createGroup: jest.fn(async () => {
        throw err;
      }),
    });
    const r = await runSetup(createDraft(), deps);
    expect(r).toMatchObject({ kind: 'failed', step: 'group', error: err });
    if (r.kind === 'failed') expect(r.draft.nameDone).toBe(true);
  });

  it('reports progress in order', async () => {
    const { deps } = fakeDeps();
    const events: string[] = [];
    await runSetup(createDraft(), deps, (s, state) => events.push(`${s}:${state}`));
    expect(events).toEqual(['name:running', 'name:done', 'group:running', 'group:done']);
  });
});

describe('postSetupNavigation', () => {
  const S = 'https://api.example.com';
  const enc = encodeURIComponent(S);

  it('create path resets to the tabs before the invite screen', () => {
    expect(postSetupNavigation({ kind: 'done', intent: 'create', groupId: 'g1' }, S)).toEqual([
      '/(tabs)',
      `/onboarding/created?server=${enc}&groupId=g1`,
    ]);
  });

  it('join path resets to the tabs before the group', () => {
    expect(postSetupNavigation({ kind: 'done', intent: 'join', groupId: 'g2' }, S)).toEqual([
      '/(tabs)',
      `/groups/${enc}/g2`,
    ]);
  });

  it('without a group it just goes to the tabs', () => {
    expect(postSetupNavigation({ kind: 'done', intent: 'join', groupId: null }, S)).toEqual([
      '/(tabs)',
    ]);
  });
});
