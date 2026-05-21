import { useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { TabBar } from '@/components/TabBar';
import { listGroups } from '@/lib/api';
import { getFlag, FLAG_ONBOARDING_SKIPPED } from '@/lib/storage';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  // null = unknown yet; number = count. Once we know there are 0 groups we
  // redirect into onboarding; once we know there are some we render tabs.
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setGroupCount(null);
      setSkipped(null);
      return;
    }
    let cancelled = false;
    listGroups()
      .then((g) => { if (!cancelled) setGroupCount(g.length); })
      .catch(() => { if (!cancelled) setGroupCount(0); });
    getFlag(FLAG_ONBOARDING_SKIPPED)
      .then((v) => { if (!cancelled) setSkipped(v === '1'); })
      .catch(() => { if (!cancelled) setSkipped(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!loading && !user) return <Redirect href="/(auth)/sign-in" />;
  // Full name is required before the user can see the app.
  if (user && !user.name.trim()) return <Redirect href="/onboarding/name" />;
  if (user && (groupCount === null || skipped === null)) {
    // Still resolving — render an empty paper-coloured screen to avoid a flash.
    return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  }
  // First-time users always enter onboarding at the name step (prefilled
  // if a name is already set, see /onboarding/name).
  if (user && groupCount === 0 && !skipped) return <Redirect href="/onboarding/name" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
