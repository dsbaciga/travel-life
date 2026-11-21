/**
 * Haptic feedback in one place, so every screen gives the same buzz for the
 * same kind of event. Haptics are a nicety: a device without them (or a test
 * run) must never fail the action that triggered them.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { showToast } from './toast';

/** A small change: a nudge, a toggle, a reorder. */
export function tapFeedback(): void {
  void Haptics.selectionAsync().catch(() => undefined);
}

/** Something was saved, added or copied. */
export function successFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Something was removed or cancelled. */
export function warningFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

/** Copy a confirmation code (or any short text) and say so. */
export async function copyWithFeedback(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
  successFeedback();
  showToast(`Copied ${text}`);
}
