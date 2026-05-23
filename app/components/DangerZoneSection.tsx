/**
 * Owner-only block for the group-settings hub. Hosts the three lifecycle
 * toggles (lock/unlock, archive/unarchive, delete). Lock and archive each
 * trigger a quick `showAlert`; delete defers to DeleteGroupModal.
 *
 * Returns null for non-owners — spec §"Settings screen sections" item 5.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md
 *       §"Components" — `DangerZoneSection.tsx`.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Text } from './Text';
import { lifecycleActionsForViewer } from '../lib/group-settings';
import { showAlert } from '@/lib/app-alert';
import {
  colors,
  fontMono,
  fontSize,
  spacing,
} from '../lib/theme';

interface Props {
  isOwner: boolean;
  isLocked: boolean;
  isArchived: boolean;
  onLockToggle(): void;
  onArchiveToggle(): void;
  onDeletePress(): void;
}

export function DangerZoneSection({
  isOwner,
  isLocked,
  isArchived,
  onLockToggle,
  onArchiveToggle,
  onDeletePress,
}: Props) {
  const { t } = useTranslation();
  const actions = lifecycleActionsForViewer({ isOwner, isLocked, isArchived });

  // Non-owners get nothing here. The spec deliberately hides the whole
  // section (not just the buttons) so screen readers don't announce the
  // heading either.
  if (!isOwner) return null;

  async function confirmLockToggle() {
    const titleKey = isLocked
      ? 'groupSettings.dangerZone.unlockConfirm.title'
      : 'groupSettings.dangerZone.lockConfirm.title';
    const bodyKey = isLocked
      ? 'groupSettings.dangerZone.unlockConfirm.body'
      : 'groupSettings.dangerZone.lockConfirm.body';
    const actionKey =
      actions.lockLabelKey === 'lock'
        ? 'groupSettings.dangerZone.lock'
        : 'groupSettings.dangerZone.unlock';
    const confirmKey = actions.lockLabelKey === 'lock' ? 'lock' : 'unlock';
    const result = await showAlert({
      title: t(titleKey),
      message: t(bodyKey),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: confirmKey, label: t(actionKey), style: 'destructive' },
      ],
    });
    if (result === confirmKey) {
      onLockToggle();
    }
  }

  async function confirmArchiveToggle() {
    const titleKey = isArchived
      ? 'groupSettings.dangerZone.unarchiveConfirm.title'
      : 'groupSettings.dangerZone.archiveConfirm.title';
    const bodyKey = isArchived
      ? 'groupSettings.dangerZone.unarchiveConfirm.body'
      : 'groupSettings.dangerZone.archiveConfirm.body';
    const actionKey =
      actions.archiveLabelKey === 'archive'
        ? 'groupSettings.dangerZone.archive'
        : 'groupSettings.dangerZone.unarchive';
    const confirmKey = actions.archiveLabelKey === 'archive' ? 'archive' : 'unarchive';
    const result = await showAlert({
      title: t(titleKey),
      message: t(bodyKey),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: confirmKey, label: t(actionKey), style: 'destructive' },
      ],
    });
    if (result === confirmKey) {
      onArchiveToggle();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('groupSettings.dangerZone.title')}</Text>
      <View style={styles.rule} />

      <View style={styles.buttonStack}>
        <Button kind="secondary" onPress={confirmLockToggle} style={styles.button}>
          {t(
            actions.lockLabelKey === 'lock'
              ? 'groupSettings.dangerZone.lock'
              : 'groupSettings.dangerZone.unlock',
          )}
        </Button>
        <Button kind="secondary" onPress={confirmArchiveToggle} style={styles.button}>
          {t(
            actions.archiveLabelKey === 'archive'
              ? 'groupSettings.dangerZone.archive'
              : 'groupSettings.dangerZone.unarchive',
          )}
        </Button>
        <Button kind="primary" onPress={onDeletePress} style={[styles.button, styles.deleteBtn] as any}>
          {t('groupSettings.dangerZone.delete')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.s5,
    marginTop: spacing.s5,
    paddingVertical: spacing.s3,
  },
  title: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.brick,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  rule: {
    height: 0.5,
    backgroundColor: colors.brick,
    marginBottom: spacing.s3,
    opacity: 0.4,
  },
  buttonStack: {
    gap: spacing.s2,
  },
  button: {
    width: '100%',
  },
  deleteBtn: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
});
