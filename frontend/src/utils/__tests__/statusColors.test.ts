import { describe, it, expect } from 'vitest';
import {
  getTripStatusColor,
  getTripStatusBadgeClasses,
  getGenericStatusColor,
  tripStatusColors,
  genericStatusColors,
} from '../statusColors';
import { TripStatus } from '../../types/trip';

describe('Status Colors', () => {
  describe('tripStatusColors', () => {
    it('should have colors for all trip statuses', () => {
      expect(tripStatusColors[TripStatus.DREAM]).toBeDefined();
      expect(tripStatusColors[TripStatus.PLANNING]).toBeDefined();
      expect(tripStatusColors[TripStatus.PLANNED]).toBeDefined();
      expect(tripStatusColors[TripStatus.IN_PROGRESS]).toBeDefined();
      expect(tripStatusColors[TripStatus.COMPLETED]).toBeDefined();
      expect(tripStatusColors[TripStatus.CANCELLED]).toBeDefined();
    });

    it('should use dark mode classes', () => {
      const dreamColor = tripStatusColors[TripStatus.DREAM];
      expect(dreamColor).toContain('dark:');
    });
  });

  describe('getTripStatusColor', () => {
    it('should return correct color for valid status', () => {
      const color = getTripStatusColor(TripStatus.IN_PROGRESS);
      expect(color).toBe('bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300');
    });

    it('should return default color for invalid status', () => {
      const color = getTripStatusColor('INVALID_STATUS');
      expect(color).toBe('bg-gray-100 text-gray-800 dark:bg-dusk-700 dark:text-dusk-300');
    });

    it('should handle all trip statuses', () => {
      Object.values(TripStatus).forEach((status) => {
        const color = getTripStatusColor(status);
        expect(color).toBeDefined();
        expect(color.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getTripStatusBadgeClasses', () => {
    it('should include badge styling classes', () => {
      const classes = getTripStatusBadgeClasses(TripStatus.COMPLETED);
      expect(classes).toContain('px-2');
      expect(classes).toContain('py-1');
      expect(classes).toContain('text-xs');
      expect(classes).toContain('font-medium');
      expect(classes).toContain('rounded-lg');
    });

    it('should include status color classes', () => {
      const classes = getTripStatusBadgeClasses(TripStatus.PLANNED);
      expect(classes).toContain('bg-sky-100');
      expect(classes).toContain('text-sky-800');
    });
  });

  describe('genericStatusColors', () => {
    it('should have all generic status types', () => {
      expect(genericStatusColors.active).toBeDefined();
      expect(genericStatusColors.inactive).toBeDefined();
      expect(genericStatusColors.pending).toBeDefined();
      expect(genericStatusColors.completed).toBeDefined();
      expect(genericStatusColors.error).toBeDefined();
    });
  });

  describe('getGenericStatusColor', () => {
    it('should return correct color for each status', () => {
      expect(getGenericStatusColor('active')).toContain('green');
      expect(getGenericStatusColor('inactive')).toContain('gray');
      expect(getGenericStatusColor('pending')).toContain('yellow');
      expect(getGenericStatusColor('completed')).toContain('blue');
      expect(getGenericStatusColor('error')).toContain('red');
    });

    it('should include dark mode classes', () => {
      Object.keys(genericStatusColors).forEach((status) => {
        const color = getGenericStatusColor(status as keyof typeof genericStatusColors);
        expect(color).toContain('dark:');
      });
    });
  });
});
