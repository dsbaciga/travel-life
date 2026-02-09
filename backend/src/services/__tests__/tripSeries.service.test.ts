/**
 * TripSeries Service Tests
 *
 * Test cases:
 * - TS-001: Create a trip series
 * - TS-002: Get all series for a user
 * - TS-003: Get a series by ID
 * - TS-004: Update a trip series
 * - TS-005: Delete a trip series
 * - TS-006: Add a trip to a series
 * - TS-007: Remove a trip from a series
 * - TS-008: Reorder trips in a series
 * - TS-009: Ownership checks
 */

// Mock @prisma/client
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) { this.value = String(value); }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
      valueOf(): number { return this.toNumber(); }
    },
  },
}));

// Mock the database config
const mockPrisma = {
  tripSeries: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  trip: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock convertDecimals to pass through
jest.mock('../../utils/serviceHelpers', () => ({
  convertDecimals: jest.fn((obj: unknown) => obj),
}));

import tripSeriesService from '../tripSeries.service';

describe('TripSeriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default $transaction: handles both callback and array patterns
    mockPrisma.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return (input as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
      }
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input;
    });
  });

  const createMockSeries = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    name: 'European Tour',
    description: 'Multi-city European trip',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    _count: { trips: 3 },
    ...overrides,
  });

  const createMockTrip = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    title: 'Test Trip',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-10'),
    status: 'Planning',
    seriesId: null,
    seriesOrder: null,
    ...overrides,
  });

  // ============================================================
  // TS-001: Create a trip series
  // ============================================================
  describe('TS-001: Create a trip series', () => {
    it('should create a new trip series', async () => {
      const mockSeries = createMockSeries({ _count: { trips: 0 } });
      mockPrisma.tripSeries.create.mockResolvedValue(mockSeries);

      const result = await tripSeriesService.create(1, {
        name: 'European Tour',
        description: 'Multi-city European trip',
      });

      expect(mockPrisma.tripSeries.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          name: 'European Tour',
          description: 'Multi-city European trip',
        },
        include: {
          _count: { select: { trips: true } },
        },
      });
      expect(result.name).toBe('European Tour');
    });

    it('should create series with null description when not provided', async () => {
      const mockSeries = createMockSeries({ description: null });
      mockPrisma.tripSeries.create.mockResolvedValue(mockSeries);

      const result = await tripSeriesService.create(1, { name: 'Solo Tour' });

      expect(mockPrisma.tripSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: null }),
        })
      );
      expect(result.description).toBeNull();
    });
  });

  // ============================================================
  // TS-002: Get all series for a user
  // ============================================================
  describe('TS-002: Get all series for a user', () => {
    it('should return all series with trip counts and date ranges', async () => {
      const series = createMockSeries({
        trips: [
          createMockTrip({ id: 1, startDate: new Date('2025-06-01'), seriesOrder: 1 }),
          createMockTrip({ id: 2, startDate: new Date('2025-07-01'), seriesOrder: 2 }),
        ],
      });

      mockPrisma.tripSeries.findMany.mockResolvedValue([series]);

      const result = await tripSeriesService.getAll(1);

      expect(result.length).toBe(1);
      expect(result[0].earliestDate).toEqual(new Date('2025-06-01'));
      expect(result[0].latestDate).toEqual(new Date('2025-07-01'));
    });

    it('should return empty array when user has no series', async () => {
      mockPrisma.tripSeries.findMany.mockResolvedValue([]);

      const result = await tripSeriesService.getAll(1);

      expect(result).toEqual([]);
    });

    it('should handle series with trips that have no dates', async () => {
      const series = createMockSeries({
        trips: [
          createMockTrip({ id: 1, startDate: null, seriesOrder: 1 }),
        ],
      });

      mockPrisma.tripSeries.findMany.mockResolvedValue([series]);

      const result = await tripSeriesService.getAll(1);

      expect(result[0].earliestDate).toBeNull();
      expect(result[0].latestDate).toBeNull();
    });
  });

  // ============================================================
  // TS-003: Get a series by ID
  // ============================================================
  describe('TS-003: Get a series by ID', () => {
    it('should return series with full trip details', async () => {
      const mockSeries = createMockSeries({
        trips: [
          createMockTrip({ id: 1, title: 'Paris', seriesOrder: 1 }),
          createMockTrip({ id: 2, title: 'Rome', seriesOrder: 2 }),
        ],
      });

      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries()); // ownership check
      mockPrisma.tripSeries.findUnique.mockResolvedValue(mockSeries);

      const result = await tripSeriesService.getById(1, 1);

      expect(result.trips.length).toBe(2);
    });

    it('should throw 404 when series not found', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.getById(1, 999)).rejects.toThrow(
        'Trip series not found'
      );
    });

    it('should throw 404 when series belongs to another user', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.getById(2, 1)).rejects.toThrow(
        'Trip series not found'
      );
    });
  });

  // ============================================================
  // TS-004: Update a trip series
  // ============================================================
  describe('TS-004: Update a trip series', () => {
    it('should update series name and description', async () => {
      const mockSeries = createMockSeries();
      const updatedSeries = createMockSeries({
        name: 'Updated Tour',
        description: 'Updated description',
      });

      mockPrisma.tripSeries.findFirst.mockResolvedValue(mockSeries);
      mockPrisma.tripSeries.update.mockResolvedValue(updatedSeries);

      const result = await tripSeriesService.update(1, 1, {
        name: 'Updated Tour',
        description: 'Updated description',
      });

      expect(result.name).toBe('Updated Tour');
      expect(result.description).toBe('Updated description');
    });

    it('should throw 404 when updating non-existent series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(
        tripSeriesService.update(1, 999, { name: 'Test' })
      ).rejects.toThrow('Trip series not found');
    });
  });

  // ============================================================
  // TS-005: Delete a trip series
  // ============================================================
  describe('TS-005: Delete a trip series', () => {
    it('should delete a series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.tripSeries.delete.mockResolvedValue(createMockSeries());

      const result = await tripSeriesService.delete(1, 1);

      expect(result.message).toBe('Trip series deleted successfully');
      expect(mockPrisma.tripSeries.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw 404 when deleting non-existent series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.delete(1, 999)).rejects.toThrow(
        'Trip series not found'
      );
    });
  });

  // ============================================================
  // TS-006: Add a trip to a series
  // ============================================================
  describe('TS-006: Add a trip to a series', () => {
    it('should add a trip to a series at the next order position', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip({ seriesId: null }));
      mockPrisma.trip.aggregate.mockResolvedValue({ _max: { seriesOrder: 2 } });
      mockPrisma.trip.update.mockResolvedValue(
        createMockTrip({ seriesId: 1, seriesOrder: 3, series: { id: 1, name: 'European Tour' } })
      );

      const result = await tripSeriesService.addTrip(1, 1, 1);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { seriesId: 1, seriesOrder: 3 },
        include: { series: { select: { id: true, name: true } } },
      });
      expect(result.seriesOrder).toBe(3);
    });

    it('should add first trip with order 1', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip({ seriesId: null }));
      mockPrisma.trip.aggregate.mockResolvedValue({ _max: { seriesOrder: null } });
      mockPrisma.trip.update.mockResolvedValue(
        createMockTrip({ seriesId: 1, seriesOrder: 1 })
      );

      const result = await tripSeriesService.addTrip(1, 1, 1);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ seriesOrder: 1 }),
        })
      );
    });

    it('should throw error if trip already in this series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip({ seriesId: 1 }));

      await expect(tripSeriesService.addTrip(1, 1, 1)).rejects.toThrow(
        'Trip is already in this series'
      );
    });

    it('should throw 404 if trip not found', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.addTrip(1, 1, 999)).rejects.toThrow(
        'Trip not found'
      );
    });
  });

  // ============================================================
  // TS-007: Remove a trip from a series
  // ============================================================
  describe('TS-007: Remove a trip from a series', () => {
    it('should remove a trip and normalize order', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip({ seriesId: 1, seriesOrder: 2 }));
      mockPrisma.trip.update.mockResolvedValue(createMockTrip({ seriesId: null, seriesOrder: null }));
      // For normalizeSeriesOrder
      mockPrisma.trip.findMany.mockResolvedValue([
        { id: 1 },
        { id: 3 },
      ]);

      const result = await tripSeriesService.removeTrip(1, 1, 2);

      expect(result.message).toBe('Trip removed from series');
      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { seriesId: null, seriesOrder: null },
      });
    });

    it('should throw 404 if trip not in the series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.removeTrip(1, 1, 999)).rejects.toThrow(
        'Trip not found in this series'
      );
    });
  });

  // ============================================================
  // TS-008: Reorder trips in a series
  // ============================================================
  describe('TS-008: Reorder trips in a series', () => {
    it('should reorder trips with new order', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      mockPrisma.trip.update.mockResolvedValue({});

      const result = await tripSeriesService.reorderTrips(1, 1, [3, 1, 2]);

      expect(result.message).toBe('Trips reordered successfully');
    });

    it('should throw error if trip ID not in series', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);

      await expect(
        tripSeriesService.reorderTrips(1, 1, [1, 2, 999])
      ).rejects.toThrow('Trip 999 does not belong to this series');
    });

    it('should throw error if not all trips are included', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(createMockSeries());
      mockPrisma.trip.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);

      await expect(
        tripSeriesService.reorderTrips(1, 1, [1, 2])
      ).rejects.toThrow('All trips in the series must be included in the reorder');
    });
  });

  // ============================================================
  // TS-009: Ownership checks
  // ============================================================
  describe('TS-009: Ownership checks', () => {
    it('should throw 404 when series belongs to another user', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.getById(2, 1)).rejects.toThrow(
        'Trip series not found'
      );
    });

    it('should verify ownership on all mutation operations', async () => {
      mockPrisma.tripSeries.findFirst.mockResolvedValue(null);

      await expect(tripSeriesService.update(2, 1, { name: 'Test' })).rejects.toThrow(
        'Trip series not found'
      );
      await expect(tripSeriesService.delete(2, 1)).rejects.toThrow(
        'Trip series not found'
      );
      await expect(tripSeriesService.addTrip(2, 1, 1)).rejects.toThrow(
        'Trip series not found'
      );
      await expect(tripSeriesService.removeTrip(2, 1, 1)).rejects.toThrow(
        'Trip series not found'
      );
      await expect(tripSeriesService.reorderTrips(2, 1, [1])).rejects.toThrow(
        'Trip series not found'
      );
    });
  });
});
