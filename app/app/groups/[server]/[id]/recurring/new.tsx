/**
 * Create a new recurring bill in this group.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md
 *
 * A `prefill` param (JSON) is passed when arriving from the "Make recurring"
 * action on an expense — it seeds the identity fields (title/amount/split/…).
 */

import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { RecurringForm } from '@/components/recurring/RecurringForm';
import type { RecurringPrefill } from '@/lib/api-types-recurring';

export default function NewRecurringScreen() {
  const { server, id, prefill } = useLocalSearchParams<{
    server: string;
    id: string;
    prefill?: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');

  let parsedPrefill: RecurringPrefill | undefined;
  if (prefill) {
    try {
      parsedPrefill = JSON.parse(prefill) as RecurringPrefill;
    } catch {
      parsedPrefill = undefined;
    }
  }

  return (
    <RecurringForm
      serverUrl={serverUrl}
      groupId={id ?? ''}
      mode="create"
      prefill={parsedPrefill}
      onSaved={() => router.back()}
    />
  );
}
