/**
 * Booking Deadline Schema Tests
 *
 * Test cases:
 * - BDLT-001: A deadline attached to a booking needs no title
 * - BDLT-002: A standalone deadline (no booking) needs a title
 * - BDLT-003: entityType and entityId must be given together
 * - BDLT-004: A title cannot be empty or longer than 200 characters
 * - BDLT-005: The update schema accepts a title
 */

import { describe, it, expect } from '@jest/globals';
import {
  createBookingDeadlineSchema,
  updateBookingDeadlineSchema,
} from '../../types/bookingDeadline.types';

const base = { kind: 'other', dueAt: '2026-12-01T12:00:00Z' } as const;
const issuePaths = (input: unknown): string[] => {
  const result = createBookingDeadlineSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('createBookingDeadlineSchema', () => {
  it('BDLT-001: a deadline attached to a booking needs no title', () => {
    expect(
      createBookingDeadlineSchema.safeParse({ ...base, entityType: 'lodging', entityId: 7 }).success
    ).toBe(true);
    // A title is allowed too, and a null one.
    expect(
      createBookingDeadlineSchema.safeParse({ ...base, entityType: 'activity', entityId: 2, title: null }).success
    ).toBe(true);
  });

  it('BDLT-002: a standalone deadline needs a title', () => {
    expect(createBookingDeadlineSchema.safeParse({ ...base, title: 'Renew passport' }).success).toBe(true);
    expect(issuePaths(base)).toEqual(['title']);
    expect(issuePaths({ ...base, title: null })).toEqual(['title']);
    expect(issuePaths({ ...base, title: '   ' })).toEqual(['title']);
  });

  it('BDLT-003: entityType and entityId must be given together', () => {
    expect(issuePaths({ ...base, title: 'x', entityType: 'lodging' })).toEqual(['entityId']);
    expect(issuePaths({ ...base, title: 'x', entityId: 7 })).toEqual(['entityType']);
  });

  it('BDLT-004: a title cannot be empty or longer than 200 characters', () => {
    expect(createBookingDeadlineSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(createBookingDeadlineSchema.safeParse({ ...base, title: 'x'.repeat(200) }).success).toBe(true);
    expect(createBookingDeadlineSchema.safeParse({ ...base, title: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('updateBookingDeadlineSchema', () => {
  it('BDLT-005: accepts a title', () => {
    expect(updateBookingDeadlineSchema.safeParse({ title: 'Renew passport' }).success).toBe(true);
    expect(updateBookingDeadlineSchema.safeParse({ title: null }).success).toBe(true);
    expect(updateBookingDeadlineSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
  });
});
