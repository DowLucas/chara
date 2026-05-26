import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Linking,
  ScrollView,
  Platform,
  Switch,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import * as ImagePicker from 'expo-image-picker';
import { getLocales } from 'expo-localization';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { ActionSheet, openNativeActionSheet, ActionSheetOption } from '@/components/ActionSheet';
import { LanguagePicker } from '@/components/LanguagePicker';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { useHomeCurrency } from '@/lib/use-home-currency';
import { useTranslation } from 'react-i18next';
import i18n, {
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { useAccounts } from '@/lib/accounts';
import { initialsOf } from '@/lib/name';
import { isPopupJustClosed } from '@/lib/popup-guard';
import {
  apiFor,
  aggregateBulkDeleteResults,
  authToken,
  avatarImageSource,
  AvatarMimeType,
  ApiError,
  deleteAvatar as apiDeleteAvatar,
  uploadAvatar as apiUploadAvatar,
} from '@/lib/api';
import { unregisterForAccount } from '@/lib/push';
import { hasOpenBalance, partitionBulkBalanceCheck } from '@/lib/balance-utils';
import { displayHostFor } from '@/lib/server-url';

import {
  clearPreferredLanguage,
  getConfirmWithFaceId,
  getPreferredLanguage,
  hasSecurityCode,
  setConfirmWithFaceId,
  setPreferredLanguage,
} from '@/lib/preferences';
import { storeReviewUrl, type StorePlatform } from '@/lib/store-url';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

// TODO: real App Store ID once the app is published
const APP_STORE_ID: string | null = null;
const ANDROID_PACKAGE = Application.applicationId ?? 'app.chara';

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut, refreshUser } = useAuth();
  const { accounts, removeAccount, setHomeCurrency } = useAccounts();
  const { homeCurrency, isExplicit: homeCurrencyExplicit } = useHomeCurrency();
  const accountCount = accounts.length;
  const hasMultipleAccounts = accountCount >= 2;
  const [pinSet, setPinSet] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);
  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const [storedLanguage, setStoredLanguage] = useState<string | null>(null);
  const [avatarToken, setAvatarToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setAvatarToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const refresh = useCallback(async () => {
    const [has, fid, compat, enrolled, lang] = await Promise.all([
      hasSecurityCode(),
      getConfirmWithFaceId(),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      getPreferredLanguage(),
    ]);
    setPinSet(has);
    setFaceIdEnabled(fid);
    setBiometricAvailable(compat && enrolled);
    setStoredLanguage(lang);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initials = initialsOf(user?.name);
  const avatarSource = avatarImageSource(user, avatarToken);
  const hasServerAvatar = !!user?.avatar_object_url;

  function inferAvatarMime(asset: ImagePicker.ImagePickerAsset): AvatarMimeType {
    const m = (asset as { mimeType?: string }).mimeType?.toLowerCase();
    if (m === 'image/png') return 'image/png';
    if (m === 'image/webp') return 'image/webp';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
    // allowsEditing re-encodes to JPEG on both platforms; safe default.
    return 'image/jpeg';
  }

  async function handlePickedAsset(asset: ImagePicker.ImagePickerAsset | undefined) {
    if (!asset?.base64) return;
    const mime = inferAvatarMime(asset);
    setUploading(true);
    try {
      await apiUploadAvatar(asset.base64, mime);
      await refreshUser();
    } catch (e) {
      if (e instanceof ApiError && e.status === 413) {
        showAlert({ title: t('you.avatar.tooLargeTitle'), message: t('you.avatar.tooLargeBody') });
      } else {
        showAlert({ title: t('common.error'), message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setUploading(false);
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: t('you.avatar.permissionTitle'), message: t('you.avatar.permissionBody') });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    await handlePickedAsset(picked.assets?.[0]);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: t('you.avatar.permissionTitle'), message: t('you.avatar.permissionBody') });
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    await handlePickedAsset(picked.assets?.[0]);
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await apiDeleteAvatar();
      await refreshUser();
    } catch (e) {
      showAlert({ title: t('common.error'), message: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  }

  function openAvatarSheet() {
    // Swallow the press if a popup was just dismissed in the same gesture.
    // See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    const options: ActionSheetOption[] = [
      { label: t('you.avatar.choosePhoto'), onPress: pickFromLibrary },
      { label: t('you.avatar.takePhoto'), onPress: takePhoto },
    ];
    if (hasServerAvatar) {
      options.push({ label: t('you.avatar.remove'), onPress: removeAvatar, destructive: true });
    }
    if (openNativeActionSheet(t('you.avatar.chooseTitle'), options)) return;
    setAvatarSheetVisible(true);
  }

  const avatarSheetOptions: ActionSheetOption[] = [
    { label: t('you.avatar.choosePhoto'), onPress: pickFromLibrary },
    { label: t('you.avatar.takePhoto'), onPress: takePhoto },
    ...(hasServerAvatar
      ? [{ label: t('you.avatar.remove'), onPress: removeAvatar, destructive: true } as ActionSheetOption]
      : []),
  ];

  const currentLanguage = (() => {
    const raw = i18n.language ?? 'en';
    const lower = raw.toLowerCase();
    // Prefer exact-tag match (zh-Hans), fall back to bare code (en, sv, ...).
    const tagMatch = (SUPPORTED_LANGUAGES as readonly string[]).find((s) =>
      lower.startsWith(s.toLowerCase()),
    );
    return (tagMatch ?? lower.split('-')[0] ?? 'en') as SupportedLanguage;
  })();
  // Row value: explicit pick name, or "Automatic · <detected>" so the user
  // always sees what's active without having to open the picker.
  const languageRowValue = storedLanguage
    ? LANGUAGE_NATIVE_NAMES[storedLanguage as SupportedLanguage] ?? storedLanguage
    : `${t('you.languageAuto')} · ${LANGUAGE_NATIVE_NAMES[currentLanguage]}`;
  async function pickAutomatic() {
    await clearPreferredLanguage();
    setStoredLanguage(null);
    // Fall back to device-locale detection on next cold start. For this
    // session, switch immediately so the user sees the effect.
    const locales = getLocales();
    const supported = SUPPORTED_LANGUAGES as readonly string[];
    let code: string = 'en';
    for (const l of locales) {
      const tag = (l.languageTag ?? '').toLowerCase();
      const lc = (l.languageCode ?? '').toLowerCase();
      const tagMatch = supported.find((s) => tag.startsWith(s.toLowerCase()));
      if (tagMatch) {
        code = tagMatch;
        break;
      }
      if (supported.includes(lc)) {
        code = lc;
        break;
      }
    }
    i18n.changeLanguage(code);
  }
  async function pickLanguage(code: SupportedLanguage) {
    await setPreferredLanguage(code);
    setStoredLanguage(code);
    i18n.changeLanguage(code);
  }

  async function toggleFaceId(next: boolean) {
    if (next) {
      if (!biometricAvailable) {
        showAlert({ title: t('you.faceIdUnavailableTitle'), message: t('you.faceIdUnavailableBody') });
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('you.faceIdPrompt'),
      });
      if (!result.success) return;
    }
    await setConfirmWithFaceId(next);
    setFaceIdEnabled(next);
  }

  function handleAccountsRowPress() {
    router.push('/settings/accounts');
  }

  async function handleSignOutPress() {
    // Best-effort open-balance check. Unlike per-account Remove, sign-out
    // doesn't block — Lucas wants the user to always be able to sign out;
    // we just warn when there's an unsettled balance so it's not a surprise.
    const results = await Promise.allSettled(
      accounts.map(async (account) => ({
        account,
        balances: await apiFor(account.serverUrl).listMyBalances(),
      })),
    );
    const blocked = results
      .filter(
        (r): r is PromiseFulfilledResult<{ account: typeof accounts[number]; balances: Awaited<ReturnType<ReturnType<typeof apiFor>['listMyBalances']>> }> =>
          r.status === 'fulfilled',
      )
      .filter((r) => hasOpenBalance(r.value.balances))
      .map((r) => displayHostFor(r.value.account.serverUrl, t('common.mainServerLabel')));

    const hasWarning = blocked.length > 0;
    const title = hasWarning
      ? t('accounts.signOutAllWarnOpenBalanceTitle')
      : hasMultipleAccounts
        ? t('accounts.signOutAllConfirmTitle')
        : t('accounts.signOutConfirmTitle');
    const message = hasWarning
      ? t('accounts.signOutAllWarnOpenBalanceBody', { hosts: blocked.join(', ') })
      : hasMultipleAccounts
        ? t('accounts.signOutAllConfirmBody')
        : t('accounts.signOutConfirmBody');
    const confirmLabel = hasMultipleAccounts
      ? t('accounts.signOutAll')
      : t('you.signOut');

    const result = await showAlert({
      title,
      message,
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'signout', label: confirmLabel, style: 'destructive' },
      ],
    });
    if (result !== 'signout') return;

    if (!hasMultipleAccounts) {
      void signOut();
      return;
    }
    for (const account of accounts) {
      try {
        await apiFor(account.serverUrl).logout();
      } catch {
        /* best-effort */
      }
      // Spec §15: deregister push token before forgetting the account.
      await unregisterForAccount(account.serverUrl);
      await removeAccount(account.serverUrl);
    }
    router.replace('/(auth)/sign-in');
  }

  async function handleDeleteFromAll() {
    if (accounts.length === 0) return;

    // Pre-check open balances on every linked server. Per CLAUDE.md /
    // multi-server-accounts-design, destructive flows touching an account
    // must refuse upfront when there's a non-zero balance — and refuse on
    // check failure too (fail-safe: better to block than silently allow a
    // deletion we can't verify). Mirrors the per-account Remove flow in
    // settings/accounts.tsx.
    const checkUrls = accounts.map((a) => a.serverUrl);
    const checkResults = await Promise.allSettled(
      checkUrls.map((url) => apiFor(url).listMyBalances()),
    );
    const { blockedUrls, erroredUrls } = partitionBulkBalanceCheck(
      checkUrls,
      checkResults,
    );
    const mainLabel = t('common.mainServerLabel');
    // Apple 5.1.1(v): the user owns their account and must be able to delete
    // it. Open balances are a warning, not a hard gate — proceed with a
    // destructive-styled "Delete anyway" confirm.
    if (blockedUrls.length > 0) {
      const servers = blockedUrls.map((u) => displayHostFor(u, mainLabel)).join(', ');
      const warn = await showAlert({
        title: t('account.deleteAll.openBalanceWarnTitle'),
        message: t('account.deleteAll.openBalanceWarnBody', { servers }),
        buttons: [
          { key: 'cancel', label: t('account.deleteAll.openBalanceWarnCancel'), style: 'cancel' },
          { key: 'delete', label: t('account.deleteAll.openBalanceWarnConfirm'), style: 'destructive' },
        ],
      });
      if (warn !== 'delete') return;
    } else if (erroredUrls.length > 0) {
      const servers = erroredUrls.map((u) => displayHostFor(u, mainLabel)).join(', ');
      const warn = await showAlert({
        title: t('account.deleteAll.balanceCheckFailedTitle'),
        message: t('account.deleteAll.balanceCheckFailedBody', { servers }),
        buttons: [
          { key: 'cancel', label: t('account.deleteAll.openBalanceWarnCancel'), style: 'cancel' },
          { key: 'delete', label: t('account.deleteAll.openBalanceWarnConfirm'), style: 'destructive' },
        ],
      });
      if (warn !== 'delete') return;
    } else {
      const confirmed = await showAlert({
        title: t('account.deleteAll.confirmTitle'),
        message: t('account.deleteAll.confirmBody', { count: accounts.length }),
        buttons: [
          { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
          { key: 'delete', label: t('account.deleteAll.confirmCta'), style: 'destructive' },
        ],
      });
      if (confirmed !== 'delete') return;
    }

    // Fan out — Promise.allSettled so one slow / failing server doesn't
    // block the others (multi-server rules: never Promise.all across
    // accounts).
    const targets = accounts.map((a) => a.serverUrl);
    const settled = await Promise.allSettled(
      targets.map((url) => apiFor(url).deleteMe()),
    );
    const outcomes = aggregateBulkDeleteResults(targets, settled);

    // Drop every successfully-deleted account locally; leave blocked /
    // failed accounts in place so the user can retry.
    for (const o of outcomes) {
      if (o.status === 'deleted') {
        await unregisterForAccount(o.serverUrl);
        await removeAccount(o.serverUrl);
      }
    }

    const counts = {
      deleted: outcomes.filter((o) => o.status === 'deleted').length,
      blocked: outcomes.filter((o) => o.status === 'blocked').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
    };
    const lines = [
      t('account.deleteAll.summaryDeleted', { count: counts.deleted }),
      t('account.deleteAll.summaryBlocked', { count: counts.blocked }),
      t('account.deleteAll.summaryFailed', { count: counts.failed }),
    ].join('\n');
    await showAlert({
      title: t('account.deleteAll.summaryTitle'),
      message: lines,
    });

    if (counts.deleted === targets.length) {
      router.replace('/(auth)/sign-in');
    }
  }

  async function handleTellFriend() {
    try {
      await Share.share({
        message: t('you.shareMessage'),
      });
    } catch (e: any) {
      showAlert({ title: t('common.error'), message: e?.message || String(e) });
    }
  }

  async function handleRate() {
    const platform: StorePlatform =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const url = storeReviewUrl({
      platform,
      appStoreId: APP_STORE_ID,
      androidPackage: ANDROID_PACKAGE,
    });
    if (!url) {
      showAlert({ title: t('you.rateUnavailableTitle'), message: t('you.rateUnavailableBody') });
      return;
    }
    const can = await Linking.canOpenURL(url);
    if (!can && platform === 'ios') {
      await Linking.openURL(`https://apps.apple.com/app/id${APP_STORE_ID}`);
      return;
    }
    if (!can && platform === 'android') {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
      return;
    }
    await Linking.openURL(url);
  }

  const rateLabel =
    Platform.OS === 'ios'
      ? t('you.rateAppStore')
      : Platform.OS === 'android'
        ? t('you.ratePlayStore')
        : t('you.rateStore');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title={t('you.title')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profile}>
          <TouchableOpacity
            onPress={openAvatarSheet}
            activeOpacity={0.7}
            disabled={uploading}
            accessibilityLabel={t('you.avatar.chooseTitle')}
            style={styles.avatarWrap}
          >
            <Avatar initials={initials} size="md" style={styles.avatar} source={avatarSource} />
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={12} color={colors.paper} />
            </View>
          </TouchableOpacity>
          {uploading && (
            <Text style={styles.uploadingText}>{t('you.avatar.uploading')}</Text>
          )}
          <Text style={styles.name}>{user?.name ?? t('common.dash')}</Text>
          <Text style={styles.email}>{user?.email ?? t('common.dash')}</Text>
          <Text style={styles.email}>
            {t('you.phoneLabel')} · {user?.phone?.trim() || t('you.phoneMissing')}
          </Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/onboarding/name')}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnLabel}>{t('you.editProfile')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rule} />

        <Text style={styles.sectionEyebrow}>{t('you.settingsEyebrow')}</Text>
        <View style={styles.list}>
          <NavRow
            label={t('accounts.title')}
            value={
              hasMultipleAccounts
                ? t('you.accountsRowMany', { count: accountCount })
                : t('accounts.addAnother')
            }
            onPress={handleAccountsRowPress}
          />
          <NavRow
            label={pinSet ? t('you.changeSecurityCode') : t('you.createSecurityCode')}
            value={pinSet ? t('you.codeOn') : t('you.codeOff')}
            onPress={() => router.push('/settings/security-code')}
          />
          <NavRow
            label={t('you.language')}
            value={languageRowValue}
            onPress={() => setLanguageSheetVisible(true)}
          />
          <NavRow
            label={t('you.homeCurrency')}
            value={
              homeCurrencyExplicit
                ? homeCurrency
                : `${t('you.languageAuto')} · ${homeCurrency}`
            }
            onPress={() => setCurrencySheetVisible(true)}
          />
          <NavRow label={t('privacy.title')} onPress={() => router.push('/settings/privacy')} />
          <NavRow label={t('you.about')} onPress={() => router.push('/settings/about')} />
          <NavRow label={t('you.tellFriend')} onPress={handleTellFriend} />
          <NavRow label={rateLabel} onPress={handleRate} />
        </View>

        <Text style={[styles.sectionEyebrow, { marginTop: spacing.s5 }]}>
          {t('legal.eyebrow')}
        </Text>
        <View style={styles.list}>
          <NavRow
            label={t('legal.privacyPolicy')}
            onPress={() => {
              void Linking.openURL('https://getchara.lovable.app/privacy').catch(() => {});
            }}
          />
          <NavRow
            label={t('legal.termsOfService')}
            onPress={() => {
              void Linking.openURL('https://getchara.lovable.app/terms').catch(() => {});
            }}
          />
        </View>

        <View style={styles.rule} />

        {__DEV__ && (
          <View style={styles.devBlock}>
            <Text style={styles.devEyebrow}>{t('you.devEyebrow')}</Text>
            <TouchableOpacity
              style={styles.devRow}
              onPress={() => router.push('/onboarding')}
              activeOpacity={0.7}
            >
              <Text style={styles.devRowLabel}>{t('you.replayOnboarding')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOutPress} activeOpacity={0.7}>
          <Text style={styles.signOutText}>
            {hasMultipleAccounts ? t('you.signOutAll') : t('you.signOut')}
          </Text>
        </TouchableOpacity>

        {accountCount > 0 && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerEyebrow}>{t('account.deleteAll.eyebrow')}</Text>
            <View style={styles.list}>
              <TouchableOpacity
                style={styles.row}
                onPress={handleDeleteFromAll}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerRowLabel}>{t('account.deleteAll.title')}</Text>
                  <Text style={styles.rowHint}>{t('account.deleteAll.body')}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.brick} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      <ActionSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        title={t('you.avatar.chooseTitle')}
        options={avatarSheetOptions}
      />
      <LanguagePicker
        visible={languageSheetVisible}
        selected={(storedLanguage as SupportedLanguage | null) ?? null}
        onClose={() => setLanguageSheetVisible(false)}
        onSelectAutomatic={pickAutomatic}
        onSelect={pickLanguage}
      />
      <CurrencyPicker
        visible={currencySheetVisible}
        selected={homeCurrency}
        onClose={() => setCurrencySheetVisible(false)}
        onSelect={(code) => {
          void setHomeCurrency(code);
          setCurrencySheetVisible(false);
        }}
      />
    </View>
  );
}

function NavRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        <Feather name="chevron-right" size={18} color={colors.lead} />
      </View>
    </TouchableOpacity>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
  hint,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, disabled && { color: colors.lead }]}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.bone, true: colors.vermillion }}
        thumbColor={colors.paper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: spacing.s5, paddingTop: spacing.s5, paddingBottom: spacing.s7 },
  profile: { alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.graphite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.paper,
  },
  uploadingText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: spacing.s2,
  },
  name: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.5,
    color: colors.graphite,
    marginTop: spacing.s3,
  },
  email: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead, marginTop: 4 },
  editBtn: {
    marginTop: spacing.s4,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
  },
  editBtnLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  rule: {
    width: '100%',
    height: 1.5,
    backgroundColor: colors.graphite,
    marginVertical: spacing.s5,
  },
  sectionEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
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
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  rowValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  rowHint: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  signOutBtn: { paddingVertical: spacing.s3, paddingHorizontal: spacing.s5, alignSelf: 'center' },
  signOutText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
  },
  devBlock: { width: '100%', marginBottom: spacing.s4 },
  devEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  devRow: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  devRowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  dangerZone: {
    width: '100%',
    marginTop: spacing.s5,
  },
  dangerEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  dangerRowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.brick,
  },
});
