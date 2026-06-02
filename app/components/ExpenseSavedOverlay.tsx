import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Stamp } from './Stamp';
import { ContentContainer } from '@/components/ContentContainer';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

interface Props {
  visible: boolean;
  /** Localised string shown under the headline ("Lunch · 200 SEK" etc). */
  subtitle?: string;
  onContinue: () => void;
}

// Brand-consistent post-save celebration: animated check disc + the same
// CHARA stamp used on settled-expense rows. Design brief is "no confetti,
// no fanfare" — restrained, monochrome, deliberate timing.
export function ExpenseSavedOverlay({ visible, subtitle, onContinue }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Disc + check render in their final state immediately — no draw-in.
  // The body (stamp + headline) still slides up so the screen has a tiny
  // sense of arrival without holding the checkmark hostage.
  const bodyTranslate = useRef(new Animated.Value(16)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    bodyTranslate.setValue(16);
    bodyOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(bodyTranslate, {
        toValue: 0,
        duration: 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bodyOpacity, {
        toValue: 1,
        duration: 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, bodyTranslate, bodyOpacity]);

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onContinue}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.s7, paddingBottom: insets.bottom + spacing.s4 }]}>
        <ContentContainer style={styles.column}>
          <View style={styles.center}>
            <View style={styles.disc}>
              <Feather name="check" size={48} color={colors.paper} />
            </View>

            <Animated.View
              style={[
                styles.body,
                { opacity: bodyOpacity, transform: [{ translateY: bodyTranslate }] },
              ]}
            >
              <Stamp size="lg" animateIn speed={2} />
              <Text style={styles.headline}>{t('expenseSaved.headline')}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </Animated.View>
          </View>

          <TouchableOpacity style={styles.cta} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.ctaLabel}>{t('expenseSaved.continue')}</Text>
            <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
          </TouchableOpacity>
        </ContentContainer>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.s5,
    justifyContent: 'space-between',
  },
  column: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s5 },
  disc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { alignItems: 'center', gap: spacing.s3 },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
    color: colors.graphite,
    marginTop: spacing.s2,
  },
  subtitle: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    letterSpacing: 0.3,
    color: colors.lead,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
});
