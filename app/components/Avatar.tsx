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
          // Fill the wrapper so size overrides via the `style` prop (e.g.
          // the 64x64 avatar on the You tab) apply to the image too. The
          // wrapper has overflow:'hidden' + a matching borderRadius, so
          // the image is automatically clipped to a circle.
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.text, size === 'sm' && styles.textSm]}>{initials}</Text>
      )}
    </View>
  );
}

export interface StackPerson {
  initials: string;
  source?: ImageURISource | null;
}

interface AvatarStackProps {
  /** Either bare initials strings (legacy) or full person records. */
  people: ReadonlyArray<string | StackPerson>;
  /** Max avatars shown before collapsing the tail into an overflow chip. */
  max?: number;
  /** How to render the overflow chip: numeric "+N" (default) or a bare "…". */
  overflow?: 'count' | 'ellipsis';
  /** Background tone for the avatar fill. Default "bone" matches paper
   *  surfaces; pass "paper" when stacking on top of a bone card (e.g. the
   *  home groups list) so the circles don't blend into the card. */
  tone?: 'bone' | 'paper';
}

export function AvatarStack({ people, max = 3, overflow = 'count', tone = 'bone' }: AvatarStackProps) {
  const normalized: StackPerson[] = people.map((p) =>
    typeof p === 'string' ? { initials: p } : p,
  );
  const overflowCount = normalized.length - max;
  const shown = overflowCount > 0 ? normalized.slice(0, max) : normalized;
  const fill = tone === 'paper' ? colors.paper : colors.bone;
  const ring = tone === 'paper' ? colors.bone : colors.paper;
  return (
    <View style={styles.stackRow}>
      {shown.map((p, i) => (
        <Avatar
          key={i}
          initials={p.initials}
          source={p.source ?? null}
          size="sm"
          stack={i > 0}
          style={{ backgroundColor: fill, borderColor: i > 0 ? ring : colors.ruleSoft }}
        />
      ))}
      {overflowCount > 0 && (
        <View
          style={[
            styles.base,
            styles.overflowChip,
            styles.stack,
            { backgroundColor: fill, borderColor: ring },
          ]}
        >
          <Text style={[styles.text, styles.textSm]}>
            {overflow === 'ellipsis' ? '…' : `+${overflowCount}`}
          </Text>
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
  overflowChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bone,
  },
});
