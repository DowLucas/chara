import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/name';
import { colors, fontDisplay, fontBody, fontBodyMedium, fontMono, fontMonoMedium, fontSize, spacing } from '@/lib/theme';

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  const initials = initialsOf(user?.name);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title={t('you.title')} right={<IconButton icon="settings" />} />
      <View style={styles.content}>
        <Avatar initials={initials} size="md" style={styles.avatar} />
        <Text style={styles.name}>{user?.name ?? t('common.dash')}</Text>
        <Text style={styles.email}>{user?.email ?? t('common.dash')}</Text>
        <View style={styles.rule} />
        {__DEV__ && (
          <View style={styles.devBlock}>
            <Text style={styles.devEyebrow}>{t('you.devEyebrow')}</Text>
            <TouchableOpacity
              style={styles.devRow}
              onPress={() => router.push('/onboarding')}
              activeOpacity={0.7}
            >
              <Text style={styles.devRowLabel}>{t('you.replayOnboarding')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>{t('you.signOut')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: spacing.s5,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  name: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.5,
    color: colors.graphite,
    marginTop: spacing.s3,
  },
  email: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 4,
  },
  rule: {
    width: '100%',
    height: 1.5,
    backgroundColor: colors.graphite,
    marginTop: spacing.s5,
    marginBottom: spacing.s5,
  },
  signOutBtn: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s5,
  },
  signOutText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
  },
  devBlock: {
    width: '100%',
    marginBottom: spacing.s4,
    paddingHorizontal: spacing.s5,
  },
  devEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  devRow: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  devRowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
});
