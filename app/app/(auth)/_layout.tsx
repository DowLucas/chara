import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuth } from '@/lib/auth';

// Routes inside (auth) that are reachable *while signed in* — the
// multi-server add-account flow lives here, and the sign-in screen
// itself is reused for reauth and adding additional servers.
const ALLOW_WHILE_AUTHED = new Set(['add-server', 'sign-in']);

export default function AuthLayout() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  // segments looks like ['(auth)', 'add-server'] — the leaf is what matters.
  const leaf = segments[segments.length - 1];

  if (!loading && user && !ALLOW_WHILE_AUTHED.has(String(leaf))) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
