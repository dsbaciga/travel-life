import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ExpoCrypto from 'expo-crypto';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionSheetHost } from '@/components/ActionSheet';
import ShareIntentRouter from '@/components/ShareIntentRouter';
import { setIdFactory } from '@/domain/mutations';
import { useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { registerForPush } from '@/tasks/notifications';
// Side-effect imports: background tasks and the widget handler must be defined
// at module load, before the OS can deliver an event to a headless launch.
import '@/tasks/location';
import '@/tasks/widget';

// Signed out, two screens are reachable (onboarding and scan) and the router
// would otherwise open on whichever sorts first. Signed in, onboarding is
// guarded, so this is ignored and the tabs open as usual.
export const unstable_settings = { anchor: 'onboarding' };

void SplashScreen.preventAutoHideAsync();

// Local ids come from the platform CSPRNG.
setIdFactory(() => ExpoCrypto.randomUUID());

// Screens read SQLite, which is already instant and already offline; the query
// cache only needs to dedupe reads within a render pass.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false, networkMode: 'always' } },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrated = useSession((state) => state.hydrated);
  const signedIn = useSession((state) => state.session !== null);

  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  useEffect(() => {
    if (hydrated) void SplashScreen.hideAsync();
  }, [hydrated]);

  useEffect(() => {
    if (!signedIn) return;
    void syncNow();
    void registerForPush();
    // Sync when the app returns to the foreground and when signal comes back —
    // the two moments an offline queue can actually drain.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void syncNow();
    });
    return () => {
      appState.remove();
      unsubscribeNet();
    };
  }, [signedIn]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShareIntentProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={{ headerBackTitle: 'Back' }}>
                <Stack.Protected guard={signedIn}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="entity/[kind]/[id]" options={{ title: '' }} />
                  <Stack.Screen name="link-picker" options={{ title: 'Link to…', presentation: 'modal' }} />
                  <Stack.Screen name="capture" options={{ title: 'Quick capture', presentation: 'modal' }} />
                  <Stack.Screen name="receipt" options={{ title: 'Scan receipt' }} />
                  <Stack.Screen name="parked" options={{ title: 'Where I parked' }} />
                  <Stack.Screen name="camera-roll" options={{ title: 'Trip photos' }} />
                  <Stack.Screen name="share" options={{ title: 'Save to Travel Life', presentation: 'modal' }} />
                  <Stack.Screen name="sync" options={{ title: 'Sync' }} />
                  <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                  <Stack.Screen name="trips" options={{ title: 'Trips', presentation: 'modal' }} />
                </Stack.Protected>
                <Stack.Protected guard={!signedIn}>
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                  <Stack.Screen name="scan" options={{ title: 'Scan pairing code', presentation: 'modal' }} />
                </Stack.Protected>
              </Stack>
              {signedIn ? <ShareIntentRouter /> : null}
              <ActionSheetHost />
              <StatusBar style="auto" />
            </ThemeProvider>
          </ShareIntentProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
