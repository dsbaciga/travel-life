/**
 * Colours and spacing, mirroring the web app's "Compass Gold" palette
 * (docs/architecture/STYLE_GUIDE.md).
 *
 * Light mode is neutral, as on the web: a cool near-white page (`cream`), white
 * cards and slate text. Amber is the accent, kept for actions and highlights
 * rather than spread across every surface. Dark mode is the cool-grey "dusk" ramp
 * (shared with the web app) with gold.
 */
import { Appearance, useColorScheme } from 'react-native';
import { create } from 'zustand';

import type { SqlDriver } from '../db/driver';
import { kvGet, kvSet } from '../db/repository';

let dbProvider: (() => Promise<SqlDriver>) | null = null;

export function configureThemeDb(provider: () => Promise<SqlDriver>): void {
  dbProvider = provider;
}

async function getThemeDb(): Promise<SqlDriver | null> {
  if (dbProvider) return dbProvider();
  try {
    const { getDb } = await import('./db');
    return await getDb();
  } catch {
    return null;
  }
}

/**
 * The web app's dark-mode grey ramp. Mirrors `DUSK` at the top of
 * `frontend/tailwind.config.js`; keep the two in step.
 */
export const DUSK = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e3e5ea',
  300: '#d1d4db',
  400: '#9da2af',
  500: '#6d7280',
  600: '#4e5360',
  700: '#3b404b',
  800: '#242830',
  900: '#151820',
  950: '#0b0d12',
} as const;

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  /** Text/icon colour on top of `primary`. */
  onPrimary: string;
  accent: string;
  /** Soft wash of the accent, for selected or highlighted areas. */
  tint: string;
  /** The one dark, high-emphasis surface per screen (e.g. "Next up"). */
  hero: string;
  onHero: string;
  heroMuted: string;
  heroAccent: string;
  /** Far end of the hero card's subtle diagonal wash (it starts at `hero`). */
  heroWash: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Android touch ripple on ordinary surfaces. */
  ripple: string;
}

export const lightPalette: Palette = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceRaised: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textMuted: '#64748b',
  primary: '#B45309',
  onPrimary: '#ffffff',
  accent: '#D97706',
  tint: '#fef3c7',
  hero: '#0f172a',
  onHero: '#f8fafc',
  heroMuted: '#cbd5e1',
  heroAccent: '#fbbf24',
  heroWash: '#1e293b',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  info: '#0369a1',
  ripple: 'rgba(15, 23, 42, 0.08)',
};

export const darkPalette: Palette = {
  background: DUSK[900],
  surface: DUSK[800],
  surfaceRaised: DUSK[700],
  border: DUSK[700],
  text: DUSK[50],
  textMuted: DUSK[300],
  primary: '#fbbf24',
  onPrimary: DUSK[900],
  accent: '#f59e0b',
  tint: 'rgba(251, 191, 36, 0.16)',
  // Deeper than ordinary cards (dusk-800) so the hero stands apart.
  hero: DUSK[950],
  onHero: DUSK[50],
  heroMuted: DUSK[300],
  heroAccent: '#fbbf24',
  heroWash: DUSK[900],
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#7dd3fc',
  ripple: 'rgba(255, 255, 255, 0.12)',
};

/** Colour families for itinerary item types: [foreground, soft background]. */
export const typeColors = {
  light: {
    ACTIVITY: ['#B45309', '#fef3c7'],
    TRANSPORTATION: ['#0369a1', '#e0f2fe'],
    LODGING: ['#6d28d9', '#ede9fe'],
    CUSTOM_ITEM: ['#0f766e', '#ccfbf1'],
  },
  dark: {
    ACTIVITY: ['#fbbf24', 'rgba(251, 191, 36, 0.16)'],
    TRANSPORTATION: ['#7dd3fc', 'rgba(125, 211, 252, 0.16)'],
    LODGING: ['#c4b5fd', 'rgba(196, 181, 253, 0.16)'],
    CUSTOM_ITEM: ['#5eead4', 'rgba(94, 234, 212, 0.16)'],
  },
} as const;

export type TypeColorKey = keyof (typeof typeColors)['light'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/** Minimum touch target, per the style guide. */
export const TOUCH_TARGET = 44;

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeStore {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: 'system',
  hydrated: false,
  async hydrate() {
    if (get().hydrated) return;
    try {
      const db = await getThemeDb();
      if (db) {
        const stored = await kvGet<ThemePreference>(db, 'themePreference');
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          set({ preference: stored, hydrated: true });
          if (typeof Appearance?.setColorScheme === 'function') {
            Appearance.setColorScheme(stored === 'system' ? 'unspecified' : stored);
          }
          return;
        }
      }
    } catch {
      // In tests or before DB is ready, fallback gracefully.
    }
    set({ hydrated: true });
  },
  async setPreference(preference: ThemePreference) {
    set({ preference });
    try {
      const db = await getThemeDb();
      if (db) {
        await kvSet(db, 'themePreference', preference);
      }
    } catch {
      // Non-fatal if DB write fails.
    }
    try {
      if (typeof Appearance?.setColorScheme === 'function') {
        Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
      }
    } catch {
      // Non-fatal in test or headless environments.
    }
  },
}));

export function useResolvedColorScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const preference = useThemeStore((state) => state.preference);
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return system === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return useResolvedColorScheme() === 'dark' ? darkPalette : lightPalette;
}

export function useTypeColors(): (typeof typeColors)['light' | 'dark'] {
  return useResolvedColorScheme() === 'dark' ? typeColors.dark : typeColors.light;
}

/** The Quick capture button floating over the tab screens, `gap` above the tab bar. */
export const FAB = { size: 60, gap: 12 } as const;
/**
 * Bottom padding for a list under the tab bar, so its last row can scroll up
 * past the capture button instead of ending underneath it. Lists end at the
 * top of the tab bar, so this is the button plus its gap and some air.
 */
export const FAB_CLEARANCE = FAB.gap + FAB.size + spacing.lg;

/** Pull-to-refresh spinner colours (Android `colors`, iOS `tintColor`). */
export function useRefreshColors(): { colors: string[]; tintColor: string; progressBackgroundColor: string } {
  const palette = usePalette();
  return { colors: [palette.primary], tintColor: palette.primary, progressBackgroundColor: palette.surface };
}
