import React from 'react';
import { View, StyleSheet } from 'react-native';
import { makeStyles } from '@/lib/theme-context';
import { useGroupColor } from '@/lib/group-color';
import { displaySwatch } from '@/lib/theme';
import { useTheme } from '@/lib/theme-context';

interface Props {
  serverUrl: string;
  groupId: string;
  size?: number;
}

/** Solid colored disk used as the per-group avatar on the home dashboard.
 *  Replaces the old initial chip. Color is picked by useGroupColor() — hash
 *  default unless the user has set an override. */
export function GroupAvatar({ serverUrl, groupId, size = 36 }: Props) {
  const styles = useStyles();
  const { scheme } = useTheme();
  const color = displaySwatch(useGroupColor(serverUrl, groupId), scheme);
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

const useStyles = makeStyles((colors) => ({
  base: {
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
}));
