import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/lib/theme';
import { BAR_COUNT, barTargets } from '@/lib/voice-levels';

/** Tallest a bar gets, in points. */
const MAX_HEIGHT = 56;
const BAR_WIDTH = 5;

/**
 * Per-bar animation duration. Staggered so the bars trail each other
 * instead of moving as one block — that lag is the whole reason the row
 * reads as a vocalizer rather than a bar chart.
 */
const DURATIONS = [110, 90, 70, 60, 70, 90, 110];

export interface VoiceVocalizerProps {
  /** Current loudness, 0..1. See lib/voice-levels.dbfsToLevel. */
  level: number;
  style?: ViewStyle;
}

/**
 * Bars that react to microphone loudness while recording.
 *
 * This visualises AMPLITUDE, not frequency. expo-audio exposes a single
 * dBFS reading, so the per-bar shape comes from lib/voice-levels — it is
 * an honest stylisation of one number, and there is no spectrum behind it.
 *
 * Heights are driven through scaleY on the native driver, so the animation
 * keeps running smoothly while JS is busy encoding audio.
 */
export function VoiceVocalizer({ level, style }: VoiceVocalizerProps) {
  // One value per bar, holding a 0..1 scale factor.
  const scales = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.08)),
  ).current;

  useEffect(() => {
    const targets = barTargets(level);
    const animations = scales.map((value, i) =>
      Animated.timing(value, {
        toValue: targets[i],
        duration: DURATIONS[i % DURATIONS.length],
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
  }, [level, scales]);

  return (
    <View style={[styles.row, style]} accessibilityElementsHidden importantForAccessibility="no">
      {scales.map((scale, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              // scaleY grows from the centre, so anchor the transform to
              // the bottom to make the bars stand on the baseline.
              transform: [{ translateY: MAX_HEIGHT / 2 }, { scaleY: scale }, { translateY: -MAX_HEIGHT / 2 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: MAX_HEIGHT,
    gap: spacing.s2,
  },
  bar: {
    width: BAR_WIDTH,
    height: MAX_HEIGHT,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: colors.graphite,
  },
});
