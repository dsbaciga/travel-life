import { router, useFocusEffect } from 'expo-router';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '@/components/Icon';
import { TabBarContext } from '@/components/ui';
import { FAB, usePalette } from '@/lib/theme';
import { useToast } from '@/lib/toast';

const FAB_SIZE = FAB.size;
/** Until the tab bar has been measured: the usual bar height above the inset. */
const FALLBACK_TAB_BAR = 56;

const tabIcon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} color={color} />;
  };

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // The tab bar's real height (it includes the bottom inset), so the capture
  // button sits just above it on every phone and font size.
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);
  const fabBottom = (tabBarHeight ?? insets.bottom + FALLBACK_TAB_BAR) + FAB.gap;

  // While the tabs are on screen, toasts float above the capture button
  // instead of under it; a pushed screen has neither, so they drop back down.
  useFocusEffect(
    useCallback(() => {
      useToast.getState().setBottomOffset(fabBottom + FAB_SIZE - insets.bottom);
      return () => useToast.getState().setBottomOffset(0);
    }, [fabBottom, insets.bottom])
  );

  return (
    <TabBarContext.Provider value>
    <View style={styles.flex}>
      <Tabs
        tabBar={(props) => (
          <View onLayout={(event) => setTabBarHeight(Math.round(event.nativeEvent.layout.height))}>
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.textMuted,
          tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
          tabBarLabelStyle: styles.tabLabel,
        }}>
        <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('today') }} />
        <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map') }} />
        <Tabs.Screen name="trip" options={{ title: 'Trip', tabBarIcon: tabIcon('trip') }} />
        <Tabs.Screen name="vault" options={{ title: 'Vault', tabBarIcon: tabIcon('vault') }} />
      </Tabs>

      {/* Quick Capture: reachable from every tab, one thumb-press away. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick capture"
        accessibilityHint="Add a stop, photo, expense, meal or note"
        onPress={() => router.push('/capture')}
        android_ripple={{ color: 'rgba(255, 255, 255, 0.3)', borderless: true, radius: FAB_SIZE / 2 }}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: palette.primary, bottom: fabBottom },
          Platform.OS !== 'android' && pressed && styles.pressed,
        ]}>
        <Icon name="add" size={32} color={palette.onPrimary} />
      </Pressable>
    </View>
    </TabBarContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pressed: { opacity: 0.8 },
});
