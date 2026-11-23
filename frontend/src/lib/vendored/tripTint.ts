// GENERATED FILE - DO NOT EDIT.
// Vendored from packages/shared/src/utils/tripTint.ts by packages/shared/scripts/sync-vendored.mjs.
// Edit the source and re-run the script.

/**
 * Per-trip accent tint.
 *
 * The backend stores a trip's dominant cover colour (`Trip.coverColor`, `#rrggbb`).
 * A raw dominant colour is unusable as a UI colour (it may be near-black, grey or
 * glaring), so every surface runs it through `tripTint`, which clamps it in HSL
 * to colours that are safe behind white text. Pure, no imports: this file is
 * vendored into the backend and the web app by `npm run sync:vendored`.
 */

export type TripTintScheme = 'dark' | 'light';

export interface TripTint {
  /** Start of the hero gradient. White text on it is always >= 4.5:1. */
  heroFrom: string;
  /** End of the hero gradient, a step deeper than `heroFrom`. White text >= 4.5:1. */
  heroTo: string;
  /** A quiet surface wash: deep in dark mode, pale in light mode. */
  soft: string;
  /** A border / stripe accent that is visible against the page in that scheme. */
  ring: string;
}

/** Below this saturation a colour is grey: it carries no hue worth using. */
export const TINT_MIN_SATURATION = 0.15;
/** Below this lightness (near black) or above the max (near white) the hue is meaningless. */
export const TINT_MIN_LIGHTNESS = 0.08;
export const TINT_MAX_LIGHTNESS = 0.95;

interface Clamp {
  sat: readonly [number, number];
  light: number;
}

// Saturation range and fixed lightness for each output, per scheme. Lightness is
// fixed (not clamped) so every cover lands on the same visual weight; the hero
// values are low enough that white text clears 4.5:1 for any hue (see the tests).
const RECIPE: Record<TripTintScheme, Record<keyof TripTint, Clamp>> = {
  dark: {
    heroFrom: { sat: [0.35, 0.7], light: 0.22 },
    heroTo: { sat: [0.35, 0.65], light: 0.13 },
    soft: { sat: [0.25, 0.5], light: 0.16 },
    ring: { sat: [0.45, 0.75], light: 0.62 },
  },
  light: {
    heroFrom: { sat: [0.3, 0.6], light: 0.3 },
    heroTo: { sat: [0.3, 0.6], light: 0.2 },
    soft: { sat: [0.35, 0.75], light: 0.94 },
    ring: { sat: [0.4, 0.7], light: 0.42 },
  },
};

const HEX = /^#?([0-9a-f]{6})$/i;

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  const channel = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Normalises a dominant cover colour into the colours a trip's hero surfaces need.
 *
 * Returns null for anything without a usable hue (missing or malformed input,
 * greys, near-black, near-white): callers then keep their default look.
 */
export function tripTint(hex: string | null | undefined, scheme: TripTintScheme): TripTint | null {
  if (!hex) return null;
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  if (hsl.s < TINT_MIN_SATURATION || hsl.l < TINT_MIN_LIGHTNESS || hsl.l > TINT_MAX_LIGHTNESS) {
    return null;
  }
  const recipe = RECIPE[scheme];
  const build = (key: keyof TripTint) => hslToHex(hsl.h, clamp(hsl.s, recipe[key].sat), recipe[key].light);
  return {
    heroFrom: build('heroFrom'),
    heroTo: build('heroTo'),
    soft: build('soft'),
    ring: build('ring'),
  };
}
