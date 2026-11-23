/**
 * Trip tint
 *
 * Test cases:
 * - TINT-001: grey, near-black, near-white and malformed colours give null
 * - TINT-002: white text on heroFrom and heroTo is >= 4.5:1 for every hue and scheme
 * - TINT-003: output is a valid #rrggbb and keeps the cover's hue
 * - TINT-004: dark soft is deeper than light soft; heroTo is deeper than heroFrom
 */
import { describe, expect, it } from 'vitest';
import { tripTint, type TripTintScheme } from '../tripTint';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

const whiteContrast = (hex: string) => 1.05 / (luminance(hex) + 0.05);

function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const SCHEMES: TripTintScheme[] = ['dark', 'light'];

describe('tripTint', () => {
  it('TINT-001: falls back to null when there is no usable hue', () => {
    for (const scheme of SCHEMES) {
      expect(tripTint(null, scheme)).toBeNull();
      expect(tripTint(undefined, scheme)).toBeNull();
      expect(tripTint('', scheme)).toBeNull();
      expect(tripTint('not-a-colour', scheme)).toBeNull();
      expect(tripTint('#808080', scheme)).toBeNull(); // grey
      expect(tripTint('#7a7f80', scheme)).toBeNull(); // near grey
      expect(tripTint('#050505', scheme)).toBeNull(); // near black
      expect(tripTint('#fafafa', scheme)).toBeNull(); // near white
    }
  });

  it('TINT-002: keeps white text readable on both hero stops for every hue', () => {
    for (const scheme of SCHEMES) {
      for (let h = 0; h < 360; h += 3) {
        for (const [s, l] of [
          [1, 0.5],
          [0.9, 0.7],
          [0.5, 0.4],
          [0.2, 0.5],
          [1, 0.2],
        ]) {
          const n = hslHex(h, s, l);
          const tint = tripTint(n, scheme);
          if (!tint) continue;
          expect(whiteContrast(tint.heroFrom)).toBeGreaterThanOrEqual(4.5);
          expect(whiteContrast(tint.heroTo)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('TINT-003: returns valid hex colours in the cover hue', () => {
    const tint = tripTint('#2a7fbf', 'dark');
    expect(tint).not.toBeNull();
    for (const value of Object.values(tint!)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
      expect(Math.abs(hue(value) - hue('#2a7fbf'))).toBeLessThan(6);
    }
  });

  it('TINT-004: orders the colours sensibly', () => {
    const dark = tripTint('#c0392b', 'dark')!;
    const light = tripTint('#c0392b', 'light')!;
    expect(luminance(dark.heroTo)).toBeLessThan(luminance(dark.heroFrom));
    expect(luminance(light.heroTo)).toBeLessThan(luminance(light.heroFrom));
    expect(luminance(dark.soft)).toBeLessThan(luminance(light.soft));
    expect(tripTint('#C0392B', 'dark')).toEqual(dark);
    expect(tripTint('c0392b', 'dark')).toEqual(dark);
  });
});

/** HSL to #rrggbb, independent of the implementation under test. */
function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
