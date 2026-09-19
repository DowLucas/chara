import { useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useDefaultAccount } from '@/lib/accounts';
import { TabBar } from '@/components/TabBar';
import { decideSignedOutEntry, needsNameStep } from '@/lib/onboarding-gate';
import { getFlag, setFlag, FLAG_ONBOARDING_COMPLETE } from '@/lib/storage';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const defaultAccount = useDefaultAccount();
  // A freshly-migrated account starts with an empty-id placeholder user
  // until the AccountsProvider's `/api/me` fill completes (spec §11).
  const isPlaceholder = !!user && !user.id;
  // Whether this device has finished first-run onboarding: decides where a
  // signed-out launch goes (welcome flow vs. plain sign-in).
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFlag(FLAG_ONBOARDING_COMPLETE)
      .then((v) => { if (!cancelled) setOnboardingComplete(v === '1'); })
      .catch(() => { if (!cancelled) setOnboardingComplete(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Users who signed in before the welcome flow existed never set the flag;
  // mark them so signing out later lands on sign-in, not the intro.
  useEffect(() => {
    if (user && !isPlaceholder && onboardingComplete === false) {
      void setFlag(FLAG_ONBOARDING_COMPLETE, '1').catch(() => {});
    }
  }, [user, isPlaceholder, onboardingComplete]);

  if (!loading && !user) {
    const entry = decideSignedOutEntry(onboardingComplete);
    if (entry === 'pending') return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
    return <Redirect href={entry === 'welcome' ? '/welcome' : '/(auth)/sign-in'} />;
  }
  // The legacy token may have been invalidated server-side (e.g., a backend
  // restart rotated JWT_SECRET). The account stays in the blob but is
  // flagged `reauth_required` per spec §12. Route to the reauth flow so
  // the user isn't stranded on a placeholder.
  if (defaultAccount?.status === 'reauth_required') {
    return (
      <Redirect
        href={
          `/(auth)/sign-in?server=${encodeURIComponent(defaultAccount.serverUrl)}&mode=reauth` as never
        }
      />
    );
  }
  // Still hydrating the placeholder — show a paper-coloured holding screen.
  if (isPlaceholder) {
    return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  }
  // A name is required before the user can see the app; phone is optional
  // (Swish/Vipps only). Requiring phone here trapped users who entered only
  // a name and skipped group creation in an onboarding→name→onboarding loop.
  if (user && needsNameStep(user)) {
    return <Redirect href="/onboarding/name" />;
  }
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
