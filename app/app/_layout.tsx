import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountsProvider } from '@/lib/accounts';
import { snapshot as accountsSnapshot } from '@/lib/accounts-store';
import * as analytics from '@/lib/analytics';
import { runRecoveryProbes } from '@/lib/compat-recovery';
import { bootstrapPush, retryPendingRegistrations } from '@/lib/push';
import { REFRESH_FLOOR_MS } from '@/lib/aggregated-reads-internal';
import { classifyInvite } from '@/lib/invite-handler';
import { dispatchInviteIntent } from '@/lib/invite-dispatcher';
import '@/lib/i18n';

/**
 * Dispatch a deep-link URL coming from `Linking` or a notification tap.
 *
 * Spec §10 + §15: two shapes are recognised; everything else is ignored.
 *
 *   1. `chara://join?invite=…` (and legacy `quits://join?invite=…`)
 *      → run the same classify + dispatch as the scanner.
 *   2. `chara://groups/<urlencodedServerUrl>/<groupId>?event=…`
 *      → push the server-qualified group route. The `event` query param
 *        is informational only (potential analytics hook later).
 */
function handleDeepLink(url: string | null | undefined): void {
  if (!url) return;
  const lower = url.toLowerCase();

  // Invite links — chara:// and the one-release legacy quits:// alias.
  if (lower.startsWith('chara://join') || lower.startsWith('quits://join')) {
    const intent = classifyInvite(url, { accounts: accountsSnapshot().accounts });
    void dispatchInviteIntent(intent);
    return;
  }

  // Notification-tap group route: chara://groups/<encodedServer>/<groupId>?…
  if (lower.startsWith('chara://groups/')) {
    // Strip scheme and any query/fragment, then split.
    const withoutScheme = url.slice('chara://'.length);
    const [path] = withoutScheme.split(/[?#]/);
    const parts = path.split('/').filter((p) => p.length > 0);
    // parts: ['groups', '<encodedServer>', '<groupId>', ...]
    if (parts.length >= 3 && parts[0] === 'groups') {
      const encodedServer = parts[1];
      const groupId = parts[2];
      router.push(`/groups/${encodedServer}/${groupId}`);
    }
    return;
  }

  // Anything else: ignore.
}

// Fast Refresh re-runs this module after the splash has already hidden, at
// which point preventAutoHideAsync / hideAsync reject with "No native splash
// screen registered…". The rejections are benign — the splash is gone — but
// noisy in dev. Swallow them.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'SNPro-Regular': require('../assets/fonts/SNPro-Regular.ttf'),
    'SNPro-Medium': require('../assets/fonts/SNPro-Medium.ttf'),
    'SNPro-SemiBold': require('../assets/fonts/SNPro-SemiBold.ttf'),
    'JetBrainsMono': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Medium': require('../assets/fonts/JetBrainsMono-Medium.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Spec §9: cold-launch + foreground recovery probe for `incompatible`
  // accounts. Both triggers required — a cold start has no foreground
  // transition, and a long-running session may upgrade between bumps.
  // Shares the 60s floor with the aggregated-reads refresh.
  //
  // Spec §10/§15: deep-link + notification-tap routing. Mounted here so
  // its cleanup is colocated with the other launch-time subscriptions.
  const lastProbeRef = useRef<number>(0);
  useEffect(() => {
    void runRecoveryProbes();
    // Spec §15: push token bootstrap + per-account fan-out. Idempotent;
    // shares the AppState `'active'` listener for silent retries.
    void bootstrapPush();
    // PostHog analytics: fire-and-forget init; the wrapper buffers any
    // events fired before init() resolves. No-op when POSTHOG_API_KEY
    // is unset (forks / dev builds).
    void analytics.init();
    {
      const snap = accountsSnapshot();
      const isFirstLaunch = snap.accounts.length === 0 && !snap.defaultServerUrl;
      analytics.track('app_opened', { is_first_launch: isFirstLaunch });
    }
    lastProbeRef.current = Date.now();

    // Cold-launch deep link (e.g. tapped an invite while the app was killed).
    void Linking.getInitialURL().then((url) => handleDeepLink(url));

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      // retryPendingRegistrations has its own internal REFRESH_FLOOR_MS
      // throttle; don't gate it on the probe throttle.
      void retryPendingRegistrations();
      if (Date.now() - lastProbeRef.current < REFRESH_FLOOR_MS) return;
      lastProbeRef.current = Date.now();
      void runRecoveryProbes();
    });

    // Warm deep-link handler (universal links / scheme links while the app
    // is alive). Legacy `quits://` is handled by `handleDeepLink` itself.
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    // Notification-tap → deep link, per Expo convention: payload's `data.url`
    // is the canonical place servers stash a route. See spec §15.
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { url?: unknown } | undefined;
      if (data && typeof data.url === 'string') handleDeepLink(data.url);
    });

    return () => {
      appStateSub.remove();
      linkingSub.remove();
      notifSub.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AccountsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="groups/[server]/[id]/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[server]/[id]/add-expense" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/[server]/[id]/settle" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[server]/[id]/settle-method" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[server]/[id]/invite" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[server]/[id]/edit" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[server]/[id]/members" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/scan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="expenses/[server]/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/security-code" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/about" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/accounts" options={{ animation: 'slide_from_right' }} />
        </Stack>
        <StatusBar style="dark" />
      </AccountsProvider>
    </SafeAreaProvider>
  );
}
