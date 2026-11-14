import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarContext } from '@/components/ui';
import { usePalette } from '@/lib/theme';

const tabIcon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={[styles.icon, !focused && styles.iconIdle]}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <TabBarContext.Provider value>
    <View style={styles.flex}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.textMuted,
          tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('☀️') }} />
        <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('🗺️') }} />
        <Tabs.Screen name="trip" options={{ title: 'Trip', tabBarIcon: tabIcon('🧭') }} />
        <Tabs.Screen name="vault" options={{ title: 'Vault', tabBarIcon: tabIcon('🛂') }} />
      </Tabs>

      {/* Quick Capture: reachable from every tab, one thumb-press away. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick capture"
        accessibilityHint="Add a stop, photo, expense, meal or note"
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: palette.primary, bottom: insets.bottom + 64 },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.fabLabel, { color: palette.onPrimary }]}>+</Text>
      </Pressable>
    </View>
    </TabBarContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  icon: { fontSize: 20 },
  iconIdle: { opacity: 0.55 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabLabel: { fontSize: 32, fontWeight: '600', lineHeight: 36 },
  pressed: { opacity: 0.8 },
});
