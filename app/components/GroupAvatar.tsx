import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';
import { useGroupColor } from '@/lib/group-color';

interface Props {
  serverUrl: string;
  groupId: string;
  size?: number;
}

/** Solid colored disk used as the per-group avatar on the home dashboard.
 *  Replaces the old initial chip. Color is picked by useGroupColor() — hash
 *  default unless the user has set an override. */
export function GroupAvatar({ serverUrl, groupId, size = 36 }: Props) {
  const color = useGroupColor(serverUrl, groupId);
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
});
