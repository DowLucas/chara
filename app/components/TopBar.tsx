import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontDisplay, fontBodyMedium, fontSize } from '@/lib/theme';

interface Props {
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function TopBar({ title, left, right }: Props) {
  const { t } = useTranslation();
  const appName = t('app.name');
  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.side}>{left}</View>
        <View style={styles.center}>
          {title === appName ? (
            <View style={styles.wordmark}>
              <Text style={styles.wordmarkText}>{appName}</Text>
              <View style={styles.wordmarkRule} />
            </View>
          ) : title ? (
            <Text style={styles.title}>{title}</Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.rightSide]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.paper,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.graphite,
  },
  inner: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 60,
  },
  rightSide: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmarkText: {
    fontFamily: fontDisplay,
    fontSize: 20,
    letterSpacing: -0.7,
    color: colors.graphite,
  },
  wordmarkRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    width: 40,
  },
  title: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
});
