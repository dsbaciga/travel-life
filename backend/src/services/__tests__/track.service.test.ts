/**
 * Track Service Tests
 *
 * Test cases:
 * - TRK-001: Batch ingest requires edit permission and stores points for the caller
 * - TRK-002: Batch ingest collapses duplicate timestamps and reports stored count
 * - TRK-003: Access control - a denied trip writes nothing
 * - TRK-004: Day track is bounded by the trip-zone calendar day and scoped to the caller
 * - TRK-005: Day track rejects a malformed date
 * - TRK-006: Timezone resolution falls through trip then user
 * - TRK-007: Photo inference interpolates a position and proposes the nearest location
 * - TRK-008: Photos with no fix inside the gap window are left unmatched
 * - TRK-009: Inference is read-only by default (view permission, no writes)
 * - TRK-010: apply=true needs edit permission, updates photos and creates TAKEN_AT links in one transaction
 * - TRK-011: No candidate photos short-circuits without loading the track
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const tx = {
  photo: { update: jest.fn() },
  entityLink: { createMany: jest.fn() },
};

const mockPrisma = {
  tripTrackPoint: { createMany: jest.fn(), findMany: jest.fn() },
  trip: { findUnique: jest.fn() },
  photo: { findMany: jest.fn() },
  location: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
}));

const mockGetUserTimezone = jest.fn();
jest.mock('../_shared/timezoneResolution', () => {
  const actual = jest.requireActual('../_shared/timezoneResolution') as Record<string, unknown>;
  return { ...actual, getUserTimezone: (...args: unknown[]) => mockGetUserTimezone(...args) };
});

import trackService from '../track.service';
import { AppError } from '../../errors/errors';

const USER = 1;
const TRIP = 10;

const fix = (iso: string, latitude: number, longitude: number) => ({
  latitude,
  longitude,
  recordedAt: new Date(iso),
});

describe('TrackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue({ trip: { id: TRIP, userId: USER } } as never);
    mockGetUserTimezone.mockResolvedValue('America/Denver' as never);
    mockPrisma.$transaction.mockImplementation(((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) as never);
  });

  describe('ingestBatch', () => {
    it('TRK-001: requires edit permission and stores points for the caller', async () => {
      mockPrisma.tripTrackPoint.createMany.mockResolvedValue({ count: 2 } as never);

      const result = await trackService.ingestBatch(USER, TRIP, {
        points: [
          { latitude: 45.1, longitude: 12.1, recordedAt: '2026-06-01T10:00:00Z', accuracy: 8 },
          { latitude: 45.2, longitude: 12.2, recordedAt: '2026-06-01T10:01:00Z' },
        ],
      });

      expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'edit');
      expect(result).toEqual({ received: 2, stored: 2 });
      const arg = mockPrisma.tripTrackPoint.createMany.mock.calls[0][0] as {
        data: Array<Record<string, unknown>>;
        skipDuplicates: boolean;
      };
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data[0]).toEqual({
        tripId: TRIP,
        userId: USER,
        latitude: 45.1,
        longitude: 12.1,
        accuracy: 8,
        altitude: null,
        speed: null,
        recordedAt: new Date('2026-06-01T10:00:00Z'),
      });
    });

    it('TRK-002: collapses duplicate timestamps within a batch', async () => {
      mockPrisma.tripTrackPoint.createMany.mockResolvedValue({ count: 1 } as never);

      const result = await trackService.ingestBatch(USER, TRIP, {
        points: [
          { latitude: 1, longitude: 1, recordedAt: '2026-06-01T10:00:00Z' },
          // Same instant, different notation.
          { latitude: 2, longitude: 2, recordedAt: '2026-06-01T12:00:00+02:00' },
        ],
      });

      const arg = mockPrisma.tripTrackPoint.createMany.mock.calls[0][0] as { data: unknown[] };
      expect(arg.data).toHaveLength(1);
      expect(result).toEqual({ received: 2, stored: 1 });
    });

    it('TRK-003: access control - a denied trip writes nothing', async () => {
      mockVerifyTrip.mockRejectedValue(new AppError('Insufficient permissions', 403) as never);

      await expect(
        trackService.ingestBatch(USER, TRIP, {
          points: [{ latitude: 1, longitude: 1, recordedAt: '2026-06-01T10:00:00Z' }],
        })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.tripTrackPoint.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getTrackForDay', () => {
    it('TRK-004: bounds the query by the trip-zone calendar day, scoped to the caller', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ timezone: 'Asia/Tokyo' } as never);
      mockPrisma.tripTrackPoint.findMany.mockResolvedValue([
        fix('2026-06-01T01:00:00Z', 35.6, 139.7),
        fix('2026-06-01T02:00:00Z', 35.7, 139.8),
      ] as never);

      const feature = await trackService.getTrackForDay(USER, TRIP, '2026-06-01');

      expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'view');
      const where = (mockPrisma.tripTrackPoint.findMany.mock.calls[0][0] as {
        where: { tripId: number; userId: number; recordedAt: { gte: Date; lt: Date } };
      }).where;
      expect(where.tripId).toBe(TRIP);
      expect(where.userId).toBe(USER);
      // June 1 in Tokyo (UTC+9) is 15:00Z May 31 to 15:00Z June 1.
      expect(where.recordedAt.gte.toISOString()).toBe('2026-05-31T15:00:00.000Z');
      expect(where.recordedAt.lt.toISOString()).toBe('2026-06-01T15:00:00.000Z');

      expect(feature.geometry).toEqual({
        type: 'LineString',
        coordinates: [
          [139.7, 35.6],
          [139.8, 35.7],
        ],
      });
      expect(feature.properties.timezone).toBe('Asia/Tokyo');
      expect(feature.properties.pointCount).toBe(2);
      expect(feature.properties.timestamps).toHaveLength(2);
    });

    it('TRK-005: rejects a malformed date', async () => {
      await expect(trackService.getTrackForDay(USER, TRIP, '06/01/2026')).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(trackService.getTrackForDay(USER, TRIP, '')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.tripTrackPoint.findMany).not.toHaveBeenCalled();
    });

    it('TRK-006: timezone resolution falls through trip then user', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ timezone: null } as never);
      mockPrisma.tripTrackPoint.findMany.mockResolvedValue([] as never);

      const viaUser = await trackService.getTrackForDay(USER, TRIP, '2026-06-01');
      expect(viaUser.properties.timezone).toBe('America/Denver');
      expect(viaUser.properties.startedAt).toBeNull();

      const explicit = await trackService.getTrackForDay(USER, TRIP, '2026-06-01', 'Europe/Rome');
      expect(explicit.properties.timezone).toBe('Europe/Rome');
    });
  });

  describe('inferPhotoLocations', () => {
    const track = [
      fix('2026-06-01T10:00:00Z', 45.434, 12.338),
      fix('2026-06-01T10:10:00Z', 45.436, 12.34),
    ];
    const locations = [
      { id: 50, name: 'Rialto Bridge', latitude: 45.435, longitude: 12.339 },
      { id: 51, name: 'Far Away', latitude: 46.5, longitude: 13.5 },
    ];

    beforeEach(() => {
      mockPrisma.tripTrackPoint.findMany.mockResolvedValue(track as never);
      mockPrisma.location.findMany.mockResolvedValue(locations as never);
    });

    it('TRK-007: interpolates a position and proposes the nearest location', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        { id: 1, takenAt: new Date('2026-06-01T10:05:00Z') },
      ] as never);

      const result = await trackService.inferPhotoLocations(USER, TRIP);

      expect(result.proposals).toHaveLength(1);
      const p = result.proposals[0];
      expect(p.photoId).toBe(1);
      expect(p.method).toBe('interpolated');
      expect(p.latitude).toBeCloseTo(45.435, 6);
      expect(p.longitude).toBeCloseTo(12.339, 6);
      expect(p.location).toMatchObject({ id: 50, name: 'Rialto Bridge' });
      expect(result.unmatched).toBe(0);

      // The track query is scoped to the caller's own trail.
      const trackWhere = (mockPrisma.tripTrackPoint.findMany.mock.calls[0][0] as {
        where: { userId: number };
      }).where;
      expect(trackWhere.userId).toBe(USER);
    });

    it('TRK-008: photos with no fix inside the gap window are left unmatched', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        { id: 1, takenAt: new Date('2026-06-01T10:05:00Z') },
        { id: 2, takenAt: new Date('2026-06-01T14:00:00Z') },
      ] as never);

      const result = await trackService.inferPhotoLocations(USER, TRIP);

      expect(result.proposals.map((p) => p.photoId)).toEqual([1]);
      expect(result.unmatched).toBe(1);
    });

    it('TRK-009: read-only by default', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        { id: 1, takenAt: new Date('2026-06-01T10:05:00Z') },
      ] as never);

      const result = await trackService.inferPhotoLocations(USER, TRIP, {});

      expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'view');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(result.applied).toBe(0);
    });

    it('TRK-010: apply needs edit permission and writes photo + link transactionally', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        { id: 1, takenAt: new Date('2026-06-01T10:05:00Z') },
      ] as never);

      const result = await trackService.inferPhotoLocations(USER, TRIP, { apply: true, photoIds: [1] });

      expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'edit');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.photo.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { latitude: expect.any(Number), longitude: expect.any(Number) },
      });
      expect(tx.entityLink.createMany).toHaveBeenCalledWith({
        data: [
          {
            tripId: TRIP,
            sourceType: 'PHOTO',
            sourceId: 1,
            targetType: 'LOCATION',
            targetId: 50,
            relationship: 'TAKEN_AT',
          },
        ],
        skipDuplicates: true,
      });
      expect(result.applied).toBe(1);

      const photoWhere = (mockPrisma.photo.findMany.mock.calls[0][0] as {
        where: { id?: { in: number[] } };
      }).where;
      expect(photoWhere.id).toEqual({ in: [1] });
    });

    it('TRK-010b: apply is denied without edit permission and writes nothing', async () => {
      mockVerifyTrip.mockRejectedValue(new AppError('Insufficient permissions', 403) as never);
      await expect(
        trackService.inferPhotoLocations(USER, TRIP, { apply: true })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('TRK-011: no candidate photos short-circuits', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([] as never);
      const result = await trackService.inferPhotoLocations(USER, TRIP, { apply: true });
      expect(result).toEqual({ proposals: [], applied: 0, unmatched: 0 });
      expect(mockPrisma.tripTrackPoint.findMany).not.toHaveBeenCalled();
    });
  });
});
