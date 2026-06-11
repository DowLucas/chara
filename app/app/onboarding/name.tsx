import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useEnglishT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { updateMe } from '@/lib/api';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';
import { ContentContainer } from '@/components/ContentContainer';

export default function OnboardingNameScreen() {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Phone is optional — it only powers Swish/Vipps settle deep-links, a
  // non-essential feature. Apple 5.1.1(v): don't require info the core
  // app doesn't need. Name is the only gate.
  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSignOut() {
    const r = await showAlert({
      title: t('accounts.signOutConfirmTitle'),
      message: t('accounts.signOutConfirmBody'),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'signout', label: t('you.signOut'), style: 'destructive' },
      ],
    });
    if (r !== 'signout') return;
    setSigningOut(true);
    try {
      await signOut();
      // OnboardingLayout redirects to /(auth)/sign-in once user becomes null.
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      showAlert({ title: t('onboardingName.errorTitle'), message: t('onboardingName.errorEmpty') });
      return;
    }
    setSubmitting(true);
    try {
      // Omit phone when blank — the backend rejects an empty string but
      // treats an absent field as "leave unchanged".
      const updated = await updateMe({ name: trimmedName, phone: trimmedPhone || undefined });
      setUser(updated);
      analytics.track('user_name_entered');
      if (router.canGoBack()) router.back();
      else router.replace('/onboarding');
    } catch (e: any) {
      showAlert({ title: t('onboardingName.errorTitle'), message: e?.message || String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ContentContainer style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('onboardingName.eyebrow')}</Text>
        <Text style={styles.headline}>{t('onboardingName.headline')}</Text>
        <Text style={styles.body}>{t('onboardingName.body')}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('onboardingName.label')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboardingName.placeholder')}
          placeholderTextColor={colors.lead}
          autoFocus={!user?.name}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          returnKeyType="next"
          style={styles.input}
        />
      </View>

      <View style={[styles.field, { marginTop: spacing.s4 }]}>
        <Text style={styles.fieldLabel}>{t('onboardingName.phoneLabel')}</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder={t('onboardingName.phonePlaceholder')}
          placeholderTextColor={colors.lead}
          // Land the cursor here when the user already has a name and is
          // coming back specifically to add a phone (You → Profile, or the
          // Swish nudge). Fresh signups still focus the name field first.
          autoFocus={!!user?.name && !user?.phone}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="tel"
          textContentType="telephoneNumber"
          keyboardType="phone-pad"
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          style={styles.input}
        />
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <TouchableOpacity
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>
            {submitting ? t('onboardingName.saving') : t('onboardingName.submit')}
          </Text>
          <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.signOutLabel}>
            {signingOut ? t('onboardingName.saving') : t('you.signOut')}
          </Text>
        </TouchableOpacity>
      </View>
      </ContentContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  header: { gap: spacing.s2, marginTop: spacing.s4, marginBottom: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead, lineHeight: 20 },
  field: { gap: spacing.s2 },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  footer: { paddingTop: spacing.s3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
  signOutBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s2,
  },
  signOutLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    textDecorationColor: colors.ruleSoft,
  },
});
