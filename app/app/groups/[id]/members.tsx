import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { getGroup, inviteDeepLink, GroupDetail, GroupMember } from '@/lib/api';
import { initialsOf } from '@/lib/name';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    getGroup(id)
      .then(setGroup)
      .catch(() => {});
  }, [id]);

  const members: GroupMember[] = group?.members ?? [];
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
        right={
          <IconButton
            icon="user-plus"
            onPress={() => router.push(`/groups/${id}/invite`)}
            label={t('groupDetail.inviteLabel')}
          />
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s5 }}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('members.eyebrow')}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {group?.name ?? t('common.dash')}
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLabel}>
            {t('members.count', { count: members.length })}
          </Text>
          <Text style={styles.listHeaderRight}>{t('members.role')}</Text>
        </View>
        <View style={styles.listRule} />

        {sorted.length === 0 ? (
          <EmptyState title={t('members.emptyTitle')} body={t('members.emptyBody')} />
        ) : (
          sorted.map((m) => {
            const isYou = m.user_id === user?.id;
            const role = m.role === 'owner' ? t('members.roleOwner') : t('members.roleMember');
            return (
              <View key={m.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.avatar, m.is_ghost && styles.avatarGhost]}>
                    <Text style={styles.avatarText}>{initialsOf(m.name)}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.name}
                      {isYou ? ` · ${t('members.you')}` : ''}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {m.is_ghost ? t('members.ghost') : m.email ?? t('common.dash')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rowRole}>{role}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
        <Button
          kind="secondary"
          onPress={() => router.push(`/groups/${id}/invite`)}
          style={{ flex: 1 }}
        >
          {t('members.inviteCta')}
        </Button>
        <Button
          kind="primary"
          onPress={async () => {
            if (!group) return;
            const link = inviteDeepLink(group.invite_token);
            try {
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  header: { paddingHorizontal: spacing.s5, paddingTop: spacing.s2, paddingBottom: spacing.s4 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.8,
    color: colors.graphite,
    lineHeight: 34,
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
    paddingVertical: 14,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowText: { flex: 1, flexShrink: 1 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    fontSize: 12,
    color: colors.graphite,
  },
  rowName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  rowMeta: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 2,
  },
  rowRole: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  ctaBar: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
});
