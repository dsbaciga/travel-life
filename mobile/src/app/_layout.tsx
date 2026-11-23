import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrimsonPro_600SemiBold, CrimsonPro_700Bold } from '@expo-google-fonts/crimson-pro';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import * as ExpoCrypto from 'expo-crypto';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as Font from 'expo-font';
import symbolFont from 'expo-symbols/androidWeights/regular';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionSheetHost } from '@/components/ActionSheet';
import ShareIntentRouter from '@/components/ShareIntentRouter';
import { ToastHost } from '@/components/Toast';
import { setIdFactory } from '@/domain/mutations';
import { useFontStore } from '@/lib/fonts';
import { useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { darkPalette, lightPalette, useResolvedColorScheme, useThemeStore, type Palette } from '@/lib/theme';
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

/**
 * The navigation theme, built from the palette so the headers of pushed screens
 * (forms, Sync, Settings) match the screen under them instead of using the
 * library's stock black and white.
 */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette: Palette = scheme === 'dark' ? darkPalette : lightPalette;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };
}

/**
 * Icons draw from the Material Symbols font on Android. Loading it before the
 * splash screen hides means the first screen does not show empty icon slots.
 * It ships inside the app, so this works offline.
 */
async function loadIconFont(): Promise<void> {
  if (Platform.OS === 'ios') return;
  try {
    // Never hold the splash screen for icons: give up after a moment and let
    // each icon finish loading on its own.
    await Promise.race([
      Font.loadAsync({ [symbolFont.name]: symbolFont.font }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    // Icons fall back to blank space; the app still works.
  }
}

/**
 * The text fonts (Crimson Pro for display, Manrope for body), as on the web.
 * They ship inside the app, so this works offline. Like the icon font, they
 * never hold the splash screen for long: text uses the system font until they
 * arrive, and `useFontStore` flips the app over to them the moment they do.
 */
async function loadTextFonts(): Promise<void> {
  try {
    const loading = Font.loadAsync({
      CrimsonPro_600SemiBold,
      CrimsonPro_700Bold,
      Manrope_400Regular,
      Manrope_500Medium,
      Manrope_600SemiBold,
      Manrope_700Bold,
    }).then(() => useFontStore.getState().setReady());
    await Promise.race([loading, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
  } catch {
    // Text stays on the system font; the app still works.
  }
}

export default function RootLayout() {
  const colorScheme = useResolvedColorScheme();
  const hydrated = useSession((state) => state.hydrated);
  const signedIn = useSession((state) => state.session !== null);
  const [iconsReady, setIconsReady] = useState(false);
  const theme = useMemo(() => navigationTheme(colorScheme), [colorScheme]);

  useEffect(() => {
    void useSession.getState().hydrate();
    void useThemeStore.getState().hydrate();
    void Promise.all([loadIconFont(), loadTextFonts()]).finally(() => setIconsReady(true));
  }, []);

  const ready = hydrated && iconsReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

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
    // Collaborators' edits only arrive on a pull, so pull while the app is open.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow();
    }, 60000);
    return () => {
      appState.remove();
      unsubscribeNet();
      clearInterval(poll);
    };
  }, [signedIn]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShareIntentProvider>
            <ThemeProvider value={theme}>
              <Stack screenOptions={{ headerBackTitle: 'Back' }}>
                <Stack.Protected guard={signedIn}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="entity/[kind]/[id]" options={{ title: '' }} />
                  <Stack.Screen name="link-picker" options={{ title: 'Link to…', presentation: 'modal' }} />
                  <Stack.Screen name="capture" options={{ title: 'Quick capture', presentation: 'modal' }} />
                  <Stack.Screen name="receipt" options={{ title: 'Scan receipt' }} />
                  <Stack.Screen name="parked" options={{ title: 'Where I parked' }} />
                  <Stack.Screen name="food" options={{ title: 'Food nearby' }} />
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
              <ToastHost />
              <ActionSheetHost />
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            </ThemeProvider>
          </ShareIntentProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
