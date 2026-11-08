/**
 * QueryClient Setup Tests
 *
 * Test cases:
 * - QCS-001: PERSISTABLE_QUERY_KEYS includes all core and offline-critical query keys
 * - QCS-002: shouldPersistQuery accepts persistable keys and prefix-hyphenated variants
 * - QCS-003: shouldPersistQuery rejects non-persistable, empty, and non-string keys
 * - QCS-004: dehydrateQueryFilter only persists successful queries with persistable keys
 */

import { describe, it, expect } from 'vitest';
import {
  PERSISTABLE_QUERY_KEYS,
  shouldPersistQuery,
  dehydrateQueryFilter,
} from '../queryClientSetup';

describe('queryClientSetup', () => {
  it('QCS-001: PERSISTABLE_QUERY_KEYS includes all core and offline-critical query keys', () => {
    const requiredKeys = [
      'trips',
      'trip',
      'locations',
      'activities',
      'lodging',
      'transportation',
      'photos',
      'albums',
      'journal',
      'companions',
      'tags',
      'checklists',
      'savedLinks',
      'customItems',
      'budget-summary',
      'expenses',
      'emergency-card',
      'tripSeries',
      'user',
      'settings',
    ];

    for (const key of requiredKeys) {
      expect(PERSISTABLE_QUERY_KEYS).toContain(key);
    }
  });

  it('QCS-002: shouldPersistQuery accepts persistable keys and prefix-hyphenated variants', () => {
    expect(shouldPersistQuery(['trip', 123])).toBe(true);
    expect(shouldPersistQuery(['customItems', 123])).toBe(true);
    expect(shouldPersistQuery(['budget-summary', 123])).toBe(true);
    expect(shouldPersistQuery(['expenses', 123])).toBe(true);
    expect(shouldPersistQuery(['emergency-card', 123])).toBe(true);
    expect(shouldPersistQuery(['tripSeries', 5])).toBe(true);
    expect(shouldPersistQuery(['trip-stats', 123])).toBe(true);
  });

  it('QCS-003: shouldPersistQuery rejects non-persistable, empty, and non-string keys', () => {
    expect(shouldPersistQuery([])).toBe(false);
    expect(shouldPersistQuery([123])).toBe(false);
    expect(shouldPersistQuery(['weather', 123])).toBe(false);
    expect(shouldPersistQuery(['flight-status', 'AA100'])).toBe(false);
  });

  it('QCS-004: dehydrateQueryFilter only persists successful queries with persistable keys', () => {
    expect(
      dehydrateQueryFilter({
        queryKey: ['emergency-card', 1],
        state: { status: 'success', data: {} },
      })
    ).toBe(true);

    expect(
      dehydrateQueryFilter({
        queryKey: ['customItems', 1],
        state: { status: 'pending' },
      })
    ).toBe(false);

    expect(
      dehydrateQueryFilter({
        queryKey: ['expenses', 1],
        state: { status: 'error' },
      })
    ).toBe(false);

    expect(
      dehydrateQueryFilter({
        queryKey: ['ephemeral-cache', 1],
        state: { status: 'success', data: {} },
      })
    ).toBe(false);
  });
});
