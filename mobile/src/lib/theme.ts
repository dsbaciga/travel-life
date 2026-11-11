/**
 * Colours and spacing, mirroring the web app's "Compass Gold" palette
 * (docs/architecture/STYLE_GUIDE.md).
 *
 * Light mode is neutral, as on the web: a cool near-white page (`cream`), white
 * cards and slate text. Amber is the accent, kept for actions and highlights
 * rather than spread across every surface. Dark mode is navy with gold.
 */
import { useColorScheme } from 'react-native';

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
  success: string;
  warning: string;
  danger: string;
  info: string;
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
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  info: '#0369a1',
};

export const darkPalette: Palette = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceRaised: '#334155',
  border: '#334155',
  text: '#f8fafc',
  textMuted: '#cbd5e1',
  primary: '#fbbf24',
  onPrimary: '#0f172a',
  accent: '#f59e0b',
  tint: 'rgba(251, 191, 36, 0.16)',
  hero: '#1e293b',
  onHero: '#f8fafc',
  heroMuted: '#cbd5e1',
  heroAccent: '#fbbf24',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#7dd3fc',
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

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? darkPalette : lightPalette;
}

export function useTypeColors(): (typeof typeColors)['light' | 'dark'] {
  return useColorScheme() === 'dark' ? typeColors.dark : typeColors.light;
}
