// Universal-link landing for `https://<host>/i/<token>` invites.
//
// iOS Universal Links / Android App Links open the app on this path. Expo
// Router consumes the URL for filesystem routing, so without this file the
// app showed the unmatched-route screen. The actual classify + dispatch
// pipeline is shared with the QR scanner — see `lib/invite-handler.ts` and
// `lib/invite-dispatcher.ts`.
//
// The dispatcher calls `router.replace(...)` on success, so this route is
// effectively a one-frame trampoline; the user sees nothing.
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { classifyInvite } from '@/lib/invite-handler';
import { dispatchInviteIntent } from '@/lib/invite-dispatcher';
import { snapshot as accountsSnapshot } from '@/lib/accounts-store';

// AASA only declares one host today (see app.config.ts:associatedDomains).
// Reconstructing the canonical URL needs a host; we prefer the actual URL
// from the OS via `Linking.getInitialURL`, and fall back to the AASA host.
const FALLBACK_HOST = 'chara-api.lurkhuset.com';

export default function InviteUniversalLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const dispatched = useRef(false);

  useEffect(() => {
    if (dispatched.current) return;
    dispatched.current = true;

    void (async () => {
      const tokenStr = Array.isArray(token) ? token[0] : token;
      if (!tokenStr || typeof tokenStr !== 'string') {
        router.replace('/');
        return;
      }

      // Prefer the actual incoming URL (preserves host for multi-domain
      // self-hosted builds); otherwise reconstruct from the AASA host.
      let url: string | null = null;
      try {
        const initial = await Linking.getInitialURL();
        if (initial && /\/i\//.test(initial)) url = initial;
      } catch {
        // ignore — fall back to reconstruction
      }
      if (!url) url = `https://${FALLBACK_HOST}/i/${tokenStr}`;

      const intent = classifyInvite(url, { accounts: accountsSnapshot().accounts });
      await dispatchInviteIntent(intent);

      // If the dispatcher didn't navigate (e.g. invalid token), bounce home
      // so the user isn't stranded on this blank trampoline.
      router.replace('/');
    })();
  }, [token]);

  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
