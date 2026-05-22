import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  size?: 'sm' | 'lg';
  /** When true, plays the entrance animation on mount. Defaults to true for 'lg'. */
  animateIn?: boolean;
  /** Speed multiplier for the entrance animation. 1 = default ("~320ms").
   *  Use 2 for a snappy success-screen variant. Springs are stiffened by
   *  the same factor so the perceived motion stays balanced. */
  speed?: number;
}

// Design brief: "Stamp animates in from −6deg to −2deg over ~320ms. No
// confetti, no fanfare." A quick fade + scale-overshoot + rotation spring
// gives the stamp a weighty landing without violating the brand tone.
export function Stamp({ size = 'sm', animateIn, speed = 1 }: Props) {
  const { t } = useTranslation();
  const shouldAnimate = animateIn ?? size === 'lg';

  const rotate = useRef(new Animated.Value(shouldAnimate ? -8 : -2)).current;
  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(shouldAnimate ? 0.92 : 1)).current;

  useEffect(() => {
    if (!shouldAnimate) return;
    const d = (ms: number) => Math.max(1, Math.round(ms / speed));
    const k = (s: number) => s * speed;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: d(220),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: -2,
        stiffness: k(180),
        damping: 12,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: d(180),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          stiffness: k(240),
          damping: 14,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [shouldAnimate, rotate, opacity, scale, speed]);

  const rotateDeg = rotate.interpolate({
    inputRange: [-8, -2],
    outputRange: ['-8deg', '-2deg'],
  });

  return (
    <Animated.View
      style={[
        styles.base,
        size === 'lg' && styles.lg,
        { opacity, transform: [{ rotate: rotateDeg }, { scale }] },
      ]}
    >
      <Text style={[styles.text, size === 'lg' && styles.textLg]}>
        {t('app.name').toUpperCase()}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderColor: colors.vermillion,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lg: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    ...typography.monoStamp,
    color: colors.vermillion,
  },
  textLg: {
    ...typography.amountM,
    letterSpacing: 2,
    color: colors.vermillion,
  },
});
