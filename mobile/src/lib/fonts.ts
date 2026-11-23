/**
 * Typography, matching the web app: Crimson Pro for display text (titles and
 * headings) and Manrope for everything else (`frontend/tailwind.config.js`).
 *
 * The font files are loaded in `app/_layout.tsx`; this module only knows the
 * family names, so it stays free of asset imports (and testable). On Android a
 * custom font needs its weight-specific family name and no `fontWeight`,
 * otherwise Android fakes a bold. Until the fonts have loaded (or if they
 * never do) the helpers return the system font with a plain `fontWeight`.
 */
import type { TextStyle } from 'react-native';
import { create } from 'zustand';

export type FontKind = 'display' | 'displayItalic' | 'body';
export type FontWeightName = '400' | '500' | '600' | '700';

const FAMILIES: Record<FontKind, Partial<Record<FontWeightName, string>>> = {
  display: { '600': 'CrimsonPro_600SemiBold', '700': 'CrimsonPro_700Bold' },
  displayItalic: { '400': 'CrimsonPro_400Regular_Italic' },
  body: {
    '400': 'Manrope_400Regular',
    '500': 'Manrope_500Medium',
    '600': 'Manrope_600SemiBold',
    '700': 'Manrope_700Bold',
  },
};

interface FontStore {
  ready: boolean;
  setReady: () => void;
}

export const useFontStore = create<FontStore>((set) => ({
  ready: false,
  setReady: () => set({ ready: true }),
}));

/** `fontFamily` once the fonts are loaded, else the system font with `fontWeight`. */
export function fontStyle(kind: FontKind, weight: FontWeightName, ready: boolean): TextStyle {
  const family = ready ? FAMILIES[kind][weight] : undefined;
  if (family) return { fontFamily: family };
  return { fontWeight: weight === '400' ? 'normal' : weight };
}
