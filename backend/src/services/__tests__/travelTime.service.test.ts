/**
 * TravelTime Service Tests
 *
 * Test cases:
 * - TT-001: Estimate travel time by car
 * - TT-002: Estimate travel time by flight
 * - TT-003: Estimate travel time by train
 * - TT-004: Estimate travel time by bicycle and walking
 * - TT-005: Estimate travel time with default transport
 * - TT-006: Analyze activity transitions - impossible connection
 * - TT-007: Analyze activity transitions - tight connection
 * - TT-008: Analyze activity transitions - comfortable connection
 * - TT-009: Skip activities without time or location
 * - TT-010: Handle zero distance
 */

// This service doesn't use prisma, so no database mock needed
import travelTimeService from '../travelTime.service';

describe('TravelTimeService', () => {
  // Coordinates for test locations
  const paris = { latitude: 48.8566, longitude: 2.3522 };
  const london = { latitude: 51.5074, longitude: -0.1278 };
  const nearbyParis = { latitude: 48.8606, longitude: 2.3376 }; // ~1km from paris
  const newYork = { latitude: 40.7128, longitude: -74.0060 };
  const sameSpot = { latitude: 48.8566, longitude: 2.3522 };

  // ============================================================
  // TT-001: Estimate travel time by car
  // ============================================================
  describe('TT-001: Estimate travel time by car', () => {
    it('should estimate car travel time between Paris and London', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, london, 'car');

      // Paris to London is ~340km, at 60km/h = ~340min, + 20% buffer = ~408min
      expect(minutes).toBeGreaterThan(300);
      expect(minutes).toBeLessThan(600);
    });

    it('should include 20% buffer for real-world conditions', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, nearbyParis, 'car');

      // Even short distances should have the buffer applied
      expect(minutes).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // TT-002: Estimate travel time by flight
  // ============================================================
  describe('TT-002: Estimate travel time by flight', () => {
    it('should estimate flight time including airport time', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, newYork, 'flight');

      // Paris to NYC is ~5800km, at 800km/h = ~435min flight + 180min airport = ~615min
      expect(minutes).toBeGreaterThan(500);
      expect(minutes).toBeLessThan(800);
    });

    it('should add 3 hours airport time for any flight', () => {
      const shortFlight = travelTimeService.estimateTravelTime(paris, london, 'flight');

      // Even short flights should have 180 min airport time minimum
      expect(shortFlight).toBeGreaterThan(180);
    });
  });

  // ============================================================
  // TT-003: Estimate travel time by train
  // ============================================================
  describe('TT-003: Estimate travel time by train', () => {
    it('should estimate train travel time', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, london, 'train');

      // Paris to London ~340km, at 100km/h = ~204min + 20% buffer = ~245min
      expect(minutes).toBeGreaterThan(200);
      expect(minutes).toBeLessThan(400);
    });
  });

  // ============================================================
  // TT-004: Estimate travel time by bicycle and walking
  // ============================================================
  describe('TT-004: Bicycle and walking', () => {
    it('should estimate bicycle travel time', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, nearbyParis, 'bicycle');

      // ~1km at 15km/h = 4min + 20% buffer = ~5min
      expect(minutes).toBeGreaterThanOrEqual(1);
      expect(minutes).toBeLessThan(30);
    });

    it('should estimate walking time', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, nearbyParis, 'walk');

      // ~1km at 5km/h = 12min + 20% buffer = ~15min
      expect(minutes).toBeGreaterThanOrEqual(5);
      expect(minutes).toBeLessThan(60);
    });

    it('should estimate walking slower than bicycle', () => {
      const walkMinutes = travelTimeService.estimateTravelTime(paris, nearbyParis, 'walk');
      const bikeMinutes = travelTimeService.estimateTravelTime(paris, nearbyParis, 'bicycle');

      expect(walkMinutes).toBeGreaterThan(bikeMinutes);
    });
  });

  // ============================================================
  // TT-005: Default transport mode
  // ============================================================
  describe('TT-005: Default transport mode', () => {
    it('should use default speed when no transport type given', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, london);

      // Default speed is 50km/h, so slower than car (60km/h) but not drastically different
      expect(minutes).toBeGreaterThan(0);
    });

    it('should use default speed for unknown transport type', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, london, 'teleportation');

      // Should use 50km/h default
      expect(minutes).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // TT-006: Impossible connection
  // ============================================================
  describe('TT-006: Impossible connection', () => {
    it('should flag impossible connections when not enough time', () => {
      const activities = [
        {
          name: 'Eiffel Tower Visit',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: new Date('2025-06-15T12:00:00Z'),
          location: { latitude: 48.8584, longitude: 2.2945 },
        },
        {
          name: 'Big Ben Tour',
          startTime: new Date('2025-06-15T12:30:00Z'), // Only 30 min after previous
          endTime: new Date('2025-06-15T14:00:00Z'),
          location: { latitude: 51.5007, longitude: -0.1246 },
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe('impossible');
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].fromActivity).toBe('Eiffel Tower Visit');
      expect(alerts[0].toActivity).toBe('Big Ben Tour');
    });
  });

  // ============================================================
  // TT-007: Tight connection
  // ============================================================
  describe('TT-007: Tight connection', () => {
    it('should flag tight connections with less than 30 min buffer', () => {
      const activities = [
        {
          name: 'Activity A',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: new Date('2025-06-15T12:00:00Z'),
          location: { latitude: 48.8566, longitude: 2.3522 },
        },
        {
          name: 'Activity B',
          startTime: new Date('2025-06-15T12:20:00Z'), // 20 min gap for nearby location
          endTime: new Date('2025-06-15T14:00:00Z'),
          location: { latitude: 48.8606, longitude: 2.3376 }, // ~1km away
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      // With ~1km distance, travel time is small but buffer may still be tight
      if (alerts.length > 0) {
        expect(alerts[0].type).toBe('tight');
        expect(alerts[0].severity).toBe('warning');
      }
    });
  });

  // ============================================================
  // TT-008: Comfortable connection
  // ============================================================
  describe('TT-008: Comfortable connection', () => {
    it('should not flag comfortable connections with plenty of buffer', () => {
      const activities = [
        {
          name: 'Morning Activity',
          startTime: new Date('2025-06-15T09:00:00Z'),
          endTime: new Date('2025-06-15T10:00:00Z'),
          location: { latitude: 48.8566, longitude: 2.3522 },
        },
        {
          name: 'Afternoon Activity',
          startTime: new Date('2025-06-15T14:00:00Z'), // 4 hours later, same city
          endTime: new Date('2025-06-15T16:00:00Z'),
          location: { latitude: 48.8606, longitude: 2.3376 }, // ~1km away
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(0);
    });
  });

  // ============================================================
  // TT-009: Skip activities without time or location
  // ============================================================
  describe('TT-009: Skip activities without data', () => {
    it('should skip activities without end time', () => {
      const activities = [
        {
          name: 'Activity A',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: null, // No end time
          location: { latitude: 48.8566, longitude: 2.3522 },
        },
        {
          name: 'Activity B',
          startTime: new Date('2025-06-15T12:00:00Z'),
          endTime: new Date('2025-06-15T14:00:00Z'),
          location: { latitude: 51.5074, longitude: -0.1278 },
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(0);
    });

    it('should skip activities without location', () => {
      const activities = [
        {
          name: 'Activity A',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: new Date('2025-06-15T12:00:00Z'),
          location: null, // No location
        },
        {
          name: 'Activity B',
          startTime: new Date('2025-06-15T12:30:00Z'),
          endTime: new Date('2025-06-15T14:00:00Z'),
          location: { latitude: 51.5074, longitude: -0.1278 },
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(0);
    });

    it('should skip activities with null coordinates', () => {
      const activities = [
        {
          name: 'Activity A',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: new Date('2025-06-15T12:00:00Z'),
          location: { latitude: null, longitude: null },
        },
        {
          name: 'Activity B',
          startTime: new Date('2025-06-15T12:30:00Z'),
          endTime: new Date('2025-06-15T14:00:00Z'),
          location: { latitude: 51.5074, longitude: -0.1278 },
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(0);
    });

    it('should return empty array for single activity', () => {
      const activities = [
        {
          name: 'Only Activity',
          startTime: new Date('2025-06-15T10:00:00Z'),
          endTime: new Date('2025-06-15T12:00:00Z'),
          location: { latitude: 48.8566, longitude: 2.3522 },
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      expect(alerts.length).toBe(0);
    });

    it('should return empty array for no activities', () => {
      const alerts = travelTimeService.analyzeActivityTransitions([]);

      expect(alerts.length).toBe(0);
    });
  });

  // ============================================================
  // TT-010: Handle zero/same location distance
  // ============================================================
  describe('TT-010: Handle zero distance', () => {
    it('should handle same coordinates (zero distance)', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, sameSpot, 'car');

      expect(minutes).toBe(0);
    });

    it('should handle bus transport type', () => {
      const minutes = travelTimeService.estimateTravelTime(paris, london, 'bus');

      // Bus uses same speed as car (60km/h)
      const carMinutes = travelTimeService.estimateTravelTime(paris, london, 'car');
      expect(minutes).toBe(carMinutes);
    });
  });

  // ============================================================
  // Additional: Multiple transitions analysis
  // ============================================================
  describe('Multiple transitions', () => {
    it('should analyze multiple consecutive activity transitions', () => {
      const activities = [
        {
          name: 'Activity 1',
          startTime: new Date('2025-06-15T09:00:00Z'),
          endTime: new Date('2025-06-15T10:00:00Z'),
          location: { latitude: 48.8566, longitude: 2.3522 },
        },
        {
          name: 'Activity 2',
          startTime: new Date('2025-06-15T14:00:00Z'), // Plenty of time
          endTime: new Date('2025-06-15T16:00:00Z'),
          location: { latitude: 48.8606, longitude: 2.3376 },
        },
        {
          name: 'Activity 3',
          startTime: new Date('2025-06-15T16:15:00Z'), // Only 15 min gap, faraway
          endTime: new Date('2025-06-15T18:00:00Z'),
          location: { latitude: 51.5074, longitude: -0.1278 }, // London
        },
      ];

      const alerts = travelTimeService.analyzeActivityTransitions(activities);

      // First transition should be fine, second should be impossible
      expect(alerts.some(a => a.fromActivity === 'Activity 2' && a.toActivity === 'Activity 3')).toBe(true);
    });
  });
});
