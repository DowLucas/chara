import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'SNPro-Regular': require('../assets/fonts/SNPro-Regular.ttf'),
    'SNPro-Medium': require('../assets/fonts/SNPro-Medium.ttf'),
    'SNPro-SemiBold': require('../assets/fonts/SNPro-SemiBold.ttf'),
    'JetBrainsMono': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Medium': require('../assets/fonts/JetBrainsMono-Medium.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="groups/[id]/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[id]/add-expense" options={{ presentation: 'modal' }} />
          <Stack.Screen name="groups/[id]/settle" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[id]/invite" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/[id]/edit" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="groups/scan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="expenses/[id]" options={{ animation: 'slide_from_right' }} />
        </Stack>
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
