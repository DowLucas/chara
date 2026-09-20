import { Stack } from 'expo-router';

// Pre-signup first-run flow. Deliberately ungated: everything here only
// writes the local onboarding draft; sign-up happens at the end.
export default function WelcomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
