/**
 * How one activity event is shown as a row on the Activity tab
 * ((tabs)/activity.tsx): a short headline (the group and time go on the
 * meta line below it), an optional amount for the right-hand column, an
 * icon, and whether it is housekeeping that should sit back visually.
 */
import type {
  ActivityEvent,
  ExpenseActivitySnapshot,
  GroupActivitySnapshot,
  SettlementActivitySnapshot,
} from './api';

export type ActivityIcon =
  | 'expense'
  | 'edit'
  | 'delete'
  | 'settle'
  | 'revert'
  | 'join'
  | 'group'
  | 'archive'
  | 'link'
  | 'generic';

export interface ActivityDisplay {
  /** i18n key; the screen supplies `actor`, and `params` may override it. */
  headlineKey: string;
  params: Record<string, string>;
  amount: { minor: number; currency: string } | null;
  icon: ActivityIcon;
  /** Housekeeping (settings changes, invite links): drawn muted. */
  quiet: boolean;
}

function row(
  key: string,
  icon: ActivityIcon,
  params: Record<string, string> = {},
  amount: ActivityDisplay['amount'] = null,
  quiet = false,
): ActivityDisplay {
  return { headlineKey: `activity.row.${key}`, params, amount, icon, quiet };
}

function amountOf(s: { amount?: number; currency?: string }): ActivityDisplay['amount'] {
  return s.amount != null && s.currency ? { minor: s.amount, currency: s.currency } : null;
}

/** Drops unset values so the screen's defaults apply. */
function defined(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  );
}

export function activityDisplay(event: ActivityEvent): ActivityDisplay {
  const snapshot = event.payload?.snapshot ?? {};
  switch (event.event_type) {
    case 'expense_added': {
      const s = snapshot as ExpenseActivitySnapshot;
      if (!s.title) return row('expense_added_simple', 'expense');
      return row('expense_added', 'expense', { title: s.title }, amountOf(s));
    }
    case 'expense_edited':
    case 'expense_updated': {
      // 'expense_updated' is the pre-rename event_type still in legacy rows.
      const s = snapshot as ExpenseActivitySnapshot;
      if (!s.title) return row('expense_edited_simple', 'edit');
      return row('expense_edited', 'edit', { title: s.title });
    }
    case 'expense_deleted': {
      const s = snapshot as ExpenseActivitySnapshot;
      if (!s.title) return row('expense_deleted_simple', 'delete');
      return row('expense_deleted', 'delete', { title: s.title });
    }
    case 'settlement_added': {
      const s = snapshot as SettlementActivitySnapshot;
      return row(
        'settlement_added',
        'settle',
        defined({ actor: s.from_member_name, to: s.to_member_name }),
        amountOf(s),
      );
    }
    case 'settlement_reverted':
      return row('settlement_reverted', 'revert');
    case 'member_joined':
      return row('member_joined', 'join');
    case 'group_created':
      return row('group_created', 'group');
    case 'group_updated': {
      const s = snapshot as GroupActivitySnapshot;
      if (s.changed?.includes('name') && s.name && s.old_name) {
        return row('group_renamed', 'group', { newName: s.name }, null, true);
      }
      return row('group_updated', 'group', {}, null, true);
    }
    case 'group_archived':
      return row('group_archived', 'archive', {}, null, true);
    case 'invite_link_rotated':
      return row('invite_link_rotated', 'link', {}, null, true);
    default:
      return row('generic', 'generic', { event: event.event_type }, null, true);
  }
}
