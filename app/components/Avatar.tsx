import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, ImageURISource } from 'react-native';
import { colors, typography, fontSize } from '@/lib/theme';
import { Text } from './Text';

interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md';
  stack?: boolean;
  style?: object;
  /** Optional remote image source. When provided, the image is rendered;
   *  on load failure (or null), it falls back to the `initials` view. */
  source?: ImageURISource | null;
}

export function Avatar({ initials, size = 'md', stack = false, style, source }: AvatarProps) {
  const dim = size === 'sm' ? 26 : 34;
  const [failed, setFailed] = useState(false);
  // A new source resets the error state — otherwise switching avatars after a
  // previous load failure would never re-attempt.
  useEffect(() => {
    setFailed(false);
  }, [source?.uri]);

  const showImage = !!source?.uri && !failed;

  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        stack && styles.stack,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={source as ImageURISource}
          style={{ width: dim, height: dim, borderRadius: dim / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.text, size === 'sm' && styles.textSm]}>{initials}</Text>
      )}
    </View>
  );
}

interface AvatarStackProps {
  people: string[];
  /** Max avatars shown before collapsing the tail into a "+N" chip. */
  max?: number;
}

export function AvatarStack({ people, max = 3 }: AvatarStackProps) {
  const overflow = people.length - max;
  const shown = overflow > 0 ? people.slice(0, max) : people;
  return (
    <View style={styles.stackRow}>
      {shown.map((p, i) => (
        <Avatar key={i} initials={p} size="sm" stack={i > 0} />
      ))}
      {overflow > 0 && (
        <View style={[styles.base, styles.overflow, styles.stack]}>
          <Text style={[styles.text, styles.textSm]}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bone,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stack: {
    marginLeft: -8,
    borderWidth: 1.5,
    borderColor: colors.paper,
  },
  text: {
    ...typography.monoLabel,
    letterSpacing: 0,
    color: colors.graphite,
  },
  textSm: {
    fontSize: fontSize.caption - 2,
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overflow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bone,
  },
});
