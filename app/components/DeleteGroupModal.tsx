/**
 * Type-to-confirm modal for the hard-delete flow.
 *
 * Slide-up modal (matching SettlementImpactSheet's pattern). The user must
 * type the group's name exactly to enable the destructive primary button.
 * On a `group_has_unsettled_balances` refusal, the modal stays open and
 * surfaces the failing balance rows inline.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md §"Components".
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '@/lib/use-responsive';
import { Button } from './Button';
import { Text } from './Text';
import {
  DeleteGroupModalError,
  deleteGroupModalState,
} from './DeleteGroupModal.helpers';
import { formatMinorUnits } from '../lib/i18n';
import { markPopupClosed } from '../lib/popup-guard';
import {
  colors,
  fontBody,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '../lib/theme';

interface Props {
  visible: boolean;
  groupName: string;
  submitting: boolean;
  error?: DeleteGroupModalError | null;
  onCancel(): void;
  onConfirm(typedName: string): void;
}

export function DeleteGroupModal({
  visible,
  groupName,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const { sheetMaxWidth } = useResponsive();
  const [typed, setTyped] = useState('');

  // Stamp the popup-guard on dismissal so the Danger Zone row underneath
  // can't fire `onPress` in the same gesture. See app/lib/popup-guard.ts.
  const handleCancel = React.useCallback(() => {
    markPopupClosed();
    onCancel();
  }, [onCancel]);

  // Reset the input every time the modal is reopened so a previous attempt
  // doesn't pre-fill the confirmation. We deliberately don't clear on
  // submission failure — letting the user edit their typed value is the
  // expected affordance.
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const state = deleteGroupModalState({
    typedName: typed,
    groupName,
    submitting,
    error,
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollBody,
            sheetMaxWidth != null && {
              maxWidth: sheetMaxWidth,
              alignSelf: 'center',
              width: '100%',
            },
          ]}
        >
          <Text style={styles.title}>{t('groupSettings.dangerZone.deleteModal.title')}</Text>
          <Text style={styles.lead}>
            {t('groupSettings.dangerZone.deleteModal.body')}
          </Text>

          <Text style={styles.label}>
            {t('groupSettings.dangerZone.deleteModal.confirmLabel', { name: groupName })}
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('groupSettings.dangerZone.deleteModal.placeholder', { name: groupName })}
            placeholderTextColor={colors.lead}
            editable={!submitting}
            style={styles.input}
            accessibilityLabel={t('groupSettings.dangerZone.deleteModal.confirmLabel', { name: groupName })}
          />

          {state.errorVisible && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLabel={t('common.error')}
            >
              <Text style={styles.errorTitle}>
                {t('groupSettings.dangerZone.deleteBlocked.title')}
              </Text>
              <Text style={styles.errorBody}>
                {t('groupSettings.dangerZone.deleteBlocked.body')}
              </Text>
              {state.hasErrorRows && (
                <View style={styles.errorRows}>
                  {state.errorRows.map((r, i) => (
                    <Text key={`${r.currency}-${i}`} style={styles.errorRow}>
                      {t('groupSettings.dangerZone.deleteRow', {
                        amount: formatMinorUnits(r.minor_units, r.currency),
                        currency: r.currency,
                      })}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.ctaBar}>
          <View
            style={[
              styles.ctaInner,
              sheetMaxWidth != null && {
                maxWidth: sheetMaxWidth,
                alignSelf: 'center',
                width: '100%',
              },
            ]}
          >
            <Button
              kind="secondary"
              onPress={handleCancel}
              style={{ flex: 1 }}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              kind="primary"
              onPress={() => onConfirm(typed.trim())}
              style={[{ flex: 1 }, styles.destructive] as any}
              disabled={!state.canConfirm}
            >
              {submitting
                ? t('common.saving')
                : t('groupSettings.dangerZone.deleteModal.confirm')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scrollBody: { padding: spacing.s5, paddingBottom: spacing.s7 },
  title: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    marginBottom: spacing.s3,
    letterSpacing: -0.2,
  },
  lead: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    marginBottom: spacing.s4,
  },
  label: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  input: {
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    backgroundColor: colors.paper,
  },
  errorBanner: {
    marginTop: spacing.s4,
    padding: spacing.s3,
    borderRadius: 6,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  errorTitle: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    marginBottom: spacing.s1,
    letterSpacing: 0.3,
  },
  errorBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
  },
  errorRows: {
    marginTop: spacing.s2,
    gap: spacing.s1,
  },
  errorRow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    fontVariant: ['tabular-nums'],
  },
  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s5,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  ctaInner: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  destructive: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
});
