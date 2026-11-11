import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/nodeSqliteDriver';
import { configureThemeDb, darkPalette, lightPalette, typeColors, useThemeStore } from '../theme';

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
});
