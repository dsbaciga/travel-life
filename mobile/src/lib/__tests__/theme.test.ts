import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/nodeSqliteDriver';
import { configureThemeDb, darkPalette, DUSK, lightPalette, typeColors, useThemeStore } from '../theme';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme store and palettes', () => {
  it('defaults to system preference', () => {
    expect(useThemeStore.getState().preference).toBe('system');
  });

  it('updates preference on setPreference and persists to SQLite', async () => {
    const db = await createTestDb();
    configureThemeDb(async () => db);

    await useThemeStore.getState().setPreference('dark');
    expect(useThemeStore.getState().preference).toBe('dark');

    // Reset store state and re-hydrate from db
    useThemeStore.setState({ preference: 'system', hydrated: false });
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preference).toBe('dark');

    await useThemeStore.getState().setPreference('light');
    expect(useThemeStore.getState().preference).toBe('light');

    await useThemeStore.getState().setPreference('system');
    expect(useThemeStore.getState().preference).toBe('system');
    db.close();
  });

  it('provides complete light and dark palettes', () => {
    const requiredKeys: (keyof typeof lightPalette)[] = [
      'background',
      'surface',
      'surfaceRaised',
      'border',
      'text',
      'textMuted',
      'primary',
      'onPrimary',
      'accent',
      'tint',
      'hero',
      'onHero',
      'heroMuted',
      'heroAccent',
      'heroWash',
      'success',
      'warning',
      'danger',
      'info',
    ];

    for (const key of requiredKeys) {
      expect(lightPalette[key]).toBeDefined();
      expect(darkPalette[key]).toBeDefined();
      expect(typeof lightPalette[key]).toBe('string');
      expect(typeof darkPalette[key]).toBe('string');
    }
  });

  it('provides type colors for both modes', () => {
    const types = ['ACTIVITY', 'TRANSPORTATION', 'LODGING', 'CUSTOM_ITEM'] as const;
    for (const type of types) {
      expect(typeColors.light[type]).toHaveLength(2);
      expect(typeColors.dark[type]).toHaveLength(2);
    }
  });

  it('builds the dark palette from the dusk ramp', () => {
    expect(darkPalette.background).toBe(DUSK[900]);
    expect(darkPalette.surface).toBe(DUSK[800]);
    expect(darkPalette.border).toBe(DUSK[700]);
    expect(darkPalette.hero).toBe(DUSK[950]);
    expect(DUSK[900]).toBe('#151820');
  });

  it('keeps dark text readable (WCAG AA, 4.5:1)', () => {
    expect(contrast(darkPalette.text, darkPalette.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkPalette.textMuted, darkPalette.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkPalette.onHero, darkPalette.hero)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkPalette.heroMuted, darkPalette.hero)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkPalette.heroMuted, darkPalette.heroWash)).toBeGreaterThanOrEqual(4.5);
  });
});
