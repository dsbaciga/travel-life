import { describe, expect, it } from 'vitest';
import { contourStroke } from '../contourStroke';
import { darkPalette, lightPalette } from '../theme';

describe('contourStroke', () => {
  it('uses the hero accent at 10% on a hero in both schemes', () => {
    expect(contourStroke(lightPalette, false, true)).toEqual({ color: lightPalette.heroAccent, opacity: 0.1 });
    expect(contourStroke(darkPalette, true, true)).toEqual({ color: darkPalette.heroAccent, opacity: 0.1 });
  });

  it('keeps the scheme-based stroke off a hero', () => {
    expect(contourStroke(lightPalette, false, false)).toEqual({ color: lightPalette.text, opacity: 0.06 });
    expect(contourStroke(darkPalette, true, false)).toEqual({ color: darkPalette.primary, opacity: 0.08 });
  });
});
