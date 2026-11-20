/**
 * Renders the current toast (see `lib/toast.ts`) as a dark pill near the
 * bottom of the screen. Touches outside the pill pass through to the screen.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tapFeedback } from '../lib/feedback';
import { radius, spacing, TOUCH_TARGET, usePalette } from '../lib/theme';
import { useToast } from '../lib/toast';
import { AppText } from './ui';

export function ToastHost() {
  const toast = useToast((state) => state.toast);
  const bottomOffset = useToast((state) => state.bottomOffset);
  const dismiss = useToast((state) => state.dismiss);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // State, not a ref: the value is created once and handed to the render.
  const [appear] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }));

  useEffect(() => {
    if (!toast) return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    // Screen readers do not see a view that slides in, so say it.
    AccessibilityInfo.announceForAccessibility(toast.message);
  }, [toast, appear]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + spacing.lg + bottomOffset }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.pill,
          { backgroundColor: palette.hero, borderColor: palette.border },
          {
            opacity: appear,
            transform: [{ translateY: rise }],
          },
        ]}>
        <AppText color={palette.onHero} style={styles.message} numberOfLines={2}>
          {toast.message}
        </AppText>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={8}
            android_ripple={{ color: 'rgba(255, 255, 255, 0.2)', borderless: false }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            onPress={() => {
              const action = toast.action;
              dismiss(toast.id);
              tapFeedback();
              void action?.onPress();
            }}>
            <AppText variant="label" color={palette.heroAccent}>
              {toast.action.label.toUpperCase()}
            </AppText>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET + 4,
    maxWidth: 560,
    width: '100%',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { flex: 1, paddingVertical: spacing.sm },
  action: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
});
