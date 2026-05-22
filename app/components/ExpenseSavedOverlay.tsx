import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Stamp } from './Stamp';
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

  // Disc draws in: starts collapsed + transparent, springs up to full size
  // with a brief overshoot. Mirrors Stamp's entrance feel.
  const discScale = useRef(new Animated.Value(0)).current;
  const discOpacity = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.6)).current;
  const bodyTranslate = useRef(new Animated.Value(16)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    // Reset so re-opens replay the entrance.
    discScale.setValue(0);
    discOpacity.setValue(0);
    checkOpacity.setValue(0);
    checkScale.setValue(0.6);
    bodyTranslate.setValue(16);
    bodyOpacity.setValue(0);

    // 2× faster: halve every timing duration and double the spring
    // stiffness so the natural-frequency-driven settling matches. Damping
    // is mass-relative, so we leave it; for stiffness `k`, the spring
    // period scales as 1/√k, so we'd need 4× to halve the period — in
    // practice 2× is the perceived sweet spot without making the motion
    // feel jerky.
    Animated.sequence([
      Animated.parallel([
        Animated.spring(discScale, { toValue: 1, stiffness: 400, damping: 14, useNativeDriver: true }),
        Animated.timing(discOpacity, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, stiffness: 480, damping: 12, useNativeDriver: true }),
        Animated.timing(checkOpacity, {
          toValue: 1,
          duration: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
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
      ]),
    ]).start();
  }, [visible, discScale, discOpacity, checkOpacity, checkScale, bodyTranslate, bodyOpacity]);

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onContinue}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.s7, paddingBottom: insets.bottom + spacing.s4 }]}>
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.disc,
              { opacity: discOpacity, transform: [{ scale: discScale }] },
            ]}
          >
            <Animated.View
              style={{ opacity: checkOpacity, transform: [{ scale: checkScale }] }}
            >
              <Feather name="check" size={48} color={colors.paper} />
            </Animated.View>
          </Animated.View>

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
