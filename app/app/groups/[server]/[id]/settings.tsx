/**
 * Group settings hub — owners control lifecycle, members view stats and
 * leave; everyone gets the invite shortcut.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md
 *       §"Settings screen".
 *
 * Sections, top to bottom:
 *   1. Header (group name, member count, lifecycle badge) — taps into edit.tsx
 *   2. Quick actions row — single "Invite people" chip
 *   3. Statistics card (live SQL per GET)
 *   4. Members — read-only roster + Manage / Leave CTA
 *   5. Danger zone — owner only
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { GroupColorPicker } from '@/components/GroupColorPicker';
import { Text } from '@/components/Text';
import { DeleteGroupModal } from '@/components/DeleteGroupModal';
import { lifecycleActionsForViewer } from '@/lib/group-settings';
import {
  apiFor,
  ApiError,
  authToken,
  avatarImageSource,
  Balance,
  CanLeaveResponse,
  GroupDetail,
  GroupStats,
} from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { formatLeaveReasons } from '@/lib/group-settings';
import { isPopupJustClosed } from '@/lib/popup-guard';
import type { DeleteGroupModalError } from '@/components/DeleteGroupModal.helpers';
import { formatDate, formatMinorUnits } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

interface DeleteApiError {
  code?: string;
  rows?: { currency: string; minor_units: number }[];
}

// The backend returns 409 with a JSON body for unsettled-balances refusals.
// ApiError stuffs the raw body string into `.message`; this parser extracts
// the structured payload so the modal can render the rows. Failures (e.g.
// non-JSON 5xx) collapse to an empty-rows error.
function parseDeleteError(e: unknown): DeleteGroupModalError {
  if (e instanceof ApiError) {
    try {
      const parsed = JSON.parse(e.message) as DeleteApiError;
      if (parsed?.code === 'group_has_unsettled_balances') {
        return { rows: parsed.rows ?? [] };
      }
    } catch {
      // fall through
    }
  }
  return { rows: [] };
}

export default function GroupSettingsScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const account = useAccount(serverUrl);
  const me = account?.user ?? null;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [canLeave, setCanLeave] = useState<CanLeaveResponse | null>(null);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteGroupModalError | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!id || !serverUrl) return;
    setLoadError(false);
    try {
      const g = await api.getGroup(id);
      setGroup(g);
      // Stats + can-leave are best-effort: one failing shouldn't blank the
      // header. We don't run can-leave for owners (the leave CTA is hidden
      // for them anyway).
      const myMember = g.members.find((m) => m.user_id === me?.id) ?? null;
      const isOwner = myMember?.role === 'owner';
      // Balances are owner-only (drives the Delete eligibility gate). Members
      // never see the danger zone, so we skip the fetch for them.
      const [statsResult, canLeaveResult, balancesResult] = await Promise.allSettled([
        api.getGroupStats(id),
        !isOwner && myMember ? api.getMemberCanLeave(id, myMember.id) : Promise.resolve(null),
        isOwner ? api.listGroupBalances(id) : Promise.resolve(null),
      ]);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (canLeaveResult.status === 'fulfilled') setCanLeave(canLeaveResult.value);
      if (balancesResult.status === 'fulfilled' && Array.isArray(balancesResult.value)) {
        setBalances(balancesResult.value);
      }
    } catch {
      setLoadError(true);
    }
  }, [id, serverUrl, me?.id, api]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myMember = group?.members.find((m) => m.user_id === me?.id) ?? null;
  const isOwner = myMember?.role === 'owner';
  const isLocked = !!group?.is_locked;
  const isArchived = !!group?.is_archived;

  async function handleLockToggle() {
    if (!group) return;
    try {
      const next = isLocked
        ? await api.unlockGroup(group.id)
        : await api.lockGroup(group.id);
      setGroup({ ...group, ...next });
    } catch (e: any) {
      showAlert({ title: t('groupSettings.dangerZone.lockError'), message: e?.message || String(e) });
    }
  }

  async function handleArchiveToggle() {
    if (!group) return;
    try {
      if (isArchived) {
        const next = await api.unarchiveGroup(group.id);
        setGroup({ ...group, ...next });
      } else {
        await api.archiveGroup(group.id);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      showAlert({
        title: isArchived
          ? t('groupSettings.dangerZone.unarchiveError')
          : t('groupSettings.dangerZone.archiveError'),
        message: e?.message || String(e),
      });
    }
  }

  function openDelete() {
    // Don't reopen the delete sheet if a popup was just dismissed in the
    // same gesture. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm(typedName: string) {
    if (!group) return;
    setDeleteSubmitting(true);
    try {
      await api.permanentDeleteGroup(group.id, typedName);
      setDeleteOpen(false);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setDeleteError(parseDeleteError(e));
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleLeave() {
    if (!group || !myMember) return;
    // Re-check at press time — the cached value could be stale.
    try {
      const probe = await api.getMemberCanLeave(group.id, myMember.id);
      setCanLeave(probe);
      if (!probe.ok) {
        showLeaveBlocked(probe);
        return;
      }
    } catch {
      // Fall through to the optimistic attempt — server is the source of truth.
    }
    const result = await showAlert({
      title: t('groupSettings.members.leaveConfirmTitle'),
      message: t('groupSettings.members.leaveConfirmBody', { name: group.name }),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'leave', label: t('groupSettings.members.leaveConfirm'), style: 'destructive' },
      ],
    });
    if (result === 'leave') {
      try {
        await api.removeMember(group.id, myMember.id);
        router.replace('/(tabs)');
      } catch (e: any) {
        showAlert({ title: t('groupSettings.members.leaveError'), message: e?.message || String(e) });
      }
    }
  }

  function showLeaveBlocked(probe: CanLeaveResponse) {
    const fmt = formatLeaveReasons(probe.reasons as any);
    const lines = fmt.rows.map((r) =>
      t('groupSettings.members.leaveBlocked.row', {
        amount: formatMinorUnits(r.minor_units, r.currency),
        currency: r.currency,
      }),
    );
    const body = [t(fmt.i18nKey), ...lines].join('\n');
    showAlert({ title: t('groupSettings.members.leaveBlocked.title'), message: body });
  }

  const sortedMembers = (group?.members ?? []).slice().sort((a, b) => {
    const aMe = a.user_id === me?.id ? 0 : 1;
    const bMe = b.user_id === me?.id ? 0 : 1;
    if (aMe !== bMe) return aMe - bMe;
    return a.name.localeCompare(b.name);
  });

  const lifecycle = lifecycleActionsForViewer({
    isOwner: !!isOwner,
    isLocked,
    isArchived,
  });

  // Pre-flight delete eligibility: any non-zero per-currency net balance
  // (in any member) blocks delete. The button is only enabled once the
  // owner has settled everyone up — surfacing the rule at tap-time instead
  // of letting the user type the group name only to hit a 409.
  const openBalances = (balances ?? []).filter((b) => parseFloat(b.net_balance) !== 0);
  // null balances = haven't loaded yet → optimistic-allow rather than
  // blink the row disabled on every screen mount.
  const deleteBlocked = balances !== null && openBalances.length > 0;

  async function confirmLockToggle() {
    if (isPopupJustClosed()) return;
    const titleKey = isLocked
      ? 'groupSettings.dangerZone.unlockConfirm.title'
      : 'groupSettings.dangerZone.lockConfirm.title';
    const bodyKey = isLocked
      ? 'groupSettings.dangerZone.unlockConfirm.body'
      : 'groupSettings.dangerZone.lockConfirm.body';
    const actionKey =
      lifecycle.lockLabelKey === 'lock'
        ? 'groupSettings.dangerZone.lock'
        : 'groupSettings.dangerZone.unlock';
    const confirmKey = lifecycle.lockLabelKey === 'lock' ? 'lock' : 'unlock';
    const result = await showAlert({
      title: t(titleKey),
      message: t(bodyKey),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: confirmKey, label: t(actionKey), style: 'destructive' },
      ],
    });
    if (result === confirmKey) {
      handleLockToggle();
    }
  }

  async function confirmArchiveToggle() {
    if (isPopupJustClosed()) return;
    const titleKey = isArchived
      ? 'groupSettings.dangerZone.unarchiveConfirm.title'
      : 'groupSettings.dangerZone.archiveConfirm.title';
    const bodyKey = isArchived
      ? 'groupSettings.dangerZone.unarchiveConfirm.body'
      : 'groupSettings.dangerZone.archiveConfirm.body';
    const actionKey =
      lifecycle.archiveLabelKey === 'archive'
        ? 'groupSettings.dangerZone.archive'
        : 'groupSettings.dangerZone.unarchive';
    const confirmKey = lifecycle.archiveLabelKey === 'archive' ? 'archive' : 'unarchive';
    const result = await showAlert({
      title: t(titleKey),
      message: t(bodyKey),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: confirmKey, label: t(actionKey), style: 'destructive' },
      ],
    });
    if (result === confirmKey) {
      handleArchiveToggle();
    }
  }

  const totalsByCurrency = stats?.totals_by_currency ?? [];
  const formattedTotal =
    totalsByCurrency.length === 0
      ? t('groupSettings.stats.noActivityYet')
      : totalsByCurrency
          .map((row) => formatMinorUnits(row.minor_units, row.currency))
          .join(' · ');
  const topSpenderName = stats?.top_spender?.display_name ?? '';
  const topSpenderAmount = stats?.top_spender
    ? formatMinorUnits(
        stats.top_spender.minor_units_paid,
        stats.top_spender.currency,
      )
    : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('groupSettings.title')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
      >
        {/* Header */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            group &&
            router.push(`/groups/${encodeURIComponent(serverUrl)}/${group.id}/edit`)
          }
          style={styles.header}
          accessibilityRole="button"
          accessibilityLabel={t('groupDetail.edit')}
        >
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>{t('groupDetail.eyebrow')}</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {group?.name ?? t('common.dash')}
            </Text>
            <Text style={styles.headerSub}>
              {t('groupSettings.header.memberCount', {
                count: group?.members.length ?? 0,
              })}
            </Text>
            <View style={styles.badgeRow}>
              {isLocked && (
                <Badge tone="brick" label={t('groupSettings.header.lockedBadge')} />
              )}
              {isArchived && (
                <Badge tone="lead" label={t('groupSettings.header.archivedBadge')} />
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={colors.lead} />
        </TouchableOpacity>

        {loadError && (
          <Text style={styles.loadError}>{t('groupSettings.loadError')}</Text>
        )}

        {/* INVITE section */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('groupSettings.quickActions.eyebrow')}
          </Text>
          <View style={styles.list}>
            <NavRow
              label={t('groupSettings.quickActions.invite')}
              icon="user-plus"
              onPress={() =>
                group &&
                router.push(`/groups/${encodeURIComponent(serverUrl)}/${group.id}/invite`)
              }
            />
            {group && (
              <GroupColorRow
                serverUrl={serverUrl}
                groupId={group.id}
                onPress={() => {
                  if (isPopupJustClosed()) return;
                  setColorPickerOpen(true);
                }}
              />
            )}
          </View>
        </View>

        {/* STATISTICS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>{t('groupSettings.stats.title')}</Text>
          <View style={styles.list}>
            {stats == null ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('common.loading')}</Text>
              </View>
            ) : (
              <>
                <InfoRow
                  label={t('groupSettings.stats.totalExpenses')}
                  value={String(stats.expense_count)}
                />
                <InfoRow
                  label={t('groupSettings.stats.totalSpent')}
                  value={formattedTotal}
                />
                {stats.top_spender && (
                  <TopSpenderRow
                    label={t('groupSettings.stats.topSpender')}
                    name={topSpenderName}
                    amount={topSpenderAmount}
                  />
                )}
                <InfoRow
                  label={t('groupSettings.stats.created')}
                  value={formatDate(stats.created_at)}
                />
              </>
            )}
          </View>
        </View>

        {/* MEMBERS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>{t('groupSettings.members.title')}</Text>
          <View style={styles.list}>
            {sortedMembers.slice(0, 6).map((m) => {
              const isYou = m.user_id === me?.id;
              const role =
                m.role === 'owner' ? t('members.roleOwner') : t('members.roleMember');
              return (
                <View key={m.id} style={styles.memberRow}>
                  <Avatar
                    initials={initialsOf(m.name)}
                    source={avatarImageSource(m, token)}
                  />
                  <View style={styles.memberText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name}
                      {isYou ? ` · ${t('members.you')}` : ''}
                    </Text>
                    <Text style={styles.memberMeta}>{role}</Text>
                  </View>
                </View>
              );
            })}
            <NavRow
              label={t('groupSettings.members.manageCta')}
              onPress={() =>
                group &&
                router.push(`/groups/${encodeURIComponent(serverUrl)}/${group.id}/members`)
              }
            />
            {!isOwner && myMember && (
              <NavRow
                label={t('groupSettings.members.leaveCta')}
                onPress={handleLeave}
                destructive
              />
            )}
          </View>
        </View>

        {/* DANGER ZONE — owner only */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={[styles.sectionEyebrow, styles.sectionEyebrowDanger]}>
              {t('groupSettings.dangerZone.title')}
            </Text>
            <View style={styles.list}>
              <NavRow
                label={t(
                  lifecycle.lockLabelKey === 'lock'
                    ? 'groupSettings.dangerZone.lock'
                    : 'groupSettings.dangerZone.unlock',
                )}
                onPress={confirmLockToggle}
              />
              <NavRow
                label={t(
                  lifecycle.archiveLabelKey === 'archive'
                    ? 'groupSettings.dangerZone.archive'
                    : 'groupSettings.dangerZone.unarchive',
                )}
                onPress={confirmArchiveToggle}
              />
              <NavRow
                label={t('groupSettings.dangerZone.delete')}
                onPress={openDelete}
                destructive
                disabled={deleteBlocked}
                hint={
                  deleteBlocked
                    ? t('groupSettings.dangerZone.deleteBlocked.shortHint', {
                        count: openBalances.length,
                      })
                    : undefined
                }
              />
            </View>
          </View>
        )}
      </ScrollView>

      <DeleteGroupModal
        visible={deleteOpen}
        groupName={group?.name ?? ''}
        submitting={deleteSubmitting}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
      />

      {group && (
        <GroupColorPicker
          visible={colorPickerOpen}
          onClose={() => setColorPickerOpen(false)}
          serverUrl={serverUrl}
          groupId={group.id}
        />
      )}
    </View>
  );
}

function GroupColorRow({
  serverUrl,
  groupId,
  onPress,
}: {
  serverUrl: string;
  groupId: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={styles.rowLeft}>
        <Feather name="droplet" size={16} color={colors.lead} />
        <Text style={styles.rowLabel}>{t('groupColor.row')}</Text>
      </View>
      <View style={styles.colorRowRight}>
        <GroupAvatar serverUrl={serverUrl} groupId={groupId} size={24} />
        <Feather name="chevron-right" size={18} color={colors.lead} />
      </View>
    </TouchableOpacity>
  );
}

function Badge({ tone, label }: { tone: 'brick' | 'lead'; label: string }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'brick' ? styles.badgeBrick : styles.badgeLead,
      ]}
    >
      <Text style={[styles.badgeLabel, tone === 'brick' && styles.badgeLabelBrick]}>
        {label}
      </Text>
    </View>
  );
}

function NavRow({
  label,
  icon,
  onPress,
  destructive,
  disabled,
  hint,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const tint = disabled
    ? colors.lead
    : destructive
      ? colors.brick
      : colors.lead;
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.rowLeft}>
        {icon && <Feather name={icon} size={16} color={tint} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              styles.rowLabel,
              destructive && !disabled && styles.rowLabelDestructive,
              disabled && styles.rowLabelDisabled,
            ]}
          >
            {label}
          </Text>
          {hint && <Text style={styles.rowHint}>{hint}</Text>}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={tint} />
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TopSpenderRow({
  label,
  name,
  amount,
}: {
  label: string;
  name: string;
  amount: string;
}) {
  return (
    <View style={styles.topSpenderRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.topSpenderValueRow}>
        <Text style={styles.topSpenderName} numberOfLines={1}>
          {name}
        </Text>
        <Text
          style={styles.topSpenderAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {amount}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    gap: spacing.s3,
  },
  headerTextWrap: { flex: 1, flexShrink: 1 },
  headerEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.8,
    color: colors.graphite,
    lineHeight: 34,
  },
  headerSub: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: spacing.s1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  badgeBrick: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  badgeLead: {
    backgroundColor: 'transparent',
    borderColor: colors.lead,
  },
  badgeLabel: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    color: colors.lead,
  },
  badgeLabelBrick: {
    color: colors.fgOnAccent,
  },
  loadError: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s3,
  },
  // Section (You-page convention)
  section: {
    paddingHorizontal: spacing.s5,
    marginTop: spacing.s5,
  },
  sectionEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  sectionEyebrowDanger: {
    color: colors.brick,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    gap: spacing.s3,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  rowLabelDestructive: {
    color: colors.brick,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowLabelDisabled: {
    color: colors.lead,
  },
  rowHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  colorRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  rowValue: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
  },
  topSpenderRow: {
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  topSpenderValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
    marginTop: spacing.s1,
  },
  topSpenderName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    flexShrink: 1,
  },
  topSpenderAmount: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  // Members section uses memberRow for avatar+name display, sharing list borders
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    gap: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  memberText: { flex: 1, minWidth: 0 },
  memberName: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  memberMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
