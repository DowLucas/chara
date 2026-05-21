import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { requestMagicLink, verifyMagicLink } from '@/lib/api';
import { colors, fontDisplay, fontBody, fontBodyMedium, fontMono, fontMonoMedium, fontSize, spacing } from '@/lib/theme';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleMagicLink() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await requestMagicLink(email.trim());
      // Dev mode: the server returns the raw token so we can sign in immediately.
      if (res.token) {
        const { token } = await verifyMagicLink(res.token);
        await signIn(token);
        return;
      }
      setSent(true);
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn('[quits] sign-in failed', msg);
      Alert.alert(t('signIn.couldNotSend'), msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Wordmark */}
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmarkText}>{t('app.name')}</Text>
        <View style={styles.wordmarkRule} />
      </View>

      {/* Tagline */}
      <View style={styles.tagline}>
        <Text style={styles.eyebrow}>{t('signIn.eyebrow')}</Text>
        <Text style={styles.headline}>{t('signIn.headline')}</Text>
      </View>

      <View style={{ flex: 1 }} />

      {/* Auth section */}
      {sent ? (
        <View style={styles.sentWrap}>
          <Feather name="mail" size={28} color={colors.moss} />
          <Text style={styles.sentTitle}>{t('signIn.checkEmail')}</Text>
          <Text style={styles.sentBody}>{t('signIn.checkEmailBody', { email })}</Text>
        </View>
      ) : (
        <View style={styles.authButtons}>
          {/* Email input */}
          <View style={styles.emailField}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={colors.lead}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.emailInput}
            />
          </View>

          <TouchableOpacity
            style={[styles.authBtn, styles.authBtnPrimary]}
            onPress={handleMagicLink}
            disabled={loading || !email.trim()}
            activeOpacity={0.85}
          >
            <Feather name="mail" size={18} color={colors.fgOnAccent} />
            <Text style={[styles.authBtnLabel, styles.authBtnLabelPrimary]}>
              {loading ? t('signIn.sending') : t('signIn.continueEmail')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.authBtn, styles.authBtnSecondary]} activeOpacity={0.85}>
            <Feather name="chrome" size={18} color={colors.graphite} />
            <Text style={[styles.authBtnLabel, styles.authBtnLabelDefault]}>
              {t('signIn.continueGoogle')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Self-host footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <View style={styles.footerRule} />
        <View style={styles.footerRow}>
          <Text style={styles.footerLeft}>{t('signIn.hostedBy')}</Text>
          <Text style={styles.footerRight}>{t('signIn.useMyServer')}</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.s5,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.s2,
  },
  wordmarkText: {
    fontFamily: fontDisplay,
    fontSize: 28,
    letterSpacing: -1,
    color: colors.graphite,
  },
  wordmarkRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.graphite,
  },
  tagline: {
    marginTop: 56,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 36,
    letterSpacing: -1.3,
    lineHeight: 38,
    color: colors.graphite,
  },
  sentWrap: {
    alignItems: 'center',
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  sentTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },
  sentBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
  authButtons: {
    gap: spacing.s2,
    paddingBottom: spacing.s3,
  },
  emailField: {
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s1,
  },
  emailInput: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  authBtnPrimary: {
    backgroundColor: colors.vermillion,
    borderColor: colors.vermillion,
  },
  authBtnSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.graphite,
  },
  authBtnLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    letterSpacing: -0.1,
  },
  authBtnLabelPrimary: {
    color: colors.fgOnAccent,
  },
  authBtnLabelDefault: {
    color: colors.graphite,
  },
  footer: {
    paddingTop: spacing.s3,
  },
  footerRule: {
    height: 0.5,
    backgroundColor: colors.ruleSoft,
    marginBottom: spacing.s3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  footerRight: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
  },
});
