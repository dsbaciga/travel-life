import { router, useFocusEffect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '@/components/Icon';
import { TabBarContext } from '@/components/ui';
import { usePalette } from '@/lib/theme';
import { useToast } from '@/lib/toast';

/** Where the capture button sits above the bottom inset, and how tall it is. */
const FAB_BOTTOM = 64;
const FAB_SIZE = 60;

const tabIcon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} color={color} />;
  };

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  // While the tabs are on screen, toasts float above the capture button
  // instead of under it; a pushed screen has neither, so they drop back down.
  useFocusEffect(
    useCallback(() => {
      useToast.getState().setBottomOffset(FAB_BOTTOM + FAB_SIZE);
      return () => useToast.getState().setBottomOffset(0);
    }, [])
  );

  return (
    <TabBarContext.Provider value>
    <View style={styles.flex}>
      <Tabs
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
          { backgroundColor: palette.primary, bottom: insets.bottom + FAB_BOTTOM },
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
