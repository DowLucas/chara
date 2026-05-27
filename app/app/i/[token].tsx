// Universal-link landing for `https://<host>/i/<token>` invites.
//
// iOS Universal Links / Android App Links open the app on this path. Expo
// Router consumes the URL for filesystem routing, so without this file the
// app showed the unmatched-route screen.
//
// One-frame trampoline that `router.replace`s to the join-confirmation
// screen, which owns preview + sign-in handoff + actual join. We do the
// URL parse here (not via dispatcher) so we can `replace` cleanly — the
// dispatcher uses `push`, which would leave this trampoline on the stack.
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { parseInviteUrl } from '@/lib/invite-url';

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

      // Prefer the actual incoming URL (preserves host for self-hosted
      // builds whose AASA may cover a different domain); otherwise
      // reconstruct from the AASA host.
      let rawUrl: string | null = null;
      try {
        const initial = await Linking.getInitialURL();
        if (initial && /\/i\//.test(initial)) rawUrl = initial;
      } catch {
        // ignore
      }
      if (!rawUrl) rawUrl = `https://${FALLBACK_HOST}/i/${tokenStr}`;

      const parsed = parseInviteUrl(rawUrl);
      if ('kind' in parsed && parsed.kind === 'invalid') {
        router.replace('/');
        return;
      }
      const { serverUrl } = parsed;
      router.replace(
        `/join/${encodeURIComponent(serverUrl)}/${encodeURIComponent(tokenStr)}`,
      );
    })();
  }, [token]);

  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
