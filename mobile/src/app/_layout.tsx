import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAuthSession } from '@/features/auth/useAuthSession';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuthSession();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* Wait for the SecureStore session before routing, or a logged-in user flashes the login screen. */}
      {!loading && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="profile" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
