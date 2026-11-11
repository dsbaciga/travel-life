/**
 * Booking Deadline Service Tests
 *
 * Test cases:
 * - BDL-001: Create links the deadline to the right booking FK and returns entityType/entityId
 * - BDL-002: Create rejects a booking that is not in the trip
 * - BDL-003: Update dismiss/restore toggles dismissedAt
 * - BDL-004: Moving dueAt re-arms the push reminder (notifiedAt cleared)
 * - BDL-005: Update/delete of a deadline from another trip is a 404
 * - BDL-006: Upcoming excludes dismissed deadlines and is scoped to the user's trips
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  bookingDeadline: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityInTrip: (...args: unknown[]) => mockVerifyEntity(...args),
}));

import bookingDeadlineService from '../bookingDeadline.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  tripId: 10,
  lodgingId: 7,
  transportationId: null,
  activityId: null,
  kind: 'cancellation',
  dueAt: new Date('2026-12-01T12:00:00Z'),
  note: null,
  dismissedAt: null,
  notifiedAt: new Date('2026-11-30T12:00:00Z'),
  ...overrides,
});

describe('BookingDeadlineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue({ trip: { id: 10, userId: 1 } });
    mockVerifyEntity.mockResolvedValue(undefined);
  });

  describe('BDL-001: create', () => {
    it('sets the matching FK and derives entityType/entityId', async () => {
      mockPrisma.bookingDeadline.create.mockResolvedValue(row({ transportationId: 3, lodgingId: null }));

      const result = await bookingDeadlineService.createDeadline(1, 10, {
        entityType: 'transportation',
        entityId: 3,
        kind: 'check_in',
        dueAt: '2026-12-01T12:00:00Z',
      });

      const data = mockPrisma.bookingDeadline.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.data.transportationId).toBe(3);
      expect(data.data.lodgingId).toBeUndefined();
      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      expect(result.entityType).toBe('transportation');
      expect(result.entityId).toBe(3);
    });
  });

  describe('BDL-002: create rejects foreign bookings', () => {
    it('propagates the not-found error and writes nothing', async () => {
      mockVerifyEntity.mockRejectedValue(new Error('Lodging not found or does not belong to trip'));
      await expect(
        bookingDeadlineService.createDeadline(1, 10, {
          entityType: 'lodging',
          entityId: 99,
          kind: 'payment',
          dueAt: '2026-12-01T12:00:00Z',
        })
      ).rejects.toThrow('not found');
      expect(mockPrisma.bookingDeadline.create).not.toHaveBeenCalled();
    });
  });

  describe('BDL-003: dismiss and restore', () => {
    it('stamps dismissedAt on dismiss and clears it on restore', async () => {
      mockPrisma.bookingDeadline.findFirst.mockResolvedValue(row());
      mockPrisma.bookingDeadline.update.mockResolvedValue(row());

      await bookingDeadlineService.updateDeadline(1, 10, 5, { dismissed: true });
      const dismiss = mockPrisma.bookingDeadline.update.mock.calls[0][0] as { data: { dismissedAt: unknown } };
      expect(dismiss.data.dismissedAt).toBeInstanceOf(Date);

      await bookingDeadlineService.updateDeadline(1, 10, 5, { dismissed: false });
      const restore = mockPrisma.bookingDeadline.update.mock.calls[1][0] as { data: { dismissedAt: unknown } };
      expect(restore.data.dismissedAt).toBeNull();
    });
  });

  describe('BDL-004: moving dueAt re-arms the reminder', () => {
    it('clears notifiedAt when dueAt changes, but not when it is unchanged', async () => {
      mockPrisma.bookingDeadline.findFirst.mockResolvedValue(row());
      mockPrisma.bookingDeadline.update.mockResolvedValue(row());

      await bookingDeadlineService.updateDeadline(1, 10, 5, { dueAt: '2026-12-05T12:00:00Z' });
      const moved = mockPrisma.bookingDeadline.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(moved.data.notifiedAt).toBeNull();

      await bookingDeadlineService.updateDeadline(1, 10, 5, { dueAt: '2026-12-01T12:00:00Z' });
      const same = mockPrisma.bookingDeadline.update.mock.calls[1][0] as { data: Record<string, unknown> };
      expect('notifiedAt' in same.data).toBe(false);
    });
  });

  describe('BDL-005: cross-trip access', () => {
    it('returns 404 for update and delete of a deadline outside the trip', async () => {
      mockPrisma.bookingDeadline.findFirst.mockResolvedValue(null);
      await expect(bookingDeadlineService.updateDeadline(1, 10, 5, { kind: 'other' })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(bookingDeadlineService.deleteDeadline(1, 10, 5)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.bookingDeadline.delete).not.toHaveBeenCalled();
    });
  });

  describe('BDL-006: upcoming', () => {
    it('filters out dismissed deadlines and scopes to owned or collaborated trips', async () => {
      mockPrisma.bookingDeadline.findMany.mockResolvedValue([row()]);

      const result = await bookingDeadlineService.getUpcoming(1, 14);

      const where = (mockPrisma.bookingDeadline.findMany.mock.calls[0][0] as {
        where: { dismissedAt: unknown; trip: { OR: unknown[] } };
      }).where;
      expect(where.dismissedAt).toBeNull();
      expect(where.trip.OR).toEqual([{ userId: 1 }, { collaborators: { some: { userId: 1 } } }]);
      expect(result[0].entityType).toBe('lodging');
    });
  });
});
