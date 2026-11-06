import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, ImageBackground, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { hapticSelect } from '@/lib/haptics';
import { sealLines } from '@/lib/profile-scene';
import { darkColors, fontDisplay, fontSize } from '@/lib/theme';
import { makeStyles } from '@/lib/theme-context';

/** Height of the scene below the status bar. */
export const SCENE_HEIGHT = 200;

interface Props {
  title: string;
  name: string | null | undefined;
  /** Accessibility label for the seal button. */
  sealLabel: string;
  topInset: number;
}

/**
 * The You tab's header: a slice of the settled-night print, with the title
 * over the sky and the user's first name as the artist's seal in the corner.
 * The scene is the same in both themes (it is a picture of night), drawn on
 * `printNight` so it never flashes paper while the image decodes; `printDim`
 * dims it slightly in dark mode so it doesn't glare against the Sumi paper.
 */
export function SceneHeader({ title, name, sealLabel, topInset }: Props) {
  const styles = useStyles();
  const rotate = useRef(new Animated.Value(-2)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { reduceMotion.current = v; })
      .catch(() => {});
  }, []);

  // Same landing as the SETTLED Stamp: lift, then press down at -2°.
  function stamp() {
    hapticSelect();
    if (reduceMotion.current) return;
    rotate.setValue(-9);
    scale.setValue(1.18);
    Animated.parallel([
      Animated.spring(rotate, { toValue: -2, stiffness: 240, damping: 12, mass: 0.9, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.94, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, stiffness: 260, damping: 14, useNativeDriver: true }),
      ]),
    ]).start();
  }

  const rotateDeg = rotate.interpolate({ inputRange: [-9, -2], outputRange: ['-9deg', '-2deg'] });

  return (
    <ImageBackground
      source={require('@/assets/illustrations/profile-night.jpg')}
      style={[styles.scene, { height: topInset + SCENE_HEIGHT }]}
      resizeMode="cover"
      accessible={false}
    >
      <View style={styles.dim} pointerEvents="none" />
      <Text style={[styles.title, { marginTop: topInset + 10 }]} accessibilityRole="header">
        {title}
      </Text>
      <Pressable
        onPress={stamp}
        accessibilityRole="button"
        accessibilityLabel={sealLabel}
        hitSlop={8}
        style={styles.sealHit}
      >
        <Animated.View style={[styles.seal, { transform: [{ rotate: rotateDeg }, { scale }] }]}>
          {sealLines(name).map((line, i) => (
            <Text key={i} style={styles.sealText} maxFontSizeMultiplier={1}>
              {line}
            </Text>
          ))}
        </Animated.View>
      </Pressable>
    </ImageBackground>
  );
}

const useStyles = makeStyles((colors) => ({
  scene: { width: '100%', backgroundColor: colors.printNight, overflow: 'hidden' },
  dim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.printDim },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    textAlign: 'center',
    color: colors.fgOnAccent,
  },
  // Fixed position in the scene's lower right, over the far bank.
  sealHit: { position: 'absolute', right: 44, bottom: 28 },
  seal: {
    minWidth: 42,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderWidth: 2,
    borderRadius: 3,
    // The scene is night in both themes, so the seal uses the dark
    // palette's readable brand red regardless of the app's theme.
    borderColor: darkColors.vermillionInk,
    backgroundColor: colors.printSealWash,
    alignItems: 'center',
  },
  sealText: {
    fontFamily: fontDisplay,
    fontSize: 15,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: darkColors.vermillionInk,
  },
}));
