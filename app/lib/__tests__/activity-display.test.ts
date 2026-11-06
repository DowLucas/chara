import { activityDisplay } from '../activity-display';
import type { ActivityEvent } from '../api';

function event(event_type: string, snapshot?: Record<string, unknown>): ActivityEvent {
  return {
    id: 'e1',
    group_id: 'g1',
    group_name: 'Ski trip',
    actor_id: 'u1',
    actor_name: 'Maja',
    event_type,
    payload: snapshot ? ({ snapshot } as ActivityEvent['payload']) : undefined,
    created_at: '2026-11-06T13:32:00Z',
  };
}

describe('activityDisplay', () => {
  it('splits an added expense into a headline, an amount and an icon', () => {
    expect(
      activityDisplay(event('expense_added', { title: 'Dinner', amount: 45000, currency: 'SEK' })),
    ).toEqual({
      headlineKey: 'activity.row.expense_added',
      params: { title: 'Dinner' },
      amount: { minor: 45000, currency: 'SEK' },
      icon: 'expense',
      quiet: false,
    });
  });

  it('falls back to a generic headline when the expense title is missing', () => {
    const d = activityDisplay(event('expense_added', { amount: 45000 }));
    expect(d.headlineKey).toBe('activity.row.expense_added_simple');
    expect(d.amount).toBeNull(); // no currency, so no amount
  });

  it('treats the legacy expense_updated type as an edit', () => {
    expect(activityDisplay(event('expense_updated', { title: 'Taxi' }))).toMatchObject({
      headlineKey: 'activity.row.expense_edited',
      params: { title: 'Taxi' },
      icon: 'edit',
    });
  });

  it('shows a deleted expense without its amount', () => {
    expect(
      activityDisplay(event('expense_deleted', { title: 'Taxi', amount: 100, currency: 'SEK' })),
    ).toMatchObject({ headlineKey: 'activity.row.expense_deleted', amount: null, icon: 'delete' });
  });

  // The payer leads the headline, so their name stands in for the actor's.
  it('names both sides of a settlement and keeps its amount', () => {
    expect(
      activityDisplay(
        event('settlement_added', {
          from_member_name: 'Erik',
          to_member_name: 'Maja',
          amount: 20000,
          currency: 'SEK',
        }),
      ),
    ).toEqual({
      headlineKey: 'activity.row.settlement_added',
      params: { actor: 'Erik', to: 'Maja' },
      amount: { minor: 20000, currency: 'SEK' },
      icon: 'settle',
      quiet: false,
    });
  });

  it('leaves a settlement without names to the screen defaults', () => {
    expect(activityDisplay(event('settlement_added')).params).toEqual({});
  });

  it('uses the renamed headline only when both names are known', () => {
    expect(
      activityDisplay(event('group_updated', { changed: ['name'], name: 'Alps', old_name: 'Ski' })),
    ).toMatchObject({ headlineKey: 'activity.row.group_renamed', params: { newName: 'Alps' } });
    expect(activityDisplay(event('group_updated', { changed: ['currency'] })).headlineKey).toBe(
      'activity.row.group_updated',
    );
  });

  it('marks housekeeping events as quiet', () => {
    for (const type of ['group_updated', 'group_archived', 'invite_link_rotated']) {
      expect(activityDisplay(event(type)).quiet).toBe(true);
    }
    for (const type of ['member_joined', 'group_created', 'settlement_reverted']) {
      expect(activityDisplay(event(type)).quiet).toBe(false);
    }
  });

  it('renders unknown event types as a quiet generic row', () => {
    expect(activityDisplay(event('something_new'))).toEqual({
      headlineKey: 'activity.row.generic',
      params: { event: 'something_new' },
      amount: null,
      icon: 'generic',
      quiet: true,
    });
  });
});
