import React from 'react';
import { ImageBackground, View } from 'react-native';
import { Text } from '@/components/Text';
import { fontDisplay, fontSize } from '@/lib/theme';
import { makeStyles } from '@/lib/theme-context';

/** Height of the scene below the status bar. */
export const SCENE_HEIGHT = 200;

interface Props {
  title: string;
  topInset: number;
}

/**
 * The You tab's header: a slice of the settled-night print, with the title
 * over the sky.
 * The scene is the same in both themes (it is a picture of night), drawn on
 * `printNight` so it never flashes paper while the image decodes; `printDim`
 * dims it slightly in dark mode so it doesn't glare against the Sumi paper.
 */
export function SceneHeader({ title, topInset }: Props) {
  const styles = useStyles();
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
}));
