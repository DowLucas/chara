import React from 'react';
import { View, StyleSheet } from 'react-native';
import { typography } from '@/lib/theme';
import { makeStyles } from '@/lib/theme-context';
import { Text } from './Text';

interface Props {
  children: React.ReactNode;
  solid?: boolean;
}

export function Chip({ children, solid = false }: Props) {
  const styles = useStyles();
  return (
    <View style={[styles.base, solid && styles.solid]}>
      <Text style={[styles.text, solid && styles.textSolid]}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
  },
  solid: {
    backgroundColor: colors.graphite,
    borderColor: colors.graphite,
  },
  text: {
    ...typography.monoCaption,
    color: colors.lead,
  },
  textSolid: {
    color: colors.paper,
  },
}));
