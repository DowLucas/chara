import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { hapticSuccess } from '@/lib/haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useEnglishT } from '@/lib/i18n';
import { apiFor } from '@/lib/api';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { setOverride as setGroupColorOverride } from '@/lib/group-color';
import { GroupSetupForm, GroupSetupValue, defaultGroupCurrency } from '@/components/GroupSetupForm';
import { useDefaultAccount } from '@/lib/accounts';
import * as analytics from '@/lib/analytics';
import { ContentContainer } from '@/components/ContentContainer';

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  const defaultAccount = useDefaultAccount();
  const [form, setForm] = useState<GroupSetupValue>(() => ({
    name: '',
    currency: defaultGroupCurrency(),
    color: null,
  }));
  const [submitting, setSubmitting] = useState(false);
  const { name, currency, color } = form;

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    if (!defaultAccount) return;
    const serverUrl = defaultAccount.serverUrl;
    setSubmitting(true);
    try {
      const group = await apiFor(serverUrl).createGroup(name.trim(), currency);
      if (color) {
        try {
          await setGroupColorOverride(serverUrl, group.id, color);
        } catch {
          // Color override is per-device cosmetic; never block group creation.
        }
      }
      analytics.track('group_created');
      hapticSuccess();
      router.replace(
        `/onboarding/created?server=${encodeURIComponent(serverUrl)}&groupId=${group.id}`,
      );
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : undefined;
      let code: string = 'unknown';
      if (status) {
        code = `http_${status}`;
      } else if (e?.message && /network|fetch|timeout/i.test(String(e.message))) {
        code = 'network';
      }
      analytics.track('group_create_failed', { code });
      showAlert({ title: t('createGroup.errorTitle'), message: e?.message || String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <ContentContainer>
      <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
        <Feather name="chevron-left" size={22} color={colors.graphite} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('createGroup.eyebrow')}</Text>
        <Text style={styles.headline}>{t('createGroup.headline')}</Text>
        <Text style={styles.body}>{t('createGroup.body')}</Text>
      </View>

      <GroupSetupForm value={form} onChange={setForm} />
      </ContentContainer>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <ContentContainer>
        <TouchableOpacity
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          disabled={!canSubmit}
          onPress={handleCreate}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>{submitting ? t('createGroup.creating') : t('createGroup.submit')}</Text>
          <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
        </TouchableOpacity>
        </ContentContainer>
      </View>
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
    letterSpacing: 0.3,
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
