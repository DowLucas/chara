import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAccount, useAccounts } from '@/lib/accounts';
import {
  addAccount as storeAddAccount,
  clearStatus,
  type AccountInstanceInfo,
} from '@/lib/accounts-store';
import { apiFor, publicApi } from '@/lib/api';
import { legacyHostedUrl } from '@/lib/legacy-hosted-url';
import { parseInviteUrl } from '@/lib/invite-url';
import { parseInstanceInfo } from '@/lib/discovery';
import { registerForAccount } from '@/lib/push';
import * as analytics from '@/lib/analytics';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontSize,
  spacing,
} from '@/lib/theme';

type Mode = 'first-launch' | 'settings' | 'invite' | 'reauth';

/**
 * Map an auth-flow rejection to a short stable code for analytics. Kept
 * deliberately coarse — we only want enough buckets to tell drop-off apart
 * from breakage in the funnel.
 */
function classifyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      if (status === 401 || status === 403) return 'invalid_link';
      return `http_${status}`;
    }
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch')) {
    return 'network';
  }
  if (lower.includes('invalid') || lower.includes('expired')) return 'invalid_link';
  return 'unknown';
}

function decodeMaybe(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    server?: string;
    mode?: Mode;
    pendingInvite?: string;
  }>();

  const mode: Mode = (params.mode as Mode) ?? 'first-launch';
  const serverUrl = useMemo(() => {
    return decodeMaybe(params.server ?? null) ?? legacyHostedUrl();
  }, [params.server]);
  const pendingInviteUrl = useMemo(() => decodeMaybe(params.pendingInvite ?? null), [
    params.pendingInvite,
  ]);

  const account = useAccount(serverUrl);
  // Note: we call the store's addAccount directly (not the context shim) so we
  // can pass the optional `method` analytics arg. updateAccount still comes
  // from the context to stay consistent with the rest of the file.
  const { updateAccount } = useAccounts();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [authMethods, setAuthMethods] = useState<string[] | null>(
    account?.instance?.auth_methods ?? null,
  );

  // Fire `auth_screen_seen` once per mount. Modes other than first-launch
  // (settings/invite/reauth) all originate from inside the app, so they map
  // to `add_account`. Pure first-launch onboarding maps to `first_launch`.
  useEffect(() => {
    analytics.track('auth_screen_seen', {
      entry: mode === 'first-launch' ? 'first_launch' : 'add_account',
    });
    // We only want one event per mount; mode is read once for entry classification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For non-first-launch modes, opportunistically fetch auth_methods if we
  // don't already have them cached on the account. Failures are silently
  // ignored — the email path always works.
  useEffect(() => {
    if (mode === 'first-launch') return;
    if (authMethods !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await publicApi(serverUrl).instanceInfo();
        const parsed = parseInstanceInfo(raw);
        if (cancelled) return;
        if (parsed) setAuthMethods(parsed.auth_methods);
      } catch {
        /* swallow — leave authMethods null; email button always renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverUrl, mode, authMethods]);

  // For reauth on an existing account, keep authMethods synced with the
  // cached instance whenever it changes.
  useEffect(() => {
    if (account?.instance?.auth_methods) {
      setAuthMethods(account.instance.auth_methods);
    }
  }, [account?.instance?.auth_methods]);

  const showGoogle = authMethods === null
    ? mode === 'first-launch' // preserve legacy first-launch UI which always showed Google
    : authMethods.includes('google');

  async function handleMagicLink() {
    if (!email.trim()) return;
    analytics.track('auth_method_selected', { method: 'magic_link' });
    setLoading(true);
    try {
      const api = publicApi(serverUrl);
      const res = await api.requestMagicLink(email.trim());
      analytics.track('magic_link_requested');
      // Dev mode: server returns the raw token so we can sign in immediately.
      if (res.token) {
        const verify = await api.verifyMagicLink(res.token);
        await onTokenIssued(verify.token, 'magic_link');
        return;
      }
      setSent(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[chara] sign-in failed', msg);
      analytics.track('auth_error', {
        method: 'magic_link',
        code: classifyAuthError(e),
      });
      showAlert({ title: t('signIn.couldNotSend'), message: msg });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Common path after a magic-link verify yields a JWT. Splits by mode:
   *   - reauth: updateAccount in place, clear status, return.
   *   - other:  addAccount; optionally redeem pendingInvite; navigate home.
   */
  async function onTokenIssued(
    token: string,
    method?: 'magic_link' | 'google' | 'apple',
  ) {
    const now = new Date().toISOString();

    if (mode === 'reauth') {
      await updateAccount(serverUrl, { token, lastUsedAt: now });
      await clearStatus(serverUrl);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      return;
    }

    // Try to fetch /api/me + instance info for the new account. Failures
    // leave placeholders; the per-account refresh path heals them.
    let user: import('@/lib/accounts-store').AccountUser = {
      id: '',
      email: email.trim(),
      name: '',
      phone: '',
      avatar_url: null,
    };
    let instance: AccountInstanceInfo | null = null;

    try {
      // /api/me requires the token; build a transient client by writing the
      // account first, then refreshing.
      await storeAddAccount(
        {
          serverUrl,
          token,
          user,
          instance: account?.instance ?? null,
          addedAt: account?.addedAt ?? now,
          lastUsedAt: now,
        },
        method,
      );
      // Spec §15: register the device's Expo push token with the new server.
      // Best-effort — the user doesn't wait for this.
      void registerForAccount(serverUrl);
      try {
        user = await apiFor(serverUrl).getMe();
        await updateAccount(serverUrl, { user });
      } catch {
        /* leave placeholder */
      }
      try {
        const raw = await publicApi(serverUrl).instanceInfo();
        instance = parseInstanceInfo(raw);
        if (instance) await updateAccount(serverUrl, { instance });
      } catch {
        /* leave instance null */
      }
    } catch (e) {
      console.warn('[chara] addAccount failed', e);
    }

    // Optional invite redemption.
    if (pendingInviteUrl) {
      try {
        const parsed = parseInviteUrl(pendingInviteUrl);
        if ('token' in parsed) {
          const group = await apiFor(serverUrl).joinGroupByToken(parsed.token);
          router.replace(
            `/groups/${encodeURIComponent(serverUrl)}/${group.id}`,
          );
          return;
        }
      } catch (e) {
        console.warn('[chara] invite redemption failed', e);
        // Non-blocking: fall through to home; account stays added.
      }
    }

    router.replace('/(tabs)');
  }

  let host = serverUrl;
  try {
    host = new URL(serverUrl).host;
  } catch {
    /* keep */
  }

  const isReauth = mode === 'reauth';
  // Reauth eyebrow lives in the sibling-owned `accounts.*` namespace; fall
  // back gracefully if the sibling hasn't shipped that key yet.
  const eyebrow = isReauth
    ? t('accounts.reauthEyebrow', { defaultValue: 're-authenticate' })
    : t('signIn.eyebrow');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Wordmark */}
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmarkText}>{t('app.name')}</Text>
        <View style={styles.wordmarkRule} />
      </View>

      {/* Tagline */}
      <View style={styles.tagline}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.headline}>{t('signIn.headline')}</Text>
      </View>

      {/* Server host (visible whenever a non-default server is in play). */}
      {(mode !== 'first-launch' || params.server) && (
        <View style={styles.serverRow}>
          <Feather name="server" size={12} color={colors.lead} />
          <Text style={styles.serverText}>{host}</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      {/* Auth section */}
      {sent ? (
        <View style={styles.sentWrap}>
          <Feather name="mail" size={28} color={colors.moss} />
          <Text style={styles.sentTitle}>{t('signIn.checkEmail')}</Text>
          <Text style={styles.sentBody}>{t('signIn.checkEmailBody', { email })}</Text>
        </View>
      ) : (
        <View style={styles.authButtons}>
          <View style={styles.emailField}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={colors.lead}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.emailInput}
            />
          </View>

          <TouchableOpacity
            style={[styles.authBtn, styles.authBtnPrimary]}
            onPress={handleMagicLink}
            disabled={loading || !email.trim()}
            activeOpacity={0.85}
          >
            <Feather name="mail" size={18} color={colors.fgOnAccent} />
            <Text style={[styles.authBtnLabel, styles.authBtnLabelPrimary]}>
              {loading ? t('signIn.sending') : t('signIn.continueEmail')}
            </Text>
          </TouchableOpacity>

          {showGoogle && (
            <TouchableOpacity
              style={[styles.authBtn, styles.authBtnSecondary]}
              activeOpacity={0.85}
              onPress={() => {
                // Google OAuth isn't wired yet; still emit the funnel event
                // so we can see drop-off vs. magic-link before shipping it.
                analytics.track('auth_method_selected', { method: 'google' });
              }}
            >
              <Feather name="chrome" size={18} color={colors.graphite} />
              <Text style={[styles.authBtnLabel, styles.authBtnLabelDefault]}>
                {t('signIn.continueGoogle')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Self-host footer — only on the first-launch path with no explicit server. */}
      {mode === 'first-launch' && !params.server && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
          <View style={styles.footerRule} />
          <View style={styles.footerRow}>
            <Text style={styles.footerLeft}>{t('signIn.hostedBy')}</Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/add-server?mode=first-launch')}
              activeOpacity={0.7}
            >
              <Text style={styles.footerRight}>{t('signIn.useMyServer')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {(mode !== 'first-launch' || params.server) && (
        <View style={{ paddingBottom: insets.bottom + spacing.s4 }} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.s5,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.s2,
  },
  wordmarkText: {
    fontFamily: fontDisplay,
    fontSize: 28,
    letterSpacing: -1,
    color: colors.graphite,
  },
  wordmarkRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.graphite,
  },
  tagline: {
    marginTop: 56,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 36,
    letterSpacing: -1.3,
    lineHeight: 38,
    color: colors.graphite,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.s3,
  },
  serverText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  sentWrap: {
    alignItems: 'center',
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  sentTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },
  sentBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
  authButtons: {
    gap: spacing.s2,
    paddingBottom: spacing.s3,
  },
  emailField: {
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s1,
  },
  emailInput: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  authBtnPrimary: {
    backgroundColor: colors.vermillion,
    borderColor: colors.vermillion,
  },
  authBtnSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.graphite,
  },
  authBtnLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    letterSpacing: -0.1,
  },
  authBtnLabelPrimary: {
    color: colors.fgOnAccent,
  },
  authBtnLabelDefault: {
    color: colors.graphite,
  },
  footer: {
    paddingTop: spacing.s3,
  },
  footerRule: {
    height: 0.5,
    backgroundColor: colors.ruleSoft,
    marginBottom: spacing.s3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  footerRight: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
  },
});
