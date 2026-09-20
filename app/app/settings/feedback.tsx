/**
 * Send feedback — a bug report or a feature idea.
 *
 * Hosted-only, so the screen is scoped to the single account whose server
 * advertises `features.feedback` rather than being a per-account list; the
 * You-tab row that leads here is hidden when no account qualifies.
 *
 * Errors show inline rather than in a dialog: the user has just typed a
 * paragraph, and an alert that covers the field they need to retry from is
 * the wrong shape for "try again in a second".
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';

import { Text } from '@/components/Text';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { showAlert } from '@/lib/app-alert';
import { apiFor, type FeedbackSubmission } from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { useFeatureServerUrl } from '@/lib/use-feature-server';
import { userErrorMessage } from '@/lib/user-error';
import { currentLocale } from '@/lib/i18n';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

/** Matches maxFeedbackBodyLen in backend/internal/handler/text_limits.go. */
const MAX_BODY = 4000;

const KINDS: FeedbackSubmission['kind'][] = ['bug', 'idea'];

// Same reasoning as the You-tab footer: the app-config marketing version is
// the source of truth, and the native build number is meaningless in Expo Go.
const APP_VERSION = Constants.expoConfig?.version ?? '';
const APP_BUILD =
  Constants.executionEnvironment === 'storeClient' ? null : Application.nativeBuildVersion;
const VERSION_LABEL = APP_VERSION
  ? `${APP_VERSION}${APP_BUILD ? ` (${APP_BUILD})` : ''}`
  : '';

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Live feature read rather than the cached account.instance blob, which is
  // only written at sign-in — see use-feature-server.ts.
  const serverUrl = useFeatureServerUrl('feedback');
  const account = useAccount(serverUrl);

  const [kind, setKind] = useState<FeedbackSubmission['kind']>('bug');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = body.trim().length > 0 && !submitting && serverUrl !== null;

  async function handleSubmit() {
    if (!serverUrl || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFor(serverUrl).submitFeedback({
        kind,
        body: body.trim(),
        app_version: VERSION_LABEL || undefined,
        platform: `${Platform.OS} ${Platform.Version}`,
        locale: currentLocale(),
      });
      await showAlert({
        title: t('feedback.sent.title'),
        message: t('feedback.sent.body'),
        buttons: [{ key: 'ok', label: t('common.ok') }],
      });
      router.back();
    } catch (e) {
      setError(userErrorMessage(e, t('common.requestFailed')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar
        title={t('feedback.title')}
        left={
          <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ContentContainer>
          <Text style={styles.intro}>{t('feedback.intro')}</Text>

          <Text style={styles.eyebrow}>{t('feedback.kindEyebrow')}</Text>
          <View style={styles.segments}>
            {KINDS.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.segment, kind === k && styles.segmentOn]}
                onPress={() => setKind(k)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k }}
              >
                <Text style={[styles.segmentLabel, kind === k && styles.segmentLabelOn]}>
                  {t(`feedback.kind.${k}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('feedback.bodyLabel')}</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t(`feedback.placeholder.${kind}`)}
              placeholderTextColor={colors.lead}
              multiline
              textAlignVertical="top"
              maxLength={MAX_BODY}
              autoFocus
              style={styles.input}
              accessibilityLabel={t('feedback.bodyLabel')}
            />
          </View>

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* What rides along with the report, said plainly rather than
              collected silently. */}
          <Text style={styles.meta}>
            {t('feedback.meta', {
              email: account?.user?.email ?? '',
              version: VERSION_LABEL,
            })}
          </Text>
        </ContentContainer>
      </ScrollView>

      <ContentContainer>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            disabled={!canSubmit}
            onPress={handleSubmit}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaLabel}>
              {submitting ? t('feedback.sending') : t('feedback.send')}
            </Text>
            <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
          </TouchableOpacity>
        </View>
      </ContentContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: spacing.s6, paddingHorizontal: spacing.s5 },
  intro: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 20,
    marginTop: spacing.s4,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: spacing.s5,
    marginBottom: spacing.s2,
  },
  segments: { flexDirection: 'row', gap: spacing.s2 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.graphite,
  },
  segmentOn: { backgroundColor: colors.graphite },
  segmentLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  segmentLabelOn: { color: colors.paper },
  field: { gap: spacing.s2, marginTop: spacing.s5 },
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
    minHeight: 160,
  },
  errorBanner: {
    marginTop: spacing.s4,
    padding: spacing.s3,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  errorText: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.brick },
  meta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: spacing.s4,
  },
  footer: { paddingTop: spacing.s3, paddingHorizontal: spacing.s5 },
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
