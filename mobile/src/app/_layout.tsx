import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { color, font, radius, space, type } from '@/constants/tokens';
import { useAuthSession } from '@/features/auth/useAuthSession';
import { routeFor } from '@/features/onboarding/route';
import { useMe } from '@/features/onboarding/useMe';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuthSession();
  const { me, status, retry } = useMe(session?.user.id ?? null);
  const route = routeFor({ hasSession: !!session, status, me });

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* Wait for the session and my onboarding state before routing, or the wrong screen flashes. */}
      {!loading && route === 'error' && (
        <View style={styles.center}>
          <Text style={styles.body}>앗, 잠깐 문제가 생겼어요. 다시 해볼까요?</Text>
          <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="다시 시도" style={styles.btn}>
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      {!loading && route !== 'loading' && route !== 'error' && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={route === 'tabs'}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={route === 'onboarding'}>
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={route === 'login'}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: space.gutter, backgroundColor: color.surface },
  body: { ...type.body, color: color.ink, textAlign: 'center' },
  btn: { minHeight: space.tapMin, paddingHorizontal: 20, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.primary },
  btnText: { fontFamily: font.semibold, fontSize: 15, color: color.onPrimary },
});
