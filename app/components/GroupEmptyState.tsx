/**
 * Empty-group Overview on-ramp. Shown when a group has zero expenses: offers
 * "Add first expense" and, as a migration on-ramp, "Import from another app".
 *
 * Purely presentational — navigation is the caller's job via the two
 * callbacks. Route builders live in ./GroupEmptyState.helpers (tested).
 *
 * Spec: docs/superpowers/specs/2026-05-30-import-empty-group-onramp-design.md
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, typography, spacing } from '@/lib/theme';
import { Text } from './Text';
import { Button } from './Button';

interface Props {
  onAddExpense: () => void;
  onImport: () => void;
}

export function GroupEmptyState({ onAddExpense, onImport }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Feather name="file-text" size={28} color={colors.lead} />
      <Text style={styles.title}>{t('groupDetail.emptyTitle')}</Text>
      <Text style={styles.body}>{t('groupDetail.emptyBodyImport')}</Text>
      <View style={styles.actions}>
        <Button kind="primary" onPress={onAddExpense} style={styles.button}>
          {t('groupDetail.emptyAddFirst')}
        </Button>
        <Button kind="secondary" onPress={onImport} style={styles.button}>
          {t('groupDetail.emptyImport')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  title: {
    ...typography.displayS,
    color: colors.graphite,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    ...typography.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.s4,
    gap: spacing.s2,
  },
  button: {
    alignSelf: 'stretch',
  },
});
