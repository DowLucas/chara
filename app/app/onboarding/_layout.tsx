import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function OnboardingLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (!loading && !user) return <Redirect href="/(auth)/sign-in" />;
  // The accounts blob may briefly hold a placeholder user immediately after
  // migration (spec §11): empty `id` until `/api/me` fills it. Don't treat
  // a placeholder as "missing name" — wait for the fill.
  const isPlaceholder = !!user && !user.id;
  // Full name and phone are required before any other onboarding step.
  const missingName = !user?.name?.trim();
  const missingPhone = !user?.phone?.trim();
  if (
    user &&
    !isPlaceholder &&
    (missingName || missingPhone) &&
    pathname !== '/onboarding/name'
  ) {
    return <Redirect href="/onboarding/name" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
