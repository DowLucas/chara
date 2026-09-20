import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { ContentContainer } from '@/components/ContentContainer';
import { useEnglishT } from '@/lib/i18n';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

/**
 * Shared chrome for the pre-signup welcome steps: back chevron, mono eyebrow,
 * display headline, optional body, scrollable content, pinned primary CTA.
 */
export function OnboardingScaffold({
  eyebrow,
  headline,
  body,
  cta,
  children,
}: {
  eyebrow: string;
  headline: string;
  body?: string;
  cta?: { label: string; onPress: () => void; disabled?: boolean };
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <ContentContainer>
          {router.canGoBack() && (
            <TouchableOpacity
              style={styles.back}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <Feather name="chevron-left" size={22} color={colors.graphite} />
            </TouchableOpacity>
          )}
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.headline}>{headline}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
          </View>
          {children}
        </ContentContainer>
      </ScrollView>

      {cta && (
        <ContentContainer>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
            <TouchableOpacity
              style={[styles.cta, cta.disabled && styles.ctaDisabled]}
              disabled={cta.disabled}
              onPress={cta.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>{cta.label}</Text>
              <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
            </TouchableOpacity>
          </View>
        </ContentContainer>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  scroll: { flex: 1 },
  back: { paddingVertical: spacing.s2, marginLeft: -spacing.s2, alignSelf: 'flex-start' },
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
  body: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.lead, lineHeight: 22 },
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
