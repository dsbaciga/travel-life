import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * Put `theme` on the document. The single place that touches the DOM, so the
 * class and `color-scheme` can never drift apart (they did: the class was only
 * ever added, never removed, so light mode could not survive a reload).
 */
function applyTheme(theme: Theme): void {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Dark is the app's default appearance, and main.tsx paints it before
      // React mounts. Defaulting to 'light' here left the Appearance toggle
      // showing "off" on a dark screen for anyone who had never toggled it.
      theme: 'dark',
      isDarkMode: true,
      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === 'light' ? 'dark' : 'light';
          applyTheme(newTheme);
          return { theme: newTheme, isDarkMode: newTheme === 'dark' };
        }),
      setTheme: (theme: Theme) =>
        set(() => {
          applyTheme(theme);
          return { theme, isDarkMode: theme === 'dark' };
        }),
    }),
    {
      name: 'theme-storage',
      // Persisted-shape version. Bump this when the persisted fields change
      // and branch on `version` in migrate() to convert older payloads.
      version: 1,
      migrate: (persistedState) => persistedState as ThemeState,
    }
  )
);

// Selectors for granular subscriptions (prevents unnecessary re-renders)
export const useTheme = () => useThemeStore((state) => state.theme);
export const useIsDarkMode = () => useThemeStore((state) => state.isDarkMode);
export const useToggleTheme = () => useThemeStore((state) => state.toggleTheme);
export const useSetTheme = () => useThemeStore((state) => state.setTheme);

// Initialize theme on app load. Re-applies rather than only adding, so a stored
// 'light' actually clears the class main.tsx may have set.
applyTheme(useThemeStore.getState().theme);
