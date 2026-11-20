/**
 * Brief confirmations ("Copied", "Moved 30 min later") with an optional action,
 * usually Undo. One toast at a time: a new one replaces the last. Mount
 * `<ToastHost />` once at the root and call `showToast(...)` from anywhere.
 */
import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  action: ToastAction | null;
}

/** Long enough to read; longer when there is something to tap. */
export const TOAST_MS = 3000;
export const TOAST_WITH_ACTION_MS = 5000;

interface ToastState {
  toast: Toast | null;
  /**
   * Extra room to leave at the bottom, so the toast clears the tab bar and the
   * capture button while the tabs are showing.
   */
  bottomOffset: number;
  show(message: string, action?: ToastAction | null): void;
  dismiss(id?: number): void;
  setBottomOffset(offset: number): void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set, get) => ({
  toast: null,
  bottomOffset: 0,
  show(message, action = null) {
    if (timer) clearTimeout(timer);
    const id = nextId++;
    set({ toast: { id, message, action } });
    timer = setTimeout(() => get().dismiss(id), action ? TOAST_WITH_ACTION_MS : TOAST_MS);
  },
  dismiss(id) {
    // An old timer must not close the toast that replaced its own.
    if (id !== undefined && get().toast?.id !== id) return;
    if (timer) clearTimeout(timer);
    timer = null;
    set({ toast: null });
  },
  setBottomOffset(offset) {
    set({ bottomOffset: offset });
  },
}));

export function showToast(message: string, action?: ToastAction | null): void {
  useToast.getState().show(message, action);
}
