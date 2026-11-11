/**
 * Colours and spacing, mirroring the web app's "Compass Gold" palette
 * (docs/architecture/STYLE_GUIDE.md): warm amber on light, navy + gold on dark.
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
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export const lightPalette: Palette = {
  background: '#fffbeb',
  surface: '#ffffff',
  surfaceRaised: '#fef3c7',
  border: '#fde68a',
  text: '#451a03',
  textMuted: '#92400e',
  primary: '#B45309',
  onPrimary: '#ffffff',
  accent: '#D97706',
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
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#7dd3fc',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/** Minimum touch target, per the style guide. */
export const TOUCH_TARGET = 44;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? darkPalette : lightPalette;
}
