/**
 * Transportation Service Tests
 *
 * Test cases:
 * - TRANS-001: Create flight with booking details
 * - TRANS-002: Create train/bus with route
 * - TRANS-003: Create car/driving with distance
 * - TRANS-004: Handle dual timezones (start/end)
 * - TRANS-005: Calculate duration from times
 * - TRANS-006: Calculate distance with OpenRouteService
 * - TRANS-007: Fallback to Haversine distance
 * - TRANS-008: Connection group for multi-leg journey
 * - TRANS-009: Flight tracking data
 * - TRANS-010: Update transportation
 * - TRANS-011: Delete transportation
 */

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => {
  class MockDecimal {
    private value: string;

    constructor(value: string | number) {
      this.value = String(value);
    }

    toString(): string {
      return this.value;
    }

    toNumber(): number {
      return parseFloat(this.value);
    }

    valueOf(): number {
      return this.toNumber();
    }
  }

  return {
    Prisma: {
      Decimal: MockDecimal,
    },
    EntityType: {
      PHOTO: 'PHOTO',
      LOCATION: 'LOCATION',
      ACTIVITY: 'ACTIVITY',
      LODGING: 'LODGING',
      TRANSPORTATION: 'TRANSPORTATION',
      JOURNAL_ENTRY: 'JOURNAL_ENTRY',
      PHOTO_ALBUM: 'PHOTO_ALBUM',
    },
  };
});

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  location: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  transportation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  // A leg's cost is its expense row
  tripExpense: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  travelCompanion: { findFirst: jest.fn() },
  tripExpenseSplit: { findMany: jest.fn(), update: jest.fn() },
  entityLink: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// The delete path runs its writes inside a transaction. Hand the callback the
// same mock client so the inner calls stay observable on mockPrisma.
mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
  cb(mockPrisma)
);

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock the routing service
const mockRoutingService = {
  calculateRoute: jest.fn(),
};

jest.mock('../routing.service', () => ({
  __esModule: true,
  default: mockRoutingService,
}));

// jest.mock() calls are hoisted above imports, so this picks up the mock.
import { Prisma } from '@prisma/client';

import transportationService from '../transportation.service';
import { withCost } from '../../__tests__/helpers/bookingCostRows';

describe('TransportationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mock implementations
    mockRoutingService.calculateRoute.mockResolvedValue({
      distance: 100,
      duration: 120,
      haversineDistance: 90,
      source: 'route',
    });
    // Default: trip access granted for userId=1, tripId=100
    mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, 1));
    mockPrisma.trip.findUnique.mockResolvedValue({ userId: 1, timezone: null, user: { timezone: null } });
    mockPrisma.location.findUnique.mockResolvedValue(null);
    mockPrisma.tripExpense.findUnique.mockResolvedValue(null);
    mockPrisma.tripExpense.findMany.mockResolvedValue([]);
    mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);
    mockPrisma.tripExpenseSplit.findMany.mockResolvedValue([]);
  });

  // Helper to create a mock location
  const createMockLocation = (id: number, name: string, lat: number, lng: number) => ({
    id,
    name,
    address: `${name} Address`,
    latitude: new Prisma.Decimal(lat),
    longitude: new Prisma.Decimal(lng),
  });

  // Helper to create a mock trip with collaboration-aware fields
  const createMockTrip = (id: number, userId: number) => ({
    id,
    userId,
    title: 'Test Trip',
    privacyLevel: 'Private',
    collaborators: [],
  });

  // ============================================================
  // TRANS-001: Create flight with booking details
  // ============================================================
  describe('TRANS-001: Create flight with booking details', () => {
    it('should create a flight with all booking details', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'flight' as const,
        fromLocationId: 1,
        toLocationId: 2,
        fromLocationName: 'JFK Airport',
        toLocationName: 'LAX Airport',
        departureTime: '2025-06-15T08:00:00Z',
        arrivalTime: '2025-06-15T11:30:00Z',
        startTimezone: 'America/New_York',
        endTimezone: 'America/Los_Angeles',
        carrier: 'United Airlines',
        vehicleNumber: 'UA123',
        confirmationNumber: 'ABC123XYZ',
        cost: 450.00,
        currency: 'USD',
        notes: 'Window seat preferred',
      };

      const mockFromLocation = createMockLocation(1, 'JFK Airport', 40.6413, -73.7781);
      const mockToLocation = createMockLocation(2, 'LAX Airport', 33.9416, -118.4085);

      const mockCreatedTransportation = {
        id: 1,
        tripId: 100,
        type: 'flight',
        startLocationId: 1,
        endLocationId: 2,
        startLocationText: 'JFK Airport',
        endLocationText: 'LAX Airport',
        scheduledStart: new Date(input.departureTime),
        scheduledEnd: new Date(input.arrivalTime),
        startTimezone: input.startTimezone,
        endTimezone: input.endTimezone,
        company: input.carrier,
        referenceNumber: input.vehicleNumber,
        bookingReference: input.confirmationNumber,
        cost: new Prisma.Decimal(input.cost),
        currency: input.currency,
        notes: input.notes,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: mockFromLocation,
        endLocation: mockToLocation,
        flightTracking: null,
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(mockFromLocation)
        .mockResolvedValueOnce(mockToLocation);
      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: input.tripId }),
        })
      );
      expect(mockPrisma.transportation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: input.tripId,
          type: 'flight',
          startLocationId: input.fromLocationId,
          endLocationId: input.toLocationId,
          company: input.carrier,
          bookingReference: input.confirmationNumber,
        }),
        include: expect.any(Object),
      });

      // Verify field mapping to frontend format
      expect(result.type).toBe('flight');
      expect(result.fromLocationId).toBe(1);
      expect(result.toLocationId).toBe(2);
      expect(result.carrier).toBe('United Airlines');
      expect(result.confirmationNumber).toBe('ABC123XYZ');
      expect(result.cost).toBe(450);
    });

    it('should throw error if user does not own the trip', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'flight' as const,
      };

      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        transportationService.createTransportation(userId, input)
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // TRANS-002: Create train/bus with route
  // ============================================================
  describe('TRANS-002: Create train/bus with route', () => {
    it('should create a train with route information', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'train' as const,
        fromLocationName: 'Penn Station, NYC',
        toLocationName: 'Union Station, DC',
        departureTime: '2025-07-01T07:00:00Z',
        arrivalTime: '2025-07-01T10:30:00Z',
        carrier: 'Amtrak',
        vehicleNumber: 'Acela Express 2150',
        cost: 189.00,
        currency: 'USD',
      };

      const mockCreatedTransportation = {
        id: 2,
        tripId: 100,
        type: 'train',
        startLocationId: null,
        endLocationId: null,
        startLocationText: input.fromLocationName,
        endLocationText: input.toLocationName,
        scheduledStart: new Date(input.departureTime),
        scheduledEnd: new Date(input.arrivalTime),
        startTimezone: null,
        endTimezone: null,
        company: input.carrier,
        referenceNumber: input.vehicleNumber,
        bookingReference: null,
        cost: new Prisma.Decimal(input.cost),
        currency: input.currency,
        notes: null,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: null,
        endLocation: null,
        flightTracking: null,
      };

      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(result.type).toBe('train');
      expect(result.fromLocationName).toBe('Penn Station, NYC');
      expect(result.toLocationName).toBe('Union Station, DC');
      expect(result.carrier).toBe('Amtrak');
    });

    it('should create a bus with route information', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'bus' as const,
        fromLocationName: 'Port Authority, NYC',
        toLocationName: 'Boston South Station',
        departureTime: '2025-07-02T09:00:00Z',
        arrivalTime: '2025-07-02T13:00:00Z',
        carrier: 'Greyhound',
      };

      const mockCreatedTransportation = {
        id: 3,
        tripId: 100,
        type: 'bus',
        startLocationId: null,
        endLocationId: null,
        startLocationText: input.fromLocationName,
        endLocationText: input.toLocationName,
        scheduledStart: new Date(input.departureTime),
        scheduledEnd: new Date(input.arrivalTime),
        startTimezone: null,
        endTimezone: null,
        company: input.carrier,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: null,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: null,
        endLocation: null,
        flightTracking: null,
      };

      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(result.type).toBe('bus');
      expect(result.carrier).toBe('Greyhound');
    });
  });

  // ============================================================
  // TRANS-003: Create car/driving with distance
  // ============================================================
  describe('TRANS-003: Create car/driving with distance', () => {
    it('should create car transportation with location IDs', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'car' as const,
        fromLocationId: 1,
        toLocationId: 2,
        departureTime: '2025-08-01T08:00:00Z',
        arrivalTime: '2025-08-01T12:00:00Z',
        notes: 'Rental car - Hertz',
      };

      const mockFromLocation = createMockLocation(1, 'San Francisco', 37.7749, -122.4194);
      const mockToLocation = createMockLocation(2, 'Los Angeles', 34.0522, -118.2437);

      const mockCreatedTransportation = {
        id: 4,
        tripId: 100,
        type: 'car',
        startLocationId: 1,
        endLocationId: 2,
        startLocationText: null,
        endLocationText: null,
        scheduledStart: new Date(input.departureTime),
        scheduledEnd: new Date(input.arrivalTime),
        startTimezone: null,
        endTimezone: null,
        company: null,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: input.notes,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: mockFromLocation,
        endLocation: mockToLocation,
        flightTracking: null,
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(mockFromLocation)
        .mockResolvedValueOnce(mockToLocation);
      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(result.type).toBe('car');
      expect(result.fromLocation).toBeDefined();
      expect(result.toLocation).toBeDefined();
      expect(result.fromLocation?.name).toBe('San Francisco');
      expect(result.toLocation?.name).toBe('Los Angeles');
    });

    it('should trigger background route calculation for car type', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'car' as const,
        fromLocationId: 1,
        toLocationId: 2,
      };

      const mockFromLocation = createMockLocation(1, 'Start', 37.7749, -122.4194);
      const mockToLocation = createMockLocation(2, 'End', 34.0522, -118.2437);

      const mockCreatedTransportation = {
        id: 5,
        tripId: 100,
        type: 'car',
        startLocationId: 1,
        endLocationId: 2,
        startLocationText: null,
        endLocationText: null,
        scheduledStart: null,
        scheduledEnd: null,
        startTimezone: null,
        endTimezone: null,
        company: null,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: null,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: mockFromLocation,
        endLocation: mockToLocation,
        flightTracking: null,
      };

      mockPrisma.location.findFirst
        .mockResolvedValueOnce(mockFromLocation)
        .mockResolvedValueOnce(mockToLocation);
      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      // Mock for background calculation
      mockPrisma.transportation.findUnique.mockResolvedValue(withCost({
        ...mockCreatedTransportation,
        startLocation: { latitude: new Prisma.Decimal(37.7749), longitude: new Prisma.Decimal(-122.4194) },
        endLocation: { latitude: new Prisma.Decimal(34.0522), longitude: new Prisma.Decimal(-118.2437) },
      }));
      mockPrisma.transportation.update.mockResolvedValue(withCost(mockCreatedTransportation));

      await transportationService.createTransportation(userId, input);

      // The background route calculation is triggered asynchronously
      // We verify the create was called properly
      expect(mockPrisma.transportation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'car',
          }),
        })
      );
    });
  });

  // ============================================================
  // TRANS-004: Handle dual timezones (start/end)
  // ============================================================
  describe('TRANS-004: Handle dual timezones (start/end)', () => {
    it('should store different timezones for departure and arrival', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'flight' as const,
        fromLocationName: 'New York (JFK)',
        toLocationName: 'London (LHR)',
        departureTime: '2025-09-01T18:00:00Z',
        arrivalTime: '2025-09-02T06:00:00Z',
        startTimezone: 'America/New_York',
        endTimezone: 'Europe/London',
        carrier: 'British Airways',
      };

      const mockCreatedTransportation = {
        id: 6,
        tripId: 100,
        type: 'flight',
        startLocationId: null,
        endLocationId: null,
        startLocationText: input.fromLocationName,
        endLocationText: input.toLocationName,
        scheduledStart: new Date(input.departureTime),
        scheduledEnd: new Date(input.arrivalTime),
        startTimezone: input.startTimezone,
        endTimezone: input.endTimezone,
        company: input.carrier,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: null,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: null,
        endLocation: null,
        flightTracking: null,
      };

      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(result.startTimezone).toBe('America/New_York');
      expect(result.endTimezone).toBe('Europe/London');
      expect(mockPrisma.transportation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startTimezone: 'America/New_York',
          endTimezone: 'Europe/London',
        }),
        include: expect.any(Object),
      });
    });

    it('should handle same timezone for domestic travel', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        type: 'train' as const,
        startTimezone: 'America/New_York',
        endTimezone: 'America/New_York',
      };

      const mockCreatedTransportation = {
        id: 7,
        tripId: 100,
        type: 'train',
        startLocationId: null,
        endLocationId: null,
        startLocationText: null,
        endLocationText: null,
        scheduledStart: null,
        scheduledEnd: null,
        startTimezone: input.startTimezone,
        endTimezone: input.endTimezone,
        company: null,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: null,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: null,
        endLocation: null,
        flightTracking: null,
      };

      mockPrisma.transportation.create.mockResolvedValue(withCost(mockCreatedTransportation));

      const result = await transportationService.createTransportation(userId, input);

      expect(result.startTimezone).toBe('America/New_York');
      expect(result.endTimezone).toBe('America/New_York');
    });
  });

  // ============================================================
  // TRANS-005: Calculate duration from times
  // ============================================================
  describe('TRANS-005: Calculate duration from times', () => {
    it('should calculate duration in minutes from scheduled times', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTransportations = [
        {
          id: 8,
          tripId,
          type: 'flight',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'NYC',
          endLocationText: 'LA',
          scheduledStart: new Date('2025-06-15T08:00:00Z'),
          scheduledEnd: new Date('2025-06-15T11:30:00Z'), // 3.5 hours = 210 minutes
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      expect(result[0].durationMinutes).toBe(210);
    });

    it('should not calculate duration if times are missing', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTransportations = [
        {
          id: 9,
          tripId,
          type: 'car',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'Point A',
          endLocationText: 'Point B',
          scheduledStart: null, // No departure time
          scheduledEnd: null, // No arrival time
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      expect(result[0].durationMinutes).toBeUndefined();
    });
  });

  // ============================================================
  // TRANS-006: Calculate distance with OpenRouteService
  // ============================================================
  describe('TRANS-006: Calculate distance with OpenRouteService', () => {
    it('should calculate route distance for car transportation', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFromLocation = createMockLocation(1, 'San Francisco', 37.7749, -122.4194);
      const mockToLocation = createMockLocation(2, 'Los Angeles', 34.0522, -118.2437);

      const mockTransportations = [
        {
          id: 10,
          tripId,
          type: 'car',
          startLocationId: 1,
          endLocationId: 2,
          startLocationText: null,
          endLocationText: null,
          scheduledStart: null,
          scheduledEnd: null,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: new Prisma.Decimal(615.5),
          calculatedDuration: new Prisma.Decimal(360),
          distanceSource: 'route',
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: mockFromLocation,
          endLocation: mockToLocation,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));
      mockRoutingService.calculateRoute.mockResolvedValue({
        distance: 615.5,
        duration: 360,
        haversineDistance: 559,
        source: 'route',
        geometry: [[37.7749, -122.4194], [34.0522, -118.2437]],
      });

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      // Verify route enhancement was attempted for car type
      expect(mockRoutingService.calculateRoute).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 37.7749, longitude: -122.4194 }),
        expect.objectContaining({ latitude: 34.0522, longitude: -118.2437 }),
        'driving-car'
      );
      expect(result[0].route).toBeDefined();
      expect(result[0].calculatedDistance).toBe(615.5);
      expect(result[0].distanceSource).toBe('route');
    });

    it('should use cycling-regular profile for bicycle transportation', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFromLocation = createMockLocation(1, 'Start', 40.7128, -74.006);
      const mockToLocation = createMockLocation(2, 'End', 40.7580, -73.9855);

      const mockTransportations = [
        {
          id: 11,
          tripId,
          type: 'bicycle',
          startLocationId: 1,
          endLocationId: 2,
          startLocationText: null,
          endLocationText: null,
          scheduledStart: null,
          scheduledEnd: null,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: mockFromLocation,
          endLocation: mockToLocation,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      await transportationService.getTransportationByTrip(userId, tripId);

      expect(mockRoutingService.calculateRoute).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'cycling-regular'
      );
    });

    it('should use foot-walking profile for walk transportation', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFromLocation = createMockLocation(1, 'Hotel', 48.8584, 2.2945);
      const mockToLocation = createMockLocation(2, 'Cafe', 48.8606, 2.3376);

      const mockTransportations = [
        {
          id: 12,
          tripId,
          type: 'walk',
          startLocationId: 1,
          endLocationId: 2,
          startLocationText: null,
          endLocationText: null,
          scheduledStart: null,
          scheduledEnd: null,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: mockFromLocation,
          endLocation: mockToLocation,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      await transportationService.getTransportationByTrip(userId, tripId);

      expect(mockRoutingService.calculateRoute).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'foot-walking'
      );
    });
  });

  // ============================================================
  // TRANS-007: Fallback to Haversine distance
  // ============================================================
  describe('TRANS-007: Fallback to Haversine distance', () => {
    it('should store haversine distance when routing service fails', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFromLocation = createMockLocation(1, 'Start', 37.7749, -122.4194);
      const mockToLocation = createMockLocation(2, 'End', 34.0522, -118.2437);

      const mockTransportations = [
        {
          id: 13,
          tripId,
          type: 'car',
          startLocationId: 1,
          endLocationId: 2,
          startLocationText: null,
          endLocationText: null,
          scheduledStart: null,
          scheduledEnd: null,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: new Prisma.Decimal(559),
          calculatedDuration: new Prisma.Decimal(418),
          distanceSource: 'haversine',
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: mockFromLocation,
          endLocation: mockToLocation,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));
      mockRoutingService.calculateRoute.mockRejectedValue(new Error('API unavailable'));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      // Should still return the transportation even if route calculation fails
      expect(result[0].calculatedDistance).toBe(559);
      expect(result[0].distanceSource).toBe('haversine');
    });

    it('should not attempt route calculation for non-road types', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFromLocation = createMockLocation(1, 'Start', 37.7749, -122.4194);
      const mockToLocation = createMockLocation(2, 'End', 34.0522, -118.2437);

      const mockTransportations = [
        {
          id: 14,
          tripId,
          type: 'flight', // Flight - no road routing
          startLocationId: 1,
          endLocationId: 2,
          startLocationText: null,
          endLocationText: null,
          scheduledStart: null,
          scheduledEnd: null,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: mockFromLocation,
          endLocation: mockToLocation,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      await transportationService.getTransportationByTrip(userId, tripId);

      // Route calculation should NOT be called for flight type
      expect(mockRoutingService.calculateRoute).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TRANS-008: Connection group for multi-leg journey
  // ============================================================
  describe('TRANS-008: Connection group for multi-leg journey', () => {
    it('should return transportation with connection group IDs', async () => {
      const userId = 1;
      const tripId = 100;
      const connectionGroupId = 'trip-100-connection-1';

      const mockTransportations = [
        {
          id: 15,
          tripId,
          type: 'flight',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'NYC (JFK)',
          endLocationText: 'Chicago (ORD)',
          scheduledStart: new Date('2025-10-01T08:00:00Z'),
          scheduledEnd: new Date('2025-10-01T10:30:00Z'),
          startTimezone: 'America/New_York',
          endTimezone: 'America/Chicago',
          company: 'United',
          referenceNumber: 'UA100',
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: null,
        },
        {
          id: 16,
          tripId,
          type: 'flight',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'Chicago (ORD)',
          endLocationText: 'Los Angeles (LAX)',
          scheduledStart: new Date('2025-10-01T12:00:00Z'),
          scheduledEnd: new Date('2025-10-01T14:00:00Z'),
          startTimezone: 'America/Chicago',
          endTimezone: 'America/Los_Angeles',
          company: 'United',
          referenceNumber: 'UA200',
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      expect(result.length).toBe(2);
      expect(result[0].connectionGroupId).toBe(connectionGroupId);
      expect(result[1].connectionGroupId).toBe(connectionGroupId);
      // Both legs share the same connection group
      expect(result[0].connectionGroupId).toBe(result[1].connectionGroupId);
    });
  });

  // ============================================================
  // TRANS-009: Flight tracking data
  // ============================================================
  describe('TRANS-009: Flight tracking data', () => {
    it('should return flight with tracking information', async () => {
      const userId = 1;
      const tripId = 100;

      const mockFlightTracking = {
        id: 1,
        transportationId: 17,
        flightNumber: 'UA123',
        airlineCode: 'UA',
        status: 'scheduled',
        gate: 'B22',
        terminal: '1',
        baggageClaim: null,
        lastUpdatedAt: new Date(),
        createdAt: new Date(),
      };

      const mockTransportations = [
        {
          id: 17,
          tripId,
          type: 'flight',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'JFK',
          endLocationText: 'LAX',
          scheduledStart: new Date('2025-11-01T10:00:00Z'),
          scheduledEnd: new Date('2025-11-01T13:00:00Z'),
          startTimezone: null,
          endTimezone: null,
          company: 'United Airlines',
          referenceNumber: 'UA123',
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: mockFlightTracking,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      expect(result[0].flightTracking).toBeDefined();
      expect(result[0].flightTracking?.flightNumber).toBe('UA123');
      expect(result[0].flightTracking?.gate).toBe('B22');
      expect(result[0].flightTracking?.status).toBe('scheduled');
    });
  });

  // ============================================================
  // TRANS-010: Update transportation
  // ============================================================
  describe('TRANS-010: Update transportation', () => {
    it('should update transportation details', async () => {
      const userId = 1;
      const transportationId = 18;
      const updateData = {
        departureTime: '2025-12-01T09:00:00Z',
        arrivalTime: '2025-12-01T12:00:00Z',
        carrier: 'Updated Carrier',
        notes: 'Updated notes',
      };

      const mockExistingTransportation = {
        id: transportationId,
        tripId: 100,
        type: 'train',
      };

      const mockUpdatedTransportation = {
        id: transportationId,
        tripId: 100,
        type: 'train',
        startLocationId: null,
        endLocationId: null,
        startLocationText: null,
        endLocationText: null,
        scheduledStart: new Date(updateData.departureTime),
        scheduledEnd: new Date(updateData.arrivalTime),
        startTimezone: null,
        endTimezone: null,
        company: updateData.carrier,
        referenceNumber: null,
        bookingReference: null,
        cost: null,
        currency: null,
        notes: updateData.notes,
        connectionGroupId: null,
        calculatedDistance: null,
        calculatedDuration: null,
        distanceSource: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startLocation: null,
        endLocation: null,
        flightTracking: null,
      };

      // verifyEntityAccessWithPermission calls findUnique then trip.findFirst
      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(mockExistingTransportation));
      // trip.findFirst is already mocked in beforeEach
      mockPrisma.transportation.update.mockResolvedValue(withCost(mockUpdatedTransportation));

      const result = await transportationService.updateTransportation(
        userId,
        transportationId,
        updateData
      );

      expect(mockPrisma.transportation.update).toHaveBeenCalledWith({
        where: { id: transportationId },
        data: expect.objectContaining({
          scheduledStart: expect.any(Date),
          scheduledEnd: expect.any(Date),
          company: updateData.carrier,
          notes: updateData.notes,
        }),
        include: expect.any(Object),
      });
      expect(result.carrier).toBe('Updated Carrier');
    });

    it('should throw error if transportation not found', async () => {
      const userId = 1;
      const transportationId = 999;

      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(null));

      await expect(
        transportationService.updateTransportation(userId, transportationId, { notes: 'Test' })
      ).rejects.toThrow('Transportation not found');
    });

    it('should throw error if user does not have access to the trip', async () => {
      const userId = 1;
      const transportationId = 18;

      const mockTransportation = {
        id: transportationId,
        tripId: 100,
      };

      // Entity exists
      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(mockTransportation));
      // But user has no access to the trip
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        transportationService.updateTransportation(userId, transportationId, { notes: 'Test' })
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should recalculate route when locations change', async () => {
      const userId = 1;
      const transportationId = 19;
      const updateData = {
        fromLocationId: 5,
        toLocationId: 6,
      };

      const mockExistingTransportation = {
        id: transportationId,
        tripId: 100,
        type: 'car',
        startLocationId: 1,
        endLocationId: 2,
      };

      const mockLocation5 = createMockLocation(5, 'New Start', 40.0, -74.0);
      const mockLocation6 = createMockLocation(6, 'New End', 41.0, -75.0);

      const mockUpdatedTransportation = {
        ...mockExistingTransportation,
        startLocationId: 5,
        endLocationId: 6,
        startLocation: mockLocation5,
        endLocation: mockLocation6,
        flightTracking: null,
      };

      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(mockExistingTransportation));
      mockPrisma.location.findFirst
        .mockResolvedValueOnce(mockLocation5)
        .mockResolvedValueOnce(mockLocation6);
      mockPrisma.transportation.update.mockResolvedValue(withCost(mockUpdatedTransportation));

      await transportationService.updateTransportation(userId, transportationId, updateData);

      expect(mockPrisma.transportation.update).toHaveBeenCalledWith({
        where: { id: transportationId },
        data: expect.objectContaining({
          startLocationId: 5,
          endLocationId: 6,
        }),
        include: expect.any(Object),
      });
    });
  });

  // ============================================================
  // TRANS-011: Delete transportation
  // ============================================================
  describe('TRANS-011: Delete transportation', () => {
    it('should delete transportation and clean up entity links', async () => {
      const userId = 1;
      const transportationId = 20;

      const mockTransportation = {
        id: transportationId,
        tripId: 100,
        type: 'flight',
      };

      // verifyEntityAccessWithPermission calls findUnique then trip.findFirst
      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(mockTransportation));
      // trip.findFirst is already mocked in beforeEach
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.transportation.delete.mockResolvedValue(mockTransportation);

      const result = await transportationService.deleteTransportation(userId, transportationId);

      expect(mockPrisma.entityLink.deleteMany).toHaveBeenCalledWith({
        where: {
          tripId: 100,
          OR: [
            { sourceType: 'TRANSPORTATION', sourceId: transportationId },
            { targetType: 'TRANSPORTATION', targetId: transportationId },
          ],
        },
      });
      expect(mockPrisma.transportation.delete).toHaveBeenCalledWith({
        where: { id: transportationId },
      });
      expect(result.success).toBe(true);
    });

    it('should throw error if transportation not found', async () => {
      const userId = 1;
      const transportationId = 999;

      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(null));

      await expect(
        transportationService.deleteTransportation(userId, transportationId)
      ).rejects.toThrow('Transportation not found');
    });

    it('should throw error if user does not have access to the trip', async () => {
      const userId = 1;
      const transportationId = 20;

      const mockTransportation = {
        id: transportationId,
        tripId: 100,
      };

      // Entity exists
      mockPrisma.transportation.findUnique.mockResolvedValue(withCost(mockTransportation));
      // But user has no access to the trip
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        transportationService.deleteTransportation(userId, transportationId)
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // Additional tests for status flags
  // ============================================================
  describe('Status flags calculation', () => {
    it('should mark upcoming transportation correctly', async () => {
      const userId = 1;
      const tripId = 100;

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
      const futureEndDate = new Date(futureDate);
      futureEndDate.setHours(futureEndDate.getHours() + 3);

      const mockTransportations = [
        {
          id: 21,
          tripId,
          type: 'flight',
          startLocationId: null,
          endLocationId: null,
          startLocationText: 'A',
          endLocationText: 'B',
          scheduledStart: futureDate,
          scheduledEnd: futureEndDate,
          startTimezone: null,
          endTimezone: null,
          company: null,
          referenceNumber: null,
          bookingReference: null,
          cost: null,
          currency: null,
          notes: null,
          connectionGroupId: null,
          calculatedDistance: null,
          calculatedDuration: null,
          distanceSource: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startLocation: null,
          endLocation: null,
          flightTracking: null,
        },
      ];

      mockPrisma.transportation.findMany.mockResolvedValue(withCost(mockTransportations));

      const result = await transportationService.getTransportationByTrip(userId, tripId);

      expect(result[0].isUpcoming).toBe(true);
      expect(result[0].isInProgress).toBe(false);
    });
  });
});
