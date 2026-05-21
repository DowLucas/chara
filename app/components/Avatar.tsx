import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, typography, fontSize } from '@/lib/theme';
import { Text } from './Text';

interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md';
  stack?: boolean;
  style?: object;
}

export function Avatar({ initials, size = 'md', stack = false, style }: AvatarProps) {
  const dim = size === 'sm' ? 26 : 34;
  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        stack && styles.stack,
        style,
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSm]}>{initials}</Text>
    </View>
  );
}

interface AvatarStackProps {
  people: string[];
  max?: number;
}

export function AvatarStack({ people, max = 4 }: AvatarStackProps) {
  const shown = people.slice(0, max);
  return (
    <View style={styles.stackRow}>
      {shown.map((p, i) => (
        <Avatar key={i} initials={p} size="sm" stack={i > 0} />
      ))}
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
});
