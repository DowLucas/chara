import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, LogBox } from 'react-native';

// SecureStore can throw before the iOS keychain unlocks on cold launch.
// The `getPreferredLanguage` / accounts-store paths already swallow the
// error and fall back to defaults — see the explanatory comment in
// `app/lib/i18n.ts`. The yellow-box warning leaks the implementation
// detail into the UI (and into screenshots) for no actionable reason, so
// silence that specific pattern. Released builds strip LogBox anyway;
// this only affects dev/preview.
LogBox.ignoreLogs([/ExpoSecureStore/i]);
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import { useShareIntent } from 'expo-share-intent';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountsProvider } from '@/lib/accounts';
import {
  isLoaded as accountsIsLoaded,
  snapshot as accountsSnapshot,
  subscribe as subscribeAccounts,
} from '@/lib/accounts-store';
import { AppAlertHost } from '@/components/AppAlert/AppAlertHost';
import { showAlert } from '@/lib/app-alert';
import * as analytics from '@/lib/analytics';
import { runRecoveryProbes } from '@/lib/compat-recovery';
import { bootstrapPush, retryPendingRegistrations } from '@/lib/push';
import { REFRESH_FLOOR_MS } from '@/lib/aggregated-reads-internal';
import { classifyInvite } from '@/lib/invite-handler';
import { dispatchInviteIntent } from '@/lib/invite-dispatcher';
import { classifyGroupDeepLink } from '@/lib/deep-link';
import { classifyShareIntent, isShareArtifact, sweepShareFiles } from '@/lib/share-inbox';
import { setPendingShare } from '@/lib/pending-share';
import { normalizeServerUrl } from '@/lib/server-url';
import i18n from '@/lib/i18n';
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

  // Magic-link completion. The email link is a plain https URL, so the OS
  // opens it in a browser; the backend GET (auth.go VerifyRedirect) bounces it
  // back as chara://verify?token=…&server=… . Route into the sign-in screen,
  // which exchanges the raw token for a JWT via its existing flow. The `server`
  // param is the issuing backend (the browser hop loses the screen's context);
  // normalize it to the account join-key form.
  //
  // The server here is attacker-controllable (anyone can send the user a
  // chara://verify link), so a malformed one drops the whole link rather than
  // falling through to the hosted default — otherwise an attacker's token
  // would be verified against Chara Cloud. Whether an *otherwise valid* but
  // unfamiliar server may be adopted is decided on the sign-in screen via
  // `classifyVerifyTarget`; that gate has to live there anyway, because Expo
  // Router maps `chara://sign-in?…` straight onto the route and never reaches
  // this handler.
  if (lower.startsWith('chara://verify') || lower.startsWith('quits://verify')) {
    const q = Linking.parse(url).queryParams ?? {};
    const rawToken = Array.isArray(q.token) ? q.token[0] : q.token;
    if (typeof rawToken === 'string' && rawToken) {
      const params = new URLSearchParams({ verifyToken: rawToken });
      const rawServer = Array.isArray(q.server) ? q.server[0] : q.server;
      if (typeof rawServer === 'string' && rawServer) {
        const normalized = normalizeServerUrl(rawServer);
        if (typeof normalized !== 'string') return;
        params.set('server', normalized);
      }
      router.push(`/(auth)/sign-in?${params.toString()}` as never);
    }
    return;
  }

  // Notification-tap / widget-tap group route:
  // chara://groups/<encodedServer>/<groupId>?…
  //
  // The scheme check lives in the classifier (which accepts the dev variant's
  // `charadev` too) rather than being duplicated here — a second hardcoded
  // `chara://` gate would drop dev-build links before classification.
  // Non-group URLs classify as `ignore` and fall through to the return below.
  {
    const intent = classifyGroupDeepLink(url, {
      accounts: accountsSnapshot().accounts,
      isLoaded: accountsIsLoaded(),
    });
    switch (intent.kind) {
      case 'navigate': {
        // Inline the template literals (rather than via a `string` const) so
        // they keep the literal type expo-router's typed `Href` requires.
        const server = encodeURIComponent(intent.serverUrl);
        router.push(
          intent.target === 'settle'
            ? `/groups/${server}/${intent.groupId}/settle`
            : intent.target === 'add-expense'
              ? `/groups/${server}/${intent.groupId}/add-expense`
              : `/groups/${server}/${intent.groupId}`,
        );
        return;
      }
      case 'unknown_server':
        // i18n: temporary inline strings — i18n agent owns en.json.
        // Suggested keys: `deepLink.unknownServer.title|body`.
        void showAlert({
          title: i18n.t('deepLink.unknownServer.title', {
            defaultValue: 'Unknown account for this link',
          }),
          message: i18n.t('deepLink.unknownServer.body', {
            defaultValue: 'This link points to a server you’re not signed into.',
          }),
          buttons: [
            {
              key: 'ok',
              label: i18n.t('common.ok', { defaultValue: 'OK' }),
            },
          ],
        });
        return;
      case 'not_loaded':
        // Cold launch: this handler can run before the accounts blob has
        // finished loading (SecureStore reads are async and this fires
        // from the root layout's mount effect, ahead of AccountsProvider).
        // Retry once loading completes instead of dropping the link.
        retryDeepLinkOnceLoaded(url);
        return;
      case 'malformed':
      case 'ignore':
      default:
        return;
    }
  }

  // Anything else: ignore.
}

/**
 * Re-attempts a group deep link once the accounts blob finishes loading.
 * Self-cleaning: unsubscribes after the first load-completion notification,
 * whether or not that retry actually navigates (e.g. it could still resolve
 * to `unknown_server`).
 */
function retryDeepLinkOnceLoaded(url: string): void {
  if (accountsIsLoaded()) {
    // Loaded between the original call and this one — retry immediately.
    handleDeepLink(url);
    return;
  }
  const unsub = subscribeAccounts(() => {
    if (!accountsIsLoaded()) return;
    unsub();
    handleDeepLink(url);
  });
}

// Fast Refresh re-runs this module after the splash has already hidden, at
// which point preventAutoHideAsync / hideAsync reject with "No native splash
// screen registered…". The rejections are benign — the splash is gone — but
// noisy in dev. Swallow them.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Bound how long shared receipts sit in the App Group container. The share
 * extension copies every shared file there and never deletes it; only the
 * extension's own `<UUID>.<ext>` artifacts are touched (lib/share-inbox.ts).
 * Best-effort: a failure here must never block the share itself.
 */
async function sweepShareContainer(fileUri: string): Promise<void> {
  const slash = fileUri.lastIndexOf('/');
  if (slash < 0) return;
  const dir = fileUri.slice(0, slash + 1);
  // Only the iOS App Group container persists across launches. Android hands
  // us a copy in the app's own cache dir, which the OS already manages.
  if (!dir.includes('/AppGroup/')) return;
  try {
    const names = (await FileSystem.readDirectoryAsync(dir)).filter(isShareArtifact);
    const stats = await Promise.all(
      names.map(async (name) => {
        const info = await FileSystem.getInfoAsync(dir + name);
        const savedAtMs = info.exists && !info.isDirectory ? info.modificationTime * 1000 : null;
        return { name, savedAtMs };
      }),
    );
    const { remove } = sweepShareFiles(
      stats.filter((f): f is { name: string; savedAtMs: number } => f.savedAtMs !== null),
      Date.now(),
    );
    await Promise.all(
      remove
        .filter((name) => dir + name !== fileUri)
        .map((name) => FileSystem.deleteAsync(dir + name, { idempotent: true })),
    );
  } catch {
    // Listing or deleting failed — leave the container alone.
  }
}

/**
 * Share-sheet entry point ("open a PDF anywhere → Share → Chara"). Mounted
 * inside AccountsProvider so the receipt-inbox screen it routes to can read
 * accounts. Classifies the handoff, stashes the file for add-expense, sweeps
 * stale artifacts, and navigates; unsupported files get an alert instead.
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */
function ShareIntentListener() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (!hasShareIntent) return;
    const intent = classifyShareIntent(shareIntent.files);
    resetShareIntent();
    if (intent.kind === 'ignore') return;
    if (intent.kind === 'unsupported') {
      void showAlert({
        title: i18n.t('receiptInbox.unsupportedTitle'),
        message: i18n.t('receiptInbox.unsupportedBody'),
        buttons: [{ key: 'ok', label: i18n.t('common.ok') }],
      });
      return;
    }
    setPendingShare({ ...intent.file, extraFilesIgnored: intent.extraFilesIgnored });
    void sweepShareContainer(intent.file.uri);
    router.push('/receipt-inbox' as never);
    // resetShareIntent is stable per the library; hasShareIntent is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  return null;
}

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

    // Cold-launch notification tap: addNotificationResponseReceivedListener
    // (below) only fires for taps that happen while JS is already running —
    // a tap that launches the app from killed doesn't replay through it.
    // getLastNotificationResponseAsync recovers that one response.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data as
        | { url?: unknown }
        | undefined;
      if (data && typeof data.url === 'string') handleDeepLink(data.url);
    });

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
          <Stack.Screen name="receipt-inbox" options={{ presentation: 'modal' }} />
          <Stack.Screen name="join/[server]/[token]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="expenses/[server]/[id]/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/about" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/accounts" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings/archived-groups" options={{ animation: 'slide_from_right' }} />
        </Stack>
        <StatusBar style="dark" />
        <AppAlertHost />
        <ShareIntentListener />
      </AccountsProvider>
    </SafeAreaProvider>
  );
}
