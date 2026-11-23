import { useMemo } from 'react';
import { useIsDarkMode } from '../store/themeStore';
import { tripTint, type TripTint } from '../utils/vendored/tripTint';

export interface TripTints {
  /**
   * Deep colours for gradient overlays on a cover photo. Always the dark recipe,
   * because the overlay carries white text whatever the page theme is.
   */
  hero: TripTint | null;
  /** Accents (stripe, border, wash) matched to the current page theme. */
  accent: TripTint | null;
}

/** Turns a trip's `coverColor` into its tints. Both are null when it has none. */
export function useTripTint(coverColor: string | null | undefined): TripTints {
  const isDark = useIsDarkMode();
  return useMemo(
    () => ({
      hero: tripTint(coverColor, 'dark'),
      accent: tripTint(coverColor, isDark ? 'dark' : 'light'),
    }),
    [coverColor, isDark]
  );
}

/** `#rrggbb` plus an opacity (0-1) as an 8-digit hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0')}`;
}

/**
 * Tinted stand-in for a photo overlay's black gradient: `stops` run from the
 * first colour (alpha, `from`/`to` pick heroFrom or heroTo) along `direction`.
 */
export function tintOverlay(
  hero: TripTint,
  direction: 'to bottom' | 'to top',
  stops: ReadonlyArray<{ color: 'from' | 'to'; alpha: number }>
): string {
  const parts = stops.map(({ color, alpha }) =>
    withAlpha(color === 'from' ? hero.heroFrom : hero.heroTo, alpha)
  );
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}
