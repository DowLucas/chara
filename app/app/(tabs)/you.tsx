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
  useWindowDimensions,
} from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';
import { showAlert } from '@/lib/app-alert';
import { hapticWarning } from '@/lib/haptics';
import { userErrorMessage } from '@/lib/user-error';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
// Per-icon paths: the package root pulls every icon in all six weights into the bundle.
import type { Icon } from 'phosphor-react-native';
import { Archive } from 'phosphor-react-native/src/icons/Archive';
import { Bell } from 'phosphor-react-native/src/icons/Bell';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { ChatCircleText } from 'phosphor-react-native/src/icons/ChatCircleText';
import { Coins } from 'phosphor-react-native/src/icons/Coins';
import { DeviceMobile } from 'phosphor-react-native/src/icons/DeviceMobile';
import { FileText } from 'phosphor-react-native/src/icons/FileText';
import { Globe } from 'phosphor-react-native/src/icons/Globe';
import { Info } from 'phosphor-react-native/src/icons/Info';
import { Moon } from 'phosphor-react-native/src/icons/Moon';
import { Scroll } from 'phosphor-react-native/src/icons/Scroll';
import { ShareNetwork } from 'phosphor-react-native/src/icons/ShareNetwork';
import { ShieldCheck } from 'phosphor-react-native/src/icons/ShieldCheck';
import { SignOut } from 'phosphor-react-native/src/icons/SignOut';
import { Star } from 'phosphor-react-native/src/icons/Star';
import { Sun } from 'phosphor-react-native/src/icons/Sun';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { UsersThree } from 'phosphor-react-native/src/icons/UsersThree';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { getLocales } from 'expo-localization';
import { SceneHeader } from '@/components/profile/SceneHeader';
import { SettingTile } from '@/components/profile/SettingTile';
import { contactLine, tileLayoutFor } from '@/lib/profile-scene';
import { ContentContainer } from '@/components/ContentContainer';
import { useResponsive } from '@/lib/use-responsive';
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
import { useAccounts, useDefaultAccount } from '@/lib/accounts';
import { resetAllAccounts } from '@/lib/accounts-store';
import { FLAG_ONBOARDING_COMPLETE, clearFlag } from '@/lib/storage';
import { initialsOf } from '@/lib/name';
import { isPopupJustClosed } from '@/lib/popup-guard';
import {
  apiFor,
  aggregateBulkDeleteResults,
  avatarImageSourceOn,
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
  getPreferredLanguage,
  setPreferredLanguage,
} from '@/lib/preferences';
import { storeReviewUrl, type StorePlatform } from '@/lib/store-url';
import { fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { makeStyles, useColors, useTheme } from '@/lib/theme-context';
import { APPEARANCE_PREFERENCES, type AppearancePreference } from '@/lib/appearance';
import { currentPeriod } from '@/lib/summary-view';
import { useFeatureServerUrl, useSummaryServerUrl } from '@/lib/use-feature-server';

// TODO: real App Store ID once the app is published
// App Store numeric ID (ascAppId in eas.json). Powers the "Rate us" deep link.
const APP_STORE_ID: string | null = '6773089720';
const ANDROID_PACKAGE = Application.applicationId ?? 'app.chara';

// App version footer. Prefer the app-config marketing version — it's our
// source of truth and correct in every environment. `nativeApplicationVersion`
// is NOT used as the primary: inside Expo Go it returns Expo Go's own version
// (e.g. 54.0.6), not this app's. The native build number is only meaningful in
// a real build, so it's hidden in Expo Go (executionEnvironment 'storeClient').
const APP_VERSION = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '';
const APP_BUILD =
  Constants.executionEnvironment === 'storeClient' ? null : Application.nativeBuildVersion;
const VERSION_LABEL = APP_VERSION
  ? `Chara ${APP_VERSION}${APP_BUILD ? ` (${APP_BUILD})` : ''}`
  : '';

export default function YouScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut, refreshUser } = useAuth();
  const { accounts, removeAccount, setHomeCurrency } = useAccounts();
  // The profile avatar lives on the default account's own server, and its
  // bearer token must be read synchronously: an async token meant the first
  // render fired an unauthenticated <Image> that 401'd before the token
  // landed. See Avatar.helpers for why that failure used to be permanent.
  const defaultAccount = useDefaultAccount();
  // Live feature read, not the cached account.instance blob — that is only
  // written at sign-in, so an already-signed-in user would never see these
  // rows. Same pattern as the ocr / voice / settle-reminder gates.
  const summaryServer = useSummaryServerUrl();
  // Hosted-only: a self-hosted instance has no one to route a Chara bug
  // report to, so the row is absent rather than a dead end.
  const feedbackServer = useFeatureServerUrl('feedback');
  const { homeCurrency, isExplicit: homeCurrencyExplicit } = useHomeCurrency();
  const accountCount = accounts.length;
  const hasMultipleAccounts = accountCount >= 2;
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);
  const [appearanceSheetVisible, setAppearanceSheetVisible] = useState(false);
  const { preference: appearance, setPreference: setAppearance, scheme } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const { contentMaxWidth } = useResponsive();
  const tileLayout = tileLayoutFor(fontScale, Math.min(width, contentMaxWidth ?? width));
  // The scene header is night in both themes, so the status bar is light
  // while this tab is on screen and goes back to the theme's on blur.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
    }, [scheme]),
  );
  const appearanceLabel = (p: AppearancePreference) =>
    p === 'light'
      ? t('you.appearanceLight')
      : p === 'dark'
        ? t('you.appearanceDark')
        : t('you.appearanceSystem');
  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const [storedLanguage, setStoredLanguage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async () => {
    const lang = await getPreferredLanguage();
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
  const avatarSource = defaultAccount
    ? avatarImageSourceOn(defaultAccount.serverUrl, user)
    : null;
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
        showAlert({
          title: t('common.error'),
          message: userErrorMessage(e, t('common.requestFailed')),
        });
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
      showAlert({
        title: t('common.error'),
        message: userErrorMessage(e, t('common.requestFailed')),
      });
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

  function handleAccountsRowPress() {
    router.push('/settings/accounts');
  }

  // Development only — rendered in the __DEV__ tools block below.
  async function handleDevResetAccounts() {
    if (isPopupJustClosed()) return;
    const result = await showAlert({
      title: 'Reset all accounts?',
      message:
        'Removes every signed-in account on this device and returns to the first-run onboarding flow. Server data is untouched. Development builds only.',
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'reset', label: 'Reset', style: 'destructive' },
      ],
    });
    if (result !== 'reset') return;
    await resetAllAccounts();
    // Also clear the first-run state, so this reproduces a fresh install
    // rather than dropping onto sign-in: the gate routes signed-out users to
    // /welcome only while `onboarding_complete` is unset.
    await clearFlag(FLAG_ONBOARDING_COMPLETE).catch(() => {});
    router.replace('/welcome');
  }

  async function handleSignOutPress() {
    if (signingOut) return;
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
    // The fan-out below is one network round trip per linked server, so it can
    // run for a while. Without a busy flag the row stays tappable and a second
    // tap starts a second pass over a list the first one is mutating.
    setSigningOut(true);
    try {
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
    } finally {
      setSigningOut(false);
    }
    hapticWarning();
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
      showAlert({
        title: t('common.error'),
        message: userErrorMessage(e, t('common.requestFailed')),
      });
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHeader
          title={t('you.title')}
          topInset={insets.top}
        />
        <View style={styles.body}>
        <ContentContainer>
        <View style={styles.profile}>
          <TouchableOpacity
            onPress={openAvatarSheet}
            activeOpacity={0.7}
            disabled={uploading}
            accessibilityLabel={t('you.avatar.chooseTitle')}
            style={styles.avatarWrap}
          >
            <Avatar
              initials={initials}
              size="md"
              style={styles.avatar}
              textStyle={styles.avatarInitials}
              source={avatarSource}
            />
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={14} color={colors.paper} />
            </View>
          </TouchableOpacity>
          {uploading && (
            <Text style={styles.uploadingText}>{t('you.avatar.uploading')}</Text>
          )}
          {/* A print caption: name, a hairline, then one contact line. */}
          <Text style={styles.name}>{user?.name ?? t('common.dash')}</Text>
          <View style={styles.captionRule} />
          <Text style={styles.contact}>{contactLine(user?.email, user?.phone) ?? t('common.dash')}</Text>
          <TouchableOpacity
            style={styles.editLink}
            onPress={() => router.push('/onboarding/name')}
            activeOpacity={0.7}
            accessibilityRole="link"
            hitSlop={8}
          >
            <Text style={styles.editLinkLabel}>{t('you.editNameAndPhone')}</Text>
            <CaretRight size={14} color={colors.vermillionInk} />
          </TouchableOpacity>
        </View>

        {/* The three settings people change most, as large tiles. Each opens
            its picker sheet. */}
        <View style={[styles.tiles, tileLayout === 'rows' && styles.tilesRows]}>
          <SettingTile
            layout={tileLayout}
            icon={appearance === 'light' ? Sun : appearance === 'dark' ? Moon : DeviceMobile}
            label={t('you.appearance')}
            value={appearanceLabel(appearance)}
            onPress={() => setAppearanceSheetVisible(true)}
          />
          <SettingTile
            layout={tileLayout}
            icon={Globe}
            label={t('you.language')}
            value={languageRowValue}
            onPress={() => setLanguageSheetVisible(true)}
          />
          <SettingTile
            layout={tileLayout}
            icon={Coins}
            label={t('you.currencyTile')}
            value={
              homeCurrencyExplicit
                ? homeCurrency
                : `${t('you.languageAuto')} · ${homeCurrency}`
            }
            onPress={() => setCurrencySheetVisible(true)}
          />
        </View>

        <Text style={[styles.sectionEyebrow, styles.firstSectionEyebrow]}>
          {t('you.settingsEyebrow')}
        </Text>
        <View style={styles.list}>
          <NavRow
            icon={UsersThree}
            label={t('accounts.title')}
            value={t('you.accountsRowCount', { count: accountCount })}
            onPress={handleAccountsRowPress}
          />
          <NavRow
            icon={Archive}
            label={t('you.archivedGroups')}
            onPress={() => router.push('/settings/archived-groups')}
          />
          {/* Hosted-only, so the row is gated on the server actually
              advertising the feature rather than shown-then-404. Opens the
              month in progress; the push opens the month it is about. */}
          {summaryServer && (
            <NavRow
              icon={CalendarBlank}
              label={t('you.monthlySummary')}
              onPress={() =>
                router.push(
                  `/summary/${encodeURIComponent(summaryServer)}/${currentPeriod()}`,
                )
              }
            />
          )}
          {summaryServer && (
            <NavRow
              icon={Bell}
              label={t('notifications.title')}
              onPress={() => router.push('/settings/notifications')}
            />
          )}
          <NavRow icon={ShieldCheck} label={t('privacy.title')} onPress={() => router.push('/settings/privacy')} />
          {feedbackServer && (
            <NavRow
              icon={ChatCircleText}
              label={t('you.sendFeedback')}
              // Hand over the server this row already resolved, so the
              // screen doesn't probe (and risk failing) a second time.
              onPress={() =>
                router.push(
                  `/settings/feedback?server=${encodeURIComponent(feedbackServer)}`,
                )
              }
            />
          )}
          <NavRow icon={Info} label={t('you.about')} onPress={() => router.push('/settings/about')} />
          <NavRow icon={ShareNetwork} label={t('you.tellFriend')} onPress={handleTellFriend} />
          <NavRow icon={Star} label={rateLabel} onPress={handleRate} />
        </View>

        <Text style={[styles.sectionEyebrow, { marginTop: spacing.s5 }]}>
          {t('legal.eyebrow')}
        </Text>
        <View style={styles.list}>
          <NavRow
            icon={FileText}
            label={t('legal.privacyPolicy')}
            onPress={() => {
              void Linking.openURL('https://getchara.dowtech.dev/privacy').catch(() => {});
            }}
          />
          <NavRow
            icon={Scroll}
            label={t('legal.termsOfService')}
            onPress={() => {
              void Linking.openURL('https://getchara.dowtech.dev/terms').catch(() => {});
            }}
          />
        </View>

        {__DEV__ && (
          <>
            <Text style={[styles.sectionEyebrow, { marginTop: spacing.s5 }]}>
              {t('you.devEyebrow')}
            </Text>
            <View style={styles.list}>
              <NavRow
                label={t('you.replayOnboarding')}
                onPress={() => router.push('/welcome')}
              />
              {/* Remove Account refuses when a server's balance check fails,
                  so an account pointing at a local backend that no longer
                  exists can't be removed normally — and on iOS the blob is
                  Keychain-backed, surviving a reinstall. This wipes it
                  outright. Hardcoded English: never ships to users. */}
              <NavRow
                label="DEV: reset all accounts"
                onPress={handleDevResetAccounts}
                destructive
                showChevron={false}
              />
            </View>
          </>
        )}

        <Text style={[styles.sectionEyebrow, { marginTop: spacing.s5 }]}>
          {t('account.eyebrow')}
        </Text>
        <View style={styles.list}>
          <NavRow
            icon={SignOut}
            label={hasMultipleAccounts ? t('you.signOutAll') : t('you.signOut')}
            onPress={handleSignOutPress}
            destructive
            showChevron={false}
            disabled={signingOut}
          />
          {accountCount > 0 && (
            <NavRow
              icon={Trash}
              label={t('account.deleteAll.title')}
              value={t('account.deleteAll.rowValue')}
              onPress={handleDeleteFromAll}
              destructive
              showChevron={false}
            />
          )}
        </View>

        {VERSION_LABEL ? (
          <Text style={styles.versionText} accessibilityLabel={VERSION_LABEL}>
            {VERSION_LABEL}
          </Text>
        ) : null}
        </ContentContainer>
        </View>
      </ScrollView>
      <ActionSheet
        visible={avatarSheetVisible}
        onClose={() => setAvatarSheetVisible(false)}
        title={t('you.avatar.chooseTitle')}
        options={avatarSheetOptions}
      />
      <ActionSheet
        visible={appearanceSheetVisible}
        onClose={() => setAppearanceSheetVisible(false)}
        title={t('you.appearance')}
        options={APPEARANCE_PREFERENCES.map((p) => ({
          label: appearanceLabel(p),
          onPress: () => setAppearance(p),
        }))}
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
  icon: RowIcon,
  label,
  value,
  onPress,
  destructive,
  showChevron = true,
  disabled = false,
}: {
  icon?: Icon;
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const labelColor = destructive ? colors.brick : colors.graphite;
  return (
    <TouchableOpacity
      style={[styles.row, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}>
      <View style={styles.rowLeft}>
        {RowIcon && <RowIcon size={20} color={labelColor} />}
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {showChevron && (
          <Feather
            name="chevron-right"
            size={18}
            color={destructive ? colors.brick : colors.lead}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.paper },
  versionText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: spacing.s6,
  },
  scroll: { paddingBottom: spacing.s7 },
  body: { paddingHorizontal: spacing.s5 },
  profile: { alignItems: 'center' },
  // The avatar sits on a paper ring that overlaps the scene's waterline.
  avatarWrap: {
    position: 'relative',
    marginTop: -56,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarInitials: { fontSize: fontSize.displayM },
  tiles: { flexDirection: 'row', gap: spacing.s2, marginTop: spacing.s6 },
  tilesRows: { flexDirection: 'column' },
  avatarBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: fontSize.displayM,
    letterSpacing: -0.5,
    color: colors.graphite,
    marginTop: spacing.s3,
  },
  captionRule: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.s7,
    height: 1,
    backgroundColor: colors.ruleSoft,
    marginTop: spacing.s3,
  },
  contact: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    marginTop: spacing.s3,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.s3,
    paddingVertical: spacing.s2,
  },
  editLinkLabel: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.vermillionInk },
  sectionEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  firstSectionEyebrow: {
    marginTop: spacing.s6,
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
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  rowValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
}));
