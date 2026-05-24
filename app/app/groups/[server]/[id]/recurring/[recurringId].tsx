/**
 * Edit / pause / resume / delete an existing recurring bill.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md
 */

import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { RecurringForm } from '@/components/recurring/RecurringForm';
import { apiFor } from '@/lib/api';
import type { RecurringExpense } from '@/lib/api-types-recurring';

export default function EditRecurringScreen() {
  const { server, id, recurringId } = useLocalSearchParams<{
    server: string;
    id: string;
    recurringId: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const [value, setValue] = useState<RecurringExpense | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFor(serverUrl)
      .recurring.get(id ?? '', recurringId ?? '')
      .then((v) => {
        if (!cancelled) setValue(v);
      })
      .catch(() => {
        if (!cancelled) router.back();
      });
    return () => {
      cancelled = true;
    };
  }, [serverUrl, id, recurringId]);

  if (!value) return null;
  return (
    <RecurringForm
      serverUrl={serverUrl}
      groupId={id ?? ''}
      mode="edit"
      initialValue={value}
      onSaved={() => router.back()}
    />
  );
}
