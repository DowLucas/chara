import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';

import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export interface VoiceDraftBannerProps {
  /** How many drafts wait BEHIND the one currently in the wizard. */
  remaining: number;
  /** The next draft's source phrase, so the user can see what is queued
   *  without having to save the current one first. */
  nextPhrase: string;
  onDiscardRest(): void;
}

/**
 * The "N more from your recording" strip shown above the wizard while a
 * voice queue is active.
 *
 * Styled as a bone card rather than a system banner so it reads as part of
 * the screen's card vocabulary.
 */
export function VoiceDraftBanner({ remaining, nextPhrase, onDiscardRest }: VoiceDraftBannerProps) {
  const { t } = useTranslation();
  if (remaining <= 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Feather name="mic" size={14} color={colors.lead} />
        <Text style={styles.count} numberOfLines={2}>
          {t('voiceExpense.moreFromRecording', { count: remaining })}
        </Text>
        <TouchableOpacity
          onPress={onDiscardRest}
          accessibilityRole="button"
          accessibilityLabel={t('voiceExpense.discardRest')}
          hitSlop={8}
        >
          <Text style={styles.discard}>{t('voiceExpense.discardRest')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.phrase} numberOfLines={2}>
        “{nextPhrase}”
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    padding: spacing.s4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2, flexWrap: 'wrap' },
  count: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  discard: { fontFamily: fontBody, fontSize: fontSize.caption, color: colors.brick },
  phrase: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.graphite,
    marginTop: spacing.s2,
  },
});
