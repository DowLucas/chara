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
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { updateMe } from '@/lib/api';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

export default function OnboardingNameScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0 && !submitting;

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      showAlert({ title: t('onboardingName.errorTitle'), message: t('onboardingName.errorEmpty') });
      return;
    }
    if (!trimmedPhone) {
      showAlert({ title: t('onboardingName.errorTitle'), message: t('onboardingName.errorPhone') });
      return;
    }
    setSubmitting(true);
    try {
      const updated = await updateMe({ name: trimmedName, phone: trimmedPhone });
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
      <TouchableOpacity
        style={styles.back}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/you');
        }}
        accessibilityLabel={t('common.back')}
      >
        <Feather name="chevron-left" size={22} color={colors.graphite} />
      </TouchableOpacity>

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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  back: { paddingVertical: spacing.s2, marginLeft: -spacing.s2, alignSelf: 'flex-start' },
  header: { gap: spacing.s2, marginTop: spacing.s4, marginBottom: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 32,
    lineHeight: 36,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead, lineHeight: 20 },
  field: { gap: spacing.s2 },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
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
});
