/**
 * Wire types for the per-server recurring-expenses API.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md
 *
 * The backend HTTP handler is built in parallel; the routes are
 * `/api/groups/{groupId}/recurring[/...]` on each server. Money is int64
 * minor units; dates are `YYYY-MM-DD`; timestamps are ISO-8601.
 */

export interface RecurringExpense {
  id: string;
  group_id: string;
  title: string;
  amount_minor: number;
  currency: string;
  paid_by_id: string;
  split_method: 'equal' | 'exact' | 'percentage';
  splits: { member_id: string; value: number }[];
  category: string;
  notes: string | null;
  freq_unit: 'day' | 'week' | 'month' | 'year';
  freq_interval: number;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  timezone: string; // IANA
  fire_local_time: string; // HH:MM
  status: 'active' | 'paused' | 'ended';
  paused_reason: 'manual' | 'member_left' | 'group_locked' | 'catchup_overflow' | null;
  last_fire_at: string | null; // ISO timestamp
  next_fire_at: string; // ISO timestamp
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringInput {
  title: string;
  amount_minor: number;
  paid_by_id: string;
  split_method: RecurringExpense['split_method'];
  splits: RecurringExpense['splits'];
  category?: string;
  notes?: string | null;
  freq_unit: RecurringExpense['freq_unit'];
  freq_interval: number;
  start_date: string;
  end_date?: string | null;
  timezone: string;
  fire_local_time?: string;
}

export type UpdateRecurringInput = Omit<CreateRecurringInput, 'start_date'>;
