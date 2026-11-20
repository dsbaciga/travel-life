import { describe, it, expect } from 'vitest';
import { buildTodayItems, originPlaceFor } from '../todayItems';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';

const PARIS = 'Europe/Paris';
const resolveTimezone = (own: string | null | undefined) => own || PARIS;

const activity = (over: Partial<Activity> & { id: number }): Activity => ({
  tripId: 1,
  parentId: null,
  locationId: null,
  name: 'Activity',
  description: null,
  category: null,
  allDay: false,
  startTime: '2026-06-10T10:00:00Z',
  endTime: null,
  timezone: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: null,
  dietaryTags: null,
  manualOrder: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const leg = (over: Partial<Transportation> & { id: number }): Transportation => ({
  tripId: 1,
  type: 'flight',
  fromLocationId: null,
  toLocationId: null,
  fromLocationName: 'Lisbon',
  toLocationName: 'Tokyo',
  departureTime: '2026-06-10T07:00:00Z',
  arrivalTime: '2026-06-10T19:00:00Z',
  startTimezone: 'Europe/Lisbon',
  endTimezone: 'Asia/Tokyo',
  carrier: null,
  vehicleNumber: null,
  confirmationNumber: null,
  cost: null,
  currency: null,
  notes: null,
  connectionGroupId: null,
  createdAt: '',
  updatedAt: '',
  loyaltyProgramId: null,
  ...over,
});

const stay = (over: Partial<Lodging> & { id: number }): Lodging => ({
  tripId: 1,
  locationId: null,
  type: 'hotel',
  name: 'Hotel',
  address: null,
  checkInDate: null,
  checkOutDate: null,
  timezone: null,
  confirmationNumber: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  notes: null,
  createdAt: '',
  updatedAt: '',
  loyaltyProgramId: null,
  ...over,
});

const build = (input: {
  activities?: Activity[];
  transportation?: Transportation[];
  lodging?: Lodging[];
}) =>
  buildTodayItems({
    activities: input.activities ?? [],
    transportation: input.transportation ?? [],
    lodging: input.lodging ?? [],
    locations: [],
    locationLinks: [],
    resolveTimezone,
  });

describe('buildTodayItems', () => {
  it('skips undated activities and legs', () => {
    const items = build({
      activities: [activity({ id: 1, startTime: null })],
      transportation: [leg({ id: 2, departureTime: null })],
    });
    expect(items).toEqual([]);
  });

  it('resolves each item to its own zone, and a leg to a start and an end zone', () => {
    const [a, t] = build({
      activities: [activity({ id: 1, timezone: 'Asia/Tokyo' }), ],
      transportation: [leg({ id: 2 })],
    });
    expect(a.timezone).toBe('Asia/Tokyo');
    expect(t.timezone).toBe('Europe/Lisbon');
    expect(t.endTimezone).toBe('Asia/Tokyo');
  });

  it('falls back to the resolver rather than to UTC when an item has no zone', () => {
    const [a] = build({ activities: [activity({ id: 1, timezone: null })] });
    expect(a.timezone).toBe(PARIS);
  });

  it('turns a stay into a check-in and a check-out, each with the stay\'s address and number', () => {
    const items = build({
      lodging: [
        stay({
          id: 3,
          name: 'Hotel Lumiere',
          address: '12 Rue de Rivoli',
          checkInDate: '2026-06-10T13:00:00Z',
          checkOutDate: '2026-06-12T09:00:00Z',
          confirmationNumber: ' HL-77 ',
        }),
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(['check_in', 'check_out']);
    expect(items.every((i) => i.address === '12 Rue de Rivoli' && i.confirmation === 'HL-77')).toBe(true);
  });

  it('treats a date-only stay as having no time of day', () => {
    const [checkIn] = build({
      lodging: [stay({ id: 3, checkInDate: '2026-06-10' })],
    });
    expect(checkIn.allDay).toBe(true);
  });

  it('gives a leg no confirmation when the number is blank', () => {
    const [t] = build({ transportation: [leg({ id: 2, confirmationNumber: '  ' })] });
    expect(t.confirmation).toBeNull();
  });
});

describe('originPlaceFor', () => {
  it('uses where the nearest earlier item leaves you, skipping items with no place', () => {
    const items = build({
      transportation: [
        leg({
          id: 1,
          departureTime: '2026-06-10T06:00:00Z',
          arrivalTime: '2026-06-10T08:00:00Z',
          fromLocationName: 'Orly',
          toLocationName: 'CDG',
        }),
        leg({
          id: 3,
          departureTime: '2026-06-10T12:00:00Z',
          fromLocationName: 'Gare du Nord',
          toLocationName: 'Brussels',
        }),
      ],
      activities: [activity({ id: 2, startTime: '2026-06-10T10:00:00Z' })],
    });
    const target = items.find((i) => i.key === 'transportation-3');
    expect(target).toBeDefined();
    if (!target) return;
    // The activity has no place, so the origin is where the first leg landed.
    expect(originPlaceFor(items, target)?.name).toBe('CDG');
    // A leg's own destination is its departure point.
    expect(target.destination?.name).toBe('Gare du Nord');
  });

  it('is null for the first item, so the maps app uses the device location', () => {
    const items = build({ transportation: [leg({ id: 1 })] });
    expect(originPlaceFor(items, items[0])).toBeNull();
  });
});
