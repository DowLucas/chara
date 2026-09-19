/**
 * Replays a first-run `OnboardingDraft` against the server the user just
 * signed up on: save their name, then create or join their first group.
 *
 * Dependency-injected so the screen supplies `apiFor(serverUrl)` calls and the
 * logic stays testable. Each completed step is persisted into the draft before
 * moving on, so a retry (or an app kill mid-way) resumes instead of creating
 * a duplicate group.
 */
import type { OnboardingDraft } from './onboarding-draft';

export type SetupStep = 'name' | 'group';

export interface SetupDeps {
  getMyName(): Promise<string>;
  updateName(name: string): Promise<void>;
  createGroup(name: string, currency: string): Promise<{ id: string }>;
  /** Cosmetic, per-device; failures are ignored. */
  setGroupColor(groupId: string, color: string): Promise<void>;
  /** Resolves null when the user is already a member. */
  joinGroup(token: string): Promise<{ id: string } | null>;
  save(d: OnboardingDraft): Promise<void>;
}

export type SetupResult =
  | { kind: 'done'; intent: 'create' | 'join'; groupId: string | null }
  | { kind: 'failed'; step: SetupStep; error: unknown; draft: OnboardingDraft };

export function setupSteps(d: OnboardingDraft): SetupStep[] {
  return d.name ? ['name', 'group'] : ['group'];
}

export async function runSetup(
  draft: OnboardingDraft,
  deps: SetupDeps,
  onStep?: (step: SetupStep, state: 'running' | 'done') => void,
): Promise<SetupResult> {
  let d = { ...draft };
  let step: SetupStep = 'name';
  try {
    if (d.name) {
      onStep?.('name', 'running');
      // An existing account keeps the name it already has.
      if (!d.nameDone && !(await deps.getMyName()).trim()) {
        await deps.updateName(d.name);
      }
      if (!d.nameDone) {
        d = { ...d, nameDone: true };
        await deps.save(d);
      }
      onStep?.('name', 'done');
    }

    step = 'group';
    onStep?.('group', 'running');
    let groupId: string | null;
    if (d.intent === 'join' && d.invite) {
      groupId = (await deps.joinGroup(d.invite.token))?.id ?? null;
    } else if (d.groupId) {
      groupId = d.groupId;
    } else if (d.group) {
      const g = await deps.createGroup(d.group.name, d.group.currency);
      groupId = g.id;
      d = { ...d, groupId };
      await deps.save(d);
      if (d.group.color) {
        await deps.setGroupColor(g.id, d.group.color).catch(() => {});
      }
    } else {
      groupId = null;
    }
    onStep?.('group', 'done');
    return { kind: 'done', intent: d.intent === 'join' ? 'join' : 'create', groupId };
  } catch (error) {
    return { kind: 'failed', step, error, draft: d };
  }
}
