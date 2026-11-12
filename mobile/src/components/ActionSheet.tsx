/**
 * A bottom action sheet callable from anywhere.
 *
 * `Alert.alert` cannot be used for menus: Android renders at most three of its
 * buttons and silently drops the rest. Mount `<ActionSheetHost />` once at the
 * root; call `showActionSheet(...)` imperatively.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  open: (title, actions, message = null) => set({ title, actions, message }),
  close: () => set({ title: null, message: null, actions: [] }),
}));

export function showActionSheet(title: string, actions: SheetAction[], message?: string | null): void {
  useSheet.getState().open(title, actions, message);
}

export function ActionSheetHost() {
  const { title, message, actions, close } = useSheet();
  const palette = usePalette();
  const insets = useSafeAreaInsets();

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
        <AppText variant="heading" numberOfLines={2}>
          {title}
        </AppText>
        {message ? <AppText muted>{message}</AppText> : null}
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
              style={({ pressed }) => [
                styles.action,
                { borderColor: palette.border },
                pressed && styles.pressed,
              ]}>
              <AppText color={action.destructive ? palette.danger : palette.text}>{action.label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={close}
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
  list: { flexGrow: 0 },
  action: {
    minHeight: TOUCH_TARGET + 4,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
  },
  cancel: { alignItems: 'center', borderRadius: radius.md, borderBottomWidth: 0, marginTop: spacing.sm },
  pressed: { opacity: 0.6 },
});
