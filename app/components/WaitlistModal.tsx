/**
 * Waitlist modal for the hosted free-tier OCR cap.
 *
 * Shown when a free user on the hosted instance hits their monthly receipt-
 * scan cap (server returns 429 with `waitlist_prompt: true`). Collects an
 * email so we can gauge willingness-to-pay before the v1.2 paid launch, and
 * surfaces a self-host escape hatch.
 *
 * Spec: docs/superpowers/specs/2026-05-24-pro-billing-design.md
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Text } from './Text';
import { formatDate } from '../lib/i18n';
import { markPopupClosed } from '../lib/popup-guard';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  visible: boolean;
  /** ISO timestamp the user's free scans reset at. Shown formatted. */
  periodResetsAt?: string;
  /** Pre-fill email from the signed-in user, when known. */
  defaultEmail?: string;
  /** The free-tier cap. No longer rendered in title copy, but kept on the
   *  prop for backward-compat with callers and for analytics. */
  cap: number;
  /** Called when user taps "Notify me" with a valid email. The parent runs
   *  the POST and resolves with success/failure. The modal stays visible
   *  in submitting state while this resolves. */
  onSubmit(email: string): Promise<void>;
  /** User tapped "Not now" / backdrop / swipe down. */
  onDismiss(): void;
  /** User tapped the self-host link. Parent decides what to do (probably
   *  Linking.openURL to the docs). */
  onSelfHostPressed(): void;
}

export function WaitlistModal({
  visible,
  periodResetsAt,
  defaultEmail,
  cap: _cap,
  onSubmit,
  onDismiss,
  onSelfHostPressed,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state every time the modal becomes visible — a previous
  // dismissed-while-submitted run shouldn't leak into a fresh open.
  useEffect(() => {
    if (visible) {
      setEmail(defaultEmail ?? '');
      setSubmitting(false);
      setSubmittedAt(null);
      setError(null);
    }
  }, [visible, defaultEmail]);

  const handleDismiss = React.useCallback(() => {
    markPopupClosed();
    onDismiss();
  }, [onDismiss]);

  const handleSubmit = React.useCallback(async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('waitlist.errorBadEmail'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setSubmittedAt(new Date());
    } catch {
      setError(t('waitlist.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }, [email, onSubmit, t]);

  const showSuccess = submittedAt !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollBody}>
          {showSuccess ? (
            <View style={styles.successWrap}>
              <Text style={styles.successTitle}>{t('waitlist.success')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.eyebrow}>{t('waitlist.eyebrow')}</Text>
              <Text style={styles.title}>{t('waitlist.title')}</Text>
              <Text style={styles.body}>{t('waitlist.body')}</Text>
              {periodResetsAt ? (
                <Text style={styles.resets}>
                  {t('waitlist.resetsAt', {
                    date: formatDate(new Date(periodResetsAt)),
                  })}
                </Text>
              ) : null}

              <Text style={styles.label}>{t('waitlist.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('waitlist.emailPlaceholder')}
                placeholderTextColor={colors.lead}
                editable={!submitting}
                style={styles.input}
                accessibilityLabel={t('waitlist.emailLabel')}
              />

              {error !== null && (
                <View
                  style={styles.errorBanner}
                  accessibilityRole="alert"
                  accessibilityLabel={error}
                >
                  <Text style={styles.errorBody}>{error}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {showSuccess ? (
          <View style={styles.ctaBar}>
            <Button
              kind="primary"
              onPress={handleDismiss}
              style={{ flex: 1 }}
            >
              {t('common.close')}
            </Button>
          </View>
        ) : (
          <View style={styles.ctaBar}>
            <Button
              kind="secondary"
              onPress={handleDismiss}
              style={{ flex: 1 }}
              disabled={submitting}
            >
              {t('waitlist.dismiss')}
            </Button>
            <Button
              kind="primary"
              onPress={handleSubmit}
              style={{ flex: 1 }}
              disabled={submitting}
            >
              {t('waitlist.submit')}
            </Button>
          </View>
        )}

        {!showSuccess && (
          <TouchableOpacity
            onPress={onSelfHostPressed}
            style={styles.selfHostWrap}
            accessibilityRole="link"
            disabled={submitting}
          >
            <Text style={styles.selfHostText}>
              {t('waitlist.selfHostHint')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scrollBody: { padding: spacing.s5, paddingBottom: spacing.s7 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: spacing.s3,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    marginBottom: spacing.s3,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    marginBottom: spacing.s4,
  },
  resets: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginBottom: spacing.s5,
  },
  label: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  input: {
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    backgroundColor: colors.paper,
  },
  errorBanner: {
    marginTop: spacing.s4,
    padding: spacing.s3,
    borderRadius: 6,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  errorBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
  },
  successWrap: {
    paddingVertical: spacing.s7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  ctaBar: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  selfHostWrap: {
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s5,
    paddingTop: spacing.s2,
    alignItems: 'center',
    backgroundColor: colors.paper,
  },
  selfHostText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
});
