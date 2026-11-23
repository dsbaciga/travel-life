/**
 * useTripTint
 *
 * Test cases:
 * - TTINT-001: a cover colour gives hero and accent tints; none or grey gives null
 * - TTINT-002: accent follows the page theme, hero stays on the dark recipe
 * - TTINT-003: tintOverlay builds a gradient from the hero colours with alpha
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTripTint, tintOverlay, withAlpha } from '../useTripTint';
import { useThemeStore } from '../../store/themeStore';
import { tripTint } from '../../lib/vendored/tripTint';

describe('useTripTint', () => {
  beforeEach(() => {
    useThemeStore.getState().setTheme('dark');
  });

  it('TTINT-001: returns null tints without a usable colour', () => {
    expect(renderHook(() => useTripTint(null)).result.current).toEqual({ hero: null, accent: null });
    expect(renderHook(() => useTripTint('#808080')).result.current).toEqual({ hero: null, accent: null });
    const { result } = renderHook(() => useTripTint('#2a7fbf'));
    expect(result.current.hero).not.toBeNull();
    expect(result.current.accent).not.toBeNull();
  });

  it('TTINT-002: accent follows the theme while hero stays dark-recipe', () => {
    const { result } = renderHook(() => useTripTint('#2a7fbf'));
    expect(result.current.accent).toEqual(tripTint('#2a7fbf', 'dark'));
    act(() => useThemeStore.getState().setTheme('light'));
    expect(result.current.accent).toEqual(tripTint('#2a7fbf', 'light'));
    expect(result.current.hero).toEqual(tripTint('#2a7fbf', 'dark'));
  });

  it('TTINT-003: builds an alpha gradient from the hero colours', () => {
    const hero = tripTint('#2a7fbf', 'dark')!;
    expect(withAlpha('#112233', 0.5)).toBe('#11223380');
    const css = tintOverlay(hero, 'to top', [
      { color: 'to', alpha: 1 },
      { color: 'from', alpha: 0 },
    ]);
    expect(css).toBe(`linear-gradient(to top, ${hero.heroTo}ff, ${hero.heroFrom}00)`);
  });
});
