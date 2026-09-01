/**
 * Group categories screen — configure which of the fixed EXPENSE_CATEGORIES
 * are enabled for this group (subset + order of the shared, fully-translated
 * catalog — never free text, so every member sees every label correctly
 * translated regardless of device language).
 *
 * Any member can view; only the owner can save (mirrors edit.tsx's group
 * rename screen — the client doesn't pre-check the role, the backend 403s
 * and the error banner surfaces it).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { ContentContainer } from '@/components/ContentContainer';
import { Text } from '@/components/Text';
import { apiFor, Group } from '@/lib/api';
import {
  categoryIcon,
  categoryLabelKey,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  resolveGroupCategorySlugs,
} from '@/lib/categories';
import { hapticSuccess } from '@/lib/haptics';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function GroupCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);

  const [group, setGroup] = useState<Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<ExpenseCategory>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !serverUrl) return;
    api
      .getGroup(id)
      .then((g) => {
        setGroup(g);
        setEnabled(new Set(resolveGroupCategorySlugs(g.category_slugs)));
      })
      .catch(() => setLoadError(t('groupCategories.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, serverUrl]);

  const initialEnabled = useMemo(
    () => (group ? new Set(resolveGroupCategorySlugs(group.category_slugs)) : null),
    [group],
  );
  const dirty =
    !!initialEnabled &&
    (initialEnabled.size !== enabled.size ||
      [...initialEnabled].some((c) => !enabled.has(c)));
  const canSubmit = dirty && enabled.size > 0 && !submitting;

  function toggle(category: ExpenseCategory) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function handleSave() {
    if (!canSubmit || !group) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const category_slugs = EXPENSE_CATEGORIES.filter((c) => enabled.has(c));
      const updated = await api.updateGroup(group.id, { category_slugs });
      setGroup(updated);
      hapticSuccess();
      router.back();
    } catch (e: any) {
      setSubmitError(e?.message || t('groupCategories.errorTitle'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('groupCategories.title')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} label={t('common.back')} />}
      />

      {loadError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{loadError}</Text>
        </View>
      )}
      {!!submitError && (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>{submitError}</Text>
        </View>
      )}

      {!group && !loadError && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.graphite} />
        </View>
      )}

      {group && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
        >
          <ContentContainer>
            <Text style={styles.hint}>{t('groupCategories.editorHint')}</Text>
            <View style={styles.list}>
              {EXPENSE_CATEGORIES.map((c) => {
                const active = enabled.has(c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={styles.row}
                    onPress={() => toggle(c)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <View style={styles.rowLeft}>
                      <Feather name={categoryIcon(c)} size={16} color={colors.lead} />
                      <Text style={styles.rowLabel}>{t(categoryLabelKey(c))}</Text>
                    </View>
                    <Feather
                      name={active ? 'check-square' : 'square'}
                      size={20}
                      color={active ? colors.vermillion : colors.lead}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ContentContainer>
        </ScrollView>
      )}

      {group && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            disabled={!canSubmit}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaLabel}>
              {submitting ? t('groupCategories.saving') : t('groupCategories.saveCta')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    margin: spacing.s5,
    padding: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  bannerText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
  },
  hint: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 18,
    marginTop: spacing.s4,
    marginBottom: spacing.s4,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  rowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  footer: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
});
