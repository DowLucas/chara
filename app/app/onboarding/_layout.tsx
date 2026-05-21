import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function OnboardingLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (!loading && !user) return <Redirect href="/(auth)/sign-in" />;
  // Full name is required before any other onboarding step.
  if (user && !user.name.trim() && pathname !== '/onboarding/name') {
    return <Redirect href="/onboarding/name" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
