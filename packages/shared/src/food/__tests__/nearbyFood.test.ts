/**
 * Nearby food: diet matching and formatting
 *
 * Test cases:
 * - FOOD-001: diet:<x> values are read as only / yes / limited / no, and silence is unknown
 * - FOOD-002: Older bare tags (vegan=yes) count too, and the stronger statement wins
 * - FOOD-003: cuisine=vegan / vegetarian / halal / kosher is evidence
 * - FOOD-004: A vegan place is vegetarian; either suits a pescatarian (but is not "only")
 * - FOOD-005: No vegetarian means no vegan, but no vegan says nothing about vegetarian
 * - FOOD-006: dietaryProfile lists only the diets a place says something about
 * - FOOD-007: Ranking and badge wording
 * - FOOD-008: formatDistance and label helpers
 */
import { describe, expect, it } from 'vitest';
import {
  DIETARY_LABELS,
  DIETARY_RESTRICTIONS,
  cuisineLabel,
  dietBadge,
  dietMatch,
  dietMatchRank,
  dietaryProfile,
  foodCategoryLabel,
  formatDistance,
  type DietMatch,
} from '../nearbyFood';

describe('dietMatch', () => {
  it('FOOD-001: reads diet:<x> values and treats silence as unknown', () => {
    expect(dietMatch({ 'diet:vegan': 'only' }, 'vegan')).toBe('only');
    expect(dietMatch({ 'diet:vegan': 'yes' }, 'vegan')).toBe('yes');
    expect(dietMatch({ 'diet:vegan': 'limited' }, 'vegan')).toBe('limited');
    expect(dietMatch({ 'diet:vegan': 'no' }, 'vegan')).toBe('no');
    // Case and spacing are mapper noise; an unrecognised value says nothing.
    expect(dietMatch({ 'diet:vegan': ' Yes ' }, 'vegan')).toBe('yes');
    expect(dietMatch({ 'diet:vegan': 'sometimes' }, 'vegan')).toBe('unknown');
    // No tags at all is not the same as "no".
    expect(dietMatch({ name: 'Cafe', amenity: 'cafe' }, 'vegan')).toBe('unknown');
    for (const diet of DIETARY_RESTRICTIONS) {
      expect(dietMatch({ [`diet:${diet}`]: 'yes' }, diet)).toBe('yes');
    }
  });

  it('FOOD-002: older bare tags count, and the stronger statement wins', () => {
    expect(dietMatch({ vegetarian: 'yes' }, 'vegetarian')).toBe('yes');
    expect(dietMatch({ halal: 'only' }, 'halal')).toBe('only');
    expect(dietMatch({ 'diet:kosher': 'limited', kosher: 'yes' }, 'kosher')).toBe('yes');
    // A positive statement beats an explicit no from the other spelling.
    expect(dietMatch({ 'diet:vegan': 'no', vegan: 'limited' }, 'vegan')).toBe('limited');
    // Diets with no older spelling ignore a bare tag.
    expect(dietMatch({ gluten_free: 'yes' }, 'gluten_free')).toBe('unknown');
  });

  it('FOOD-003: cuisine tags are evidence', () => {
    expect(dietMatch({ cuisine: 'vegan' }, 'vegan')).toBe('only');
    expect(dietMatch({ cuisine: 'italian;vegetarian' }, 'vegetarian')).toBe('only');
    expect(dietMatch({ cuisine: 'halal' }, 'halal')).toBe('yes');
    expect(dietMatch({ cuisine: 'Kosher' }, 'kosher')).toBe('yes');
    expect(dietMatch({ cuisine: 'italian' }, 'vegan')).toBe('unknown');
  });

  it('FOOD-004: a vegan place is vegetarian, and either suits a pescatarian', () => {
    expect(dietMatch({ 'diet:vegan': 'only' }, 'vegetarian')).toBe('only');
    expect(dietMatch({ 'diet:vegan': 'yes' }, 'vegetarian')).toBe('yes');
    expect(dietMatch({ 'diet:vegan': 'limited' }, 'vegetarian')).toBe('limited');
    // The other way round does not hold: vegetarian food is not necessarily vegan.
    expect(dietMatch({ 'diet:vegetarian': 'only' }, 'vegan')).toBe('unknown');

    expect(dietMatch({ 'diet:vegetarian': 'only' }, 'pescetarian')).toBe('yes');
    expect(dietMatch({ 'diet:vegan': 'only' }, 'pescetarian')).toBe('yes');
    expect(dietMatch({ 'diet:vegetarian': 'limited' }, 'pescetarian')).toBe('limited');
    expect(dietMatch({ 'diet:pescetarian': 'only' }, 'pescetarian')).toBe('only');
  });

  it('FOOD-005: no vegetarian means no vegan, but no vegan says nothing about vegetarian', () => {
    expect(dietMatch({ 'diet:vegetarian': 'no' }, 'vegan')).toBe('no');
    expect(dietMatch({ 'diet:vegan': 'no' }, 'vegetarian')).toBe('unknown');
    // A positive statement still wins over an inferred no.
    expect(dietMatch({ 'diet:vegetarian': 'no', 'diet:vegan': 'yes' }, 'vegan')).toBe('yes');
    expect(dietMatch({ 'diet:vegetarian': 'no', 'diet:vegan': 'yes' }, 'vegetarian')).toBe('yes');
  });

  it('FOOD-006: dietaryProfile lists only the diets a place says something about', () => {
    expect(dietaryProfile({ name: 'Plain' })).toEqual({});
    expect(dietaryProfile({ 'diet:vegan': 'yes', 'diet:gluten_free': 'limited', 'diet:halal': 'no' })).toEqual({
      vegan: 'yes',
      vegetarian: 'yes',
      pescetarian: 'yes',
      gluten_free: 'limited',
      halal: 'no',
    });
  });
});

describe('ranking and badges', () => {
  it('FOOD-007: ranks the best match first and explicit refusals last, with plain wording', () => {
    const order: DietMatch[] = ['unknown', 'no', 'limited', 'only', 'yes'];
    expect([...order].sort((a, b) => dietMatchRank(a) - dietMatchRank(b))).toEqual([
      'only',
      'yes',
      'limited',
      'unknown',
      'no',
    ]);

    expect(dietBadge('only', 'vegan')).toEqual({ label: 'Vegan only', tone: 'good' });
    expect(dietBadge('yes', 'gluten_free')).toEqual({ label: 'Gluten-free options', tone: 'good' });
    expect(dietBadge('limited', 'halal')).toEqual({ label: 'A few halal options', tone: 'ok' });
    expect(dietBadge('unknown', 'kosher')).toEqual({ label: 'Not confirmed', tone: 'unknown' });
    expect(dietBadge('no', 'vegetarian')).toEqual({ label: 'No vegetarian options', tone: 'bad' });
    expect(Object.keys(DIETARY_LABELS).sort()).toEqual([...DIETARY_RESTRICTIONS].sort());
  });

  it('FOOD-008: formats distances and labels', () => {
    expect(formatDistance(0)).toBe('5 m');
    expect(formatDistance(42)).toBe('40 m');
    expect(formatDistance(99)).toBe('100 m');
    expect(formatDistance(243)).toBe('240 m');
    expect(formatDistance(999)).toBe('1.0 km');
    expect(formatDistance(1240)).toBe('1.2 km');
    expect(formatDistance(12_400)).toBe('12 km');
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-5)).toBe('');

    expect(foodCategoryLabel('cafe')).toBe('Café');
    expect(foodCategoryLabel('something_else')).toBe('Food');
    expect(cuisineLabel('middle_eastern')).toBe('Middle eastern');
  });
});
