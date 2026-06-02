import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ActionSheet, openNativeActionSheet } from '@/components/ActionSheet';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAccount } from '@/lib/accounts';
import { apiFor, GroupDetail, GroupMember } from '@/lib/api';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { formatLeaveReasons } from '@/lib/group-settings';
import { formatMinorUnits, formatDate } from '@/lib/i18n';
import { initialsOf, makeNameShortener } from '@/lib/name';
import {
  colors,
  fontDisplay,
  fontBody,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

export default function GroupMembersScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const account = useAccount(serverUrl);
  const user = account?.user ?? null;
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [kickSheetFor, setKickSheetFor] = useState<GroupMember | null>(null);

  const reload = useCallback(() => {
    if (!id || !serverUrl) return;
    api
      .getGroup(id)
      .then(setGroup)
      .catch(() => {});
  }, [id, serverUrl, api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const members: GroupMember[] = group?.members ?? [];
  const shorten = useMemo(
    () => makeNameShortener(members.map((m) => m.name)),
    [members],
  );
  const myMember = members.find((m) => m.user_id === user?.id) ?? null;
  const isOwner = myMember?.role === 'owner';

  // Pre-flight the kick attempt via can-leave so we surface unsettled balances
  // without first triggering a 409 server-side. The endpoint is open to any
  // member — the owner-only gate lives client-side on the kick CTA.
  async function attemptKick(target: GroupMember) {
    if (!group) return;
    try {
      const probe = await api.getMemberCanLeave(group.id, target.id);
      if (!probe.ok) {
        const fmt = formatLeaveReasons(probe.reasons as any);
        const lines = fmt.rows.map((r) =>
          t('kickMember.blocked.row', {
            amount: formatMinorUnits(r.minor_units, r.currency),
            currency: r.currency,
          }),
        );
        showAlert({
          title: t('kickMember.blocked.title', { name: target.name }),
          message: [t('kickMember.blocked.body', { name: target.name }), ...lines].join('\n'),
        });
        return;
      }
    } catch {
      // Fall through — let the server decide.
    }
    const result = await showAlert({
      title: t('kickMember.confirm.title', { name: target.name }),
      message: t('kickMember.confirm.body', { name: target.name }),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'remove', label: t('kickMember.remove'), style: 'destructive' },
      ],
    });
    if (result === 'remove') {
      try {
        await api.removeMember(group.id, target.id);
        reload();
      } catch (e: any) {
        showAlert({ title: t('kickMember.error'), message: e?.message || String(e) });
      }
    }
  }

  function onRowPress(target: GroupMember) {
    // Swallow the press if a popup just closed — the tap-through bug where
    // backdrop dismissal of one row's sheet immediately opens another row's
    // sheet. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    if (!isOwner) return;
    // Owners can't kick themselves or other owners (P0 — single-owner model).
    if (target.user_id === user?.id) return;
    if (target.role === 'owner') return;

    const options = [
      {
        label: t('kickMember.cta'),
        destructive: true,
        onPress: () => attemptKick(target),
      },
    ];
    if (openNativeActionSheet(target.name, options)) return;
    setKickSheetFor(target);
  }
  const sorted = [...members].sort((a, b) => {
    // You first, then alphabetical by name. Ghosts last.
    const aMe = a.user_id === user?.id ? 0 : 1;
    const bMe = b.user_id === user?.id ? 0 : 1;
    if (aMe !== bMe) return aMe - bMe;
    const aGhost = a.is_ghost ? 1 : 0;
    const bGhost = b.is_ghost ? 1 : 0;
    if (aGhost !== bGhost) return aGhost - bGhost;
    return a.name.localeCompare(b.name);
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s5 }}
      >
        <ContentContainer>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('members.eyebrow')}</Text>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            allowFontScaling
          >
            {(group?.name ?? t('common.dash')).replace(/\s+/g, ' ')}
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLabel}>
            {t('members.count', { count: members.length })}
          </Text>
        </View>
        <View style={styles.listRule} />

        {sorted.length === 0 ? (
          <EmptyState title={t('members.emptyTitle')} body={t('members.emptyBody')} />
        ) : (
          sorted.map((m) => {
            const isYou = m.user_id === user?.id;
            const isOwnerRow = m.role === 'owner';
            const canKick = !!isOwner && !isYou && !isOwnerRow;
            const RowComp: any = canKick ? TouchableOpacity : View;
            // Meta line precedence: ghost > joined+role(owner) > joined > role.
            let meta: string;
            if (m.is_ghost) {
              meta = t('members.ghost');
            } else if (m.joined_at) {
              const d = formatDate(m.joined_at);
              meta = isOwnerRow
                ? t('members.joinedWithRole', { date: d, role: t('members.roleOwner') })
                : t('members.joined', { date: d });
            } else {
              meta = isOwnerRow ? t('members.roleOwner') : t('members.roleUnknownJoin');
            }
            return (
              <RowComp
                key={m.id}
                style={styles.row}
                onPress={canKick ? () => onRowPress(m) : undefined}
                activeOpacity={canKick ? 0.7 : 1}
                accessibilityRole={canKick ? 'button' : undefined}
                accessibilityLabel={canKick ? t('kickMember.cta') : undefined}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.avatar, m.is_ghost && styles.avatarGhost]}>
                    <Text style={styles.avatarText}>{initialsOf(m.name)}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {shorten(m.name)}
                      {isYou ? ` · ${t('members.you')}` : ''}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                  </View>
                </View>
                {canKick && (
                  <Feather name="chevron-right" size={20} color={colors.lead} />
                )}
              </RowComp>
            );
          })
        )}
        </ContentContainer>
      </ScrollView>
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
        <ContentContainer style={styles.ctaInner}>
        <Button
          kind="secondary"
          onPress={() => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/invite`)}
          style={{ flex: 1 }}
        >
          {t('members.inviteCta')}
        </Button>
        <Button
          kind="primary"
          onPress={async () => {
            if (!group) return;
            try {
              const { invite_url: link } = await api.getInviteLink(id);
              await Share.share({
                message: t('members.shareMessage', { name: group.name, link }),
              });
            } catch {}
          }}
          disabled={!group}
          style={{ flex: 1 }}
        >
          {t('members.shareCta')}
        </Button>
        </ContentContainer>
      </View>
      <ActionSheet
        visible={!!kickSheetFor}
        onClose={() => setKickSheetFor(null)}
        title={kickSheetFor?.name}
        options={
          kickSheetFor
            ? [
                {
                  label: t('kickMember.cta'),
                  destructive: true,
                  onPress: () => {
                    const target = kickSheetFor;
                    setKickSheetFor(null);
                    if (target) attemptKick(target);
                  },
                },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s5,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    letterSpacing: -1,
    color: colors.graphite,
    lineHeight: 52,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingBottom: 6,
  },
  listHeaderLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  listHeaderRight: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  listRule: { height: 1.5, backgroundColor: colors.graphite, marginHorizontal: spacing.s5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  rowText: { flex: 1, flexShrink: 1, minWidth: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bone,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGhost: {
    borderStyle: 'dashed',
  },
  avatarText: {
    fontFamily: fontMonoMedium,
    fontSize: 14,
    color: colors.graphite,
  },
  rowName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.4,
    color: colors.graphite,
  },
  rowMeta: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    marginTop: 3,
  },
  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  ctaInner: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
});
