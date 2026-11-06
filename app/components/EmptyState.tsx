import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { typography } from '@/lib/theme';
import { makeStyles, useColors } from '@/lib/theme-context';
import { Text } from './Text';

interface Props {
  title: string;
  body?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
}

export function EmptyState({ title, body, icon = 'file-text' }: Props) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Feather name={icon} size={28} color={colors.lead} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  title: {
    ...typography.displayS,
    color: colors.graphite,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    ...typography.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
}));
