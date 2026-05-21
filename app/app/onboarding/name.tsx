import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { updateMe } from '@/lib/api';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

export default function OnboardingNameScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  // Lock the input if a name was already set on entry — users can confirm
  // their existing name but can edit it from the You tab, not here.
  const [locked] = useState(() => !!user?.name?.trim());
  const [name, setName] = useState(user?.name ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('onboardingName.errorTitle'), t('onboardingName.errorEmpty'));
      return;
    }
    // No-op network call when the input is locked — the name is already saved
    // server-side, so we just advance to the next step.
    if (locked) {
      router.replace('/onboarding');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await updateMe({ name: trimmed });
      setUser(updated);
      router.replace('/onboarding');
    } catch (e: any) {
      Alert.alert(t('onboardingName.errorTitle'), e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.s4 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
          editable={!locked}
          autoFocus={!locked}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          style={[styles.input, locked && styles.inputLocked]}
        />
        {locked ? (
          <Text style={styles.lockedHint}>{t('onboardingName.lockedHint')}</Text>
        ) : null}
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
  header: { gap: spacing.s2, marginBottom: spacing.s5 },
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
  inputLocked: {
    backgroundColor: colors.bone,
    color: colors.lead,
  },
  lockedHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: spacing.s1,
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
