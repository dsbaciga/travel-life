/**
 * The Android icons are drawn from hard-coded code points (to avoid a blank
 * first frame), so they must match the Material Symbols font that ships with
 * `expo-symbols`. An `expo-symbols` upgrade that moves a glyph fails here
 * rather than drawing the wrong icon.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { GLYPHS } from '../iconGlyphs';

const require = createRequire(import.meta.url);
const symbols = require('../../../node_modules/expo-symbols/build/android/symbols.json') as Record<string, number>;

describe('icon glyphs', () => {
  it('uses the font’s own code point for every Android symbol', () => {
    for (const [name, glyph] of Object.entries(GLYPHS)) {
      expect(symbols[glyph.android], `${name} -> ${glyph.android}`).toBe(glyph.code);
    }
  });
});
