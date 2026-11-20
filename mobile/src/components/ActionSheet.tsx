/**
 * A bottom action sheet callable from anywhere.
 *
 * `Alert.alert` cannot be used for menus: Android renders at most three of its
 * buttons and silently drops the rest. Mount `<ActionSheetHost />` once at the
 * root; call `showActionSheet(...)` imperatively.
 */
import { useMemo } from 'react';
import { Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { radius, spacing, TOUCH_TARGET, usePalette } from '../lib/theme';
import { AppText } from './ui';

export interface SheetAction {
  label: string;
  onPress: () => void | Promise<void>;
  destructive?: boolean;
}

interface SheetState {
  title: string | null;
  message: string | null;
  actions: SheetAction[];
  open(title: string, actions: SheetAction[], message?: string | null): void;
  close(): void;
}

const useSheet = create<SheetState>((set) => ({
  title: null,
  message: null,
  actions: [],
  // Destructive actions go last, nearest Cancel and away from the thumb's
  // first landing spot; the rest keep the order they were given in.
  open: (title, actions, message = null) =>
    set({
      title,
      message,
      actions: [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)],
    }),
  close: () => set({ title: null, message: null, actions: [] }),
}));

export function showActionSheet(title: string, actions: SheetAction[], message?: string | null): void {
  useSheet.getState().open(title, actions, message);
}

export function ActionSheetHost() {
  const { title, message, actions, close } = useSheet();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // A downward swipe on the top of the sheet dismisses it, as the handle suggests.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 48 || gesture.vy > 0.8) close();
        },
      }),
    [close]
  );

  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss menu"
        style={styles.backdrop}
        onPress={close}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: palette.surface, paddingBottom: insets.bottom + spacing.md },
        ]}>
        <View {...swipe.panHandlers} style={styles.top}>
          <View style={[styles.handle, { backgroundColor: palette.border }]} />
          <AppText variant="heading" numberOfLines={2}>
            {title}
          </AppText>
          {message ? <AppText muted>{message}</AppText> : null}
        </View>
        <ScrollView style={styles.list}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                // Close first so an action that opens another sheet is not
                // immediately dismissed by this one's teardown.
                close();
                void action.onPress();
              }}
              android_ripple={{ color: palette.ripple }}
              style={({ pressed }) => [
                styles.action,
                { borderColor: palette.border },
                Platform.OS !== 'android' && pressed && styles.pressed,
              ]}>
              <AppText color={action.destructive ? palette.danger : palette.text}>{action.label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={close}
          android_ripple={{ color: palette.ripple }}
          style={[styles.action, styles.cancel, { backgroundColor: palette.surfaceRaised }]}>
          <AppText variant="label">Cancel</AppText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '75%',
  },
  top: { gap: spacing.sm },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.xs },
  list: { flexGrow: 0 },
  action: {
    minHeight: TOUCH_TARGET + 4,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
  },
  cancel: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderBottomWidth: 0,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.6 },
});
