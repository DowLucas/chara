/**
 * Import — per-app capture → extract → reconcile → review → commit.
 *
 * A single screen drives a four-step state machine ('capture' | 'reconcile'
 * | 'review' | 'importing'). All decisions live in the tested pure helpers
 * (`import-apps`, `import-reconcile`, `import-review`); this file is the thin
 * renderer + the two network calls (`importExtract` / `importCommit`).
 *
 * Composite (server,id) identity: `server` decoded on read; on success we
 * route back to the group via the encoded server.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { showAlert } from '@/lib/app-alert';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { MoneyText } from '@/components/MoneyText';
import {
  apiFor,
  GroupDetail,
  GroupMember,
  ImportStanding,
} from '@/lib/api';
import { importAppForSource } from '@/lib/import-apps';
import { reconcile, resolvedMemberId, ReconcileState } from '@/lib/import-reconcile';
import { reviewState, ReviewRow } from '@/lib/import-review';
import { decimalToMinor, minorToDecimal } from '@/lib/money-utils';
import { formatMinorUnits } from '@/lib/i18n';
import { notifyGroupChanged } from '@/lib/group-refresh';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontSize,
  radii,
  spacing,
} from '@/lib/theme';

const MAX_IMAGES = 10;

interface TrayImage {
  uri: string;
  base64: string;
  mimeType: string;
}

type Step = 'capture' | 'reconcile' | 'review' | 'importing';

function inferMime(asset: ImagePicker.ImagePickerAsset): string {
  const m = (asset as { mimeType?: string }).mimeType?.toLowerCase();
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

/** Hero header shared by every step: mono step indicator + display headline + body. */
function StepHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerEyebrow}>{eyebrow}</Text>
      <Text style={styles.headline}>{title}</Text>
      <Text style={styles.headerBody}>{body}</Text>
    </View>
  );
}

export default function ImportSourceScreen() {
  const { server, id, source } = useLocalSearchParams<{
    server: string;
    id: string;
    source: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const groupId = id ?? '';
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const app = importAppForSource(source);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [step, setStep] = useState<Step>('capture');
  const [images, setImages] = useState<TrayImage[]>([]);
  const [busy, setBusy] = useState(false);

  const [extractedCurrency, setExtractedCurrency] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  // Memoized so reconcile/review don't recompute over a fresh array identity
  // on every render.
  const members: GroupMember[] = useMemo(() => group?.members ?? [], [group]);

  useEffect(() => {
    if (!groupId || !serverUrl) return;
    api
      .getGroup(groupId)
      .then(setGroup)
      .catch(() => {});
  }, [groupId, serverUrl]);

  // Distinct counterparty names from the extracted standings drive reconcile.
  const people = useMemo(() => rows.map((r) => r.name), [rows]);

  const reconcileResult: ReconcileState = useMemo(
    () => reconcile(people, members, overrides),
    [people, members, overrides],
  );

  const review = useMemo(
    () =>
      reviewState({
        rows,
        groupCurrency: group?.currency ?? '',
        extractedCurrency,
      }),
    [rows, group?.currency, extractedCurrency],
  );

  async function addScreenshots() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: t('import.permissionTitle'), message: t('import.permissionBody') });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 0.85,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    const next = [...images];
    for (const asset of picked.assets ?? []) {
      if (!asset.base64 || next.length >= MAX_IMAGES) continue;
      next.push({ uri: asset.uri, base64: asset.base64, mimeType: inferMime(asset) });
    }
    setImages(next);
  }

  function removeImage(uri: string) {
    setImages((prev) => prev.filter((i) => i.uri !== uri));
  }

  async function runExtract() {
    if (!app || images.length === 0) return;
    setBusy(true);
    try {
      const result = await api.importExtract(groupId, {
        source: app.source,
        images: images.map((i) => ({ image_base64: i.base64, mime_type: i.mimeType })),
      });
      if (result.standings.length === 0) {
        showAlert({ title: t('import.empty.title'), message: t('import.empty.body') });
        return;
      }
      setExtractedCurrency(result.currency);
      setRows(standingsToRows(result.standings));
      setOverrides({});
      setStep('reconcile');
    } catch (e) {
      showAlert({
        title: t('import.extractError.title'),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  function standingsToRows(standings: ImportStanding[]): ReviewRow[] {
    return standings.map((s, i) => ({
      key: String(i),
      name: s.name,
      direction: s.direction,
      amount: s.amount,
      confidence: s.confidence,
    }));
  }

  async function runCommit() {
    if (!review.canConfirm) return;
    if (!app) return;
    setStep('importing');
    setBusy(true);
    try {
      const result = await api.importCommit(groupId, {
        source: app.source,
        standings: review.sortedRows.map((r) => ({
          name: r.name,
          direction: r.direction,
          // Canonicalize to a valid 2-decimal string via the shared helpers.
          amount: minorToDecimal(decimalToMinor(r.amount)),
          // Carry the user's "Match People" choice so the backend attributes
          // the balance to the matched member instead of minting a placeholder.
          memberId: resolvedMemberId(reconcileResult, r.name),
        })),
      });
      notifyGroupChanged(serverUrl, groupId);
      await showAlert({
        title: t('import.success.title'),
        message: t('import.success.body', { count: result.imported }),
      });
      router.replace(`/groups/${encodeURIComponent(serverUrl)}/${groupId}`);
    } catch (e) {
      setStep('review');
      showAlert({
        title: t('import.commitError.title'),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!app) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <TopBar
          title={t('import.picker.title')}
          left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
        />
        <Text style={styles.intro}>{t('import.unknownApp')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar
        title={t(app.labelKey)}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s8 }}
      >
        {step === 'capture' && (
          <View>
            <StepHeader
              eyebrow={t('import.step.capture')}
              title={t(app.guidanceTitleKey)}
              body={t(app.guidanceBodyKey)}
            />

            <Text style={styles.eyebrow}>{t('import.tray.eyebrow')}</Text>
            <View style={styles.tray}>
              {images.map((img) => (
                <View key={img.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.thumbRemove}
                    accessibilityRole="button"
                    accessibilityLabel={t('import.tray.remove')}
                    onPress={() => removeImage(img.uri)}
                  >
                    <Feather name="x" size={14} color={colors.fgOnAccent} />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <TouchableOpacity
                  style={styles.addTile}
                  accessibilityRole="button"
                  accessibilityLabel={t('import.tray.add')}
                  onPress={addScreenshots}
                >
                  <Feather name="plus" size={24} color={colors.lead} />
                </TouchableOpacity>
              )}
            </View>
            {images.length > 0 && (
              <Text style={styles.trayHint}>
                {t('import.tray.count', { count: images.length, max: MAX_IMAGES })}
              </Text>
            )}
          </View>
        )}

        {step === 'reconcile' && (
          <View>
            <StepHeader
              eyebrow={t('import.step.reconcile')}
              title={t('import.reconcile.title')}
              body={t('import.reconcile.body')}
            />
            {reconcileResult.entries.map((entry) => (
              <View key={entry.name} style={styles.reconcileRow}>
                <Text style={styles.reconcileName}>{entry.name}</Text>
                <View style={styles.chipRow}>
                  {members.map((m) => {
                    const active = entry.memberId === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        onPress={() =>
                          setOverrides((prev) => ({ ...prev, [entry.name]: m.id }))
                        }
                      >
                        <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                          {m.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.chip, entry.memberId == null && styles.chipActive]}
                    accessibilityRole="button"
                    onPress={() => setOverrides((prev) => ({ ...prev, [entry.name]: null }))}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        entry.memberId == null && styles.chipLabelActive,
                      ]}
                    >
                      {t('import.reconcile.newMember')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {step === 'review' && (
          <View>
            <StepHeader
              eyebrow={t('import.step.review')}
              title={t('import.review.title')}
              body={t('import.review.body')}
            />
            {review.currencyMismatch && (
              <Text style={styles.errorBanner}>
                {t('import.review.currencyMismatch', {
                  group: group?.currency ?? '',
                  extracted: extractedCurrency,
                })}
              </Text>
            )}
            {review.sortedRows.map((r) => {
              const v = review.rowValidity.find((x) => x.key === r.key);
              const owesYou = r.direction === 'owes_you';
              const currency = group?.currency ?? extractedCurrency;
              return (
                <View key={r.key} style={styles.reviewCard}>
                  <View style={styles.reviewRowTop}>
                    <Text style={styles.standingName}>{r.name}</Text>
                    <MoneyText
                      style={[styles.standingAmount, owesYou ? styles.amountOwed : styles.amountOwe]}
                      value={formatMinorUnits(decimalToMinor(r.amount), currency)}
                    />
                  </View>
                  <Text style={styles.standingLabel}>
                    {owesYou
                      ? t('import.review.owesYou', { name: r.name })
                      : t('import.review.youOwe', { name: r.name })}
                  </Text>
                  {v && !v.amountValid && (
                    <Text style={styles.rowWarn}>{t('import.review.badAmount')}</Text>
                  )}
                  {v && !v.directionValid && (
                    <Text style={styles.rowWarn}>{t('import.review.badDirection')}</Text>
                  )}
                </View>
              );
            })}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('import.review.owedToYouTotal')}</Text>
              <MoneyText
                style={[styles.totalValue, styles.amountOwed]}
                value={formatMinorUnits(review.owedToYouMinor, group?.currency ?? extractedCurrency)}
              />
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('import.review.youOweTotal')}</Text>
              <MoneyText
                style={[styles.totalValue, styles.amountOwe]}
                value={formatMinorUnits(review.youOweMinor, group?.currency ?? extractedCurrency)}
              />
            </View>
          </View>
        )}

        {step === 'importing' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.vermillion} />
            <Text style={styles.guidanceBody}>{t('import.progress.committing')}</Text>
          </View>
        )}
      </ScrollView>

      {step !== 'importing' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s3 }]}>
          {step === 'capture' && (
            <Button
              onPress={runExtract}
              disabled={images.length === 0 || busy}
            >
              {busy ? t('import.progress.extracting') : t('import.capture.extract')}
            </Button>
          )}
          {step === 'reconcile' && (
            <Button onPress={() => setStep('review')} disabled={!reconcileResult.canConfirm}>
              {t('import.reconcile.continue')}
            </Button>
          )}
          {step === 'review' && (
            <Button onPress={runCommit} disabled={!review.canConfirm}>
              {t('import.review.import', { count: review.sortedRows.length })}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  center: { alignItems: 'center', paddingVertical: spacing.s7, gap: spacing.s3 },
  intro: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    padding: spacing.s4,
  },
  header: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s2,
  },
  headerEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.5,
    color: colors.graphite,
    lineHeight: 38,
  },
  headerBody: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    lineHeight: 24,
    marginTop: spacing.s2,
  },
  guidanceBody: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    lineHeight: 24,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s2,
  },
  tray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 84,
    height: 110,
    borderRadius: radii.md,
    backgroundColor: colors.bone,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.graphite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 84,
    height: 110,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  reconcileRow: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    backgroundColor: colors.bone,
    borderRadius: radii.md,
    padding: spacing.s4,
  },
  reconcileName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    marginBottom: spacing.s2,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s3,
  },
  chipActive: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  chipLabel: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead },
  chipLabelActive: { color: colors.fgOnAccent },
  reviewCard: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    backgroundColor: colors.bone,
    borderRadius: radii.md,
    padding: spacing.s4,
  },
  reviewRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  standingName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    flexShrink: 1,
    marginRight: spacing.s3,
  },
  standingAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
  },
  standingLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: spacing.s1,
  },
  amountOwed: { color: colors.moss },
  amountOwe: { color: colors.brick },
  rowWarn: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.brick,
    marginTop: spacing.s1,
  },
  errorBanner: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s3,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.s4,
    marginTop: spacing.s5,
  },
  totalLabel: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead },
  totalValue: { fontFamily: fontMono, fontSize: fontSize.displayS, color: colors.graphite },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    backgroundColor: colors.paper,
  },
});
