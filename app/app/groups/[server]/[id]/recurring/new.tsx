/**
 * Create a new recurring bill in this group.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md
 */

import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { RecurringForm } from '@/components/recurring/RecurringForm';

export default function NewRecurringScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  return (
    <RecurringForm
      serverUrl={serverUrl}
      groupId={id ?? ''}
      mode="create"
      onSaved={() => router.back()}
    />
  );
}
