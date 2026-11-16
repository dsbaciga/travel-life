/**
 * Immich request schemas
 *
 * Test cases:
 * - IMT-001: Filters accept calendar dates and reject malformed or impossible ones
 * - IMT-002: A reversed date range is rejected
 * - IMT-003: Unknown timezones and path-like album ids are rejected
 * - IMT-004: Browse defaults to page 1 / 50 and caps the page size at 200
 * - IMT-005: Export refuses anything but an explicit confirm: true
 */
import { describe, it, expect } from '@jest/globals';
import {
  immichFiltersSchema,
  immichBrowseSchema,
  immichExportSchema,
  immichAlbumLinkSchema,
} from '../immich.types';

describe('immich.types', () => {
  it('IMT-001: validates calendar dates', () => {
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-01-05', dateTo: '2026-01-10' }).success).toBe(true);
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-1-5' }).success).toBe(false);
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-02-30' }).success).toBe(false);
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-01-05T00:00:00Z' }).success).toBe(false);
  });

  it('IMT-002: rejects a reversed range', () => {
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-01-10', dateTo: '2026-01-05' }).success).toBe(false);
    expect(immichFiltersSchema.safeParse({ dateFrom: '2026-01-05', dateTo: '2026-01-05' }).success).toBe(true);
  });

  it('IMT-003: rejects unknown timezones and unsafe ids', () => {
    expect(immichFiltersSchema.safeParse({ timezone: 'Asia/Tokyo' }).success).toBe(true);
    expect(immichFiltersSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(immichFiltersSchema.safeParse({ albumId: '../../users' }).success).toBe(false);
    expect(immichFiltersSchema.safeParse({ albumId: '3f2a9c1e-7b1d-4c55-9e0a-0d3f2a9c1e7b' }).success).toBe(true);
    expect(immichAlbumLinkSchema.safeParse({ immichAlbumId: 'a/b' }).success).toBe(false);
    expect(immichAlbumLinkSchema.safeParse({ immichAlbumId: null }).success).toBe(true);
  });

  it('IMT-004: browse defaults and caps', () => {
    const parsed = immichBrowseSchema.parse({});
    expect(parsed).toMatchObject({ page: 1, size: 50, filters: {} });
    expect(immichBrowseSchema.safeParse({ size: 201 }).success).toBe(false);
    expect(immichBrowseSchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('IMT-005: export needs an explicit confirm', () => {
    expect(immichExportSchema.safeParse({}).success).toBe(false);
    expect(immichExportSchema.safeParse({ confirm: false }).success).toBe(false);
    expect(immichExportSchema.safeParse({ confirm: 'true' }).success).toBe(false);
    expect(immichExportSchema.safeParse({ confirm: true }).success).toBe(true);
  });
});
