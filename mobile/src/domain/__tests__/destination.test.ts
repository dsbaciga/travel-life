/**
 * Map-to destination tests
 *
 * Test cases:
 * - DEST-001: A location navigates to itself; with no coordinates it uses its address, then its name
 * - DEST-002: A lodging uses its linked place for coordinates, else its own address
 * - DEST-003: An activity navigates to the place it is linked to, in either direction, preferring coordinates
 * - DEST-004: A transport leg navigates to where it ends, with a mode that suits its type
 * - DEST-005: A leg with only typed destination text navigates to that text
 * - DEST-006: Custom items and meals use their place; items with nothing to go on get no button
 * - DEST-007: A place at 0,0 is not a destination
 * - DEST-008: Travel mode by transport type
 */
import { describe, expect, it } from 'vitest';
import type {
  ActivityDto,
  CustomItemDto,
  EntityLinkDto,
  FoodLogDto,
  LocationDto,
  LodgingDto,
  TransportationDto,
} from '@travel-life/shared';
import { buildNavTargets, navKey, travelModeForTransport, type NavSources } from '../destination';

const location = (id: number, overrides: Partial<LocationDto> = {}): LocationDto =>
  ({
    id,
    tripId: 1,
    name: `Place ${id}`,
    address: null,
    latitude: null,
    longitude: null,
    ...overrides,
  }) as LocationDto;

const lodging = (id: number, overrides: Partial<LodgingDto> = {}): LodgingDto =>
  ({ id, tripId: 1, name: `Hotel ${id}`, address: null, ...overrides }) as LodgingDto;
const activity = (id: number): ActivityDto => ({ id, tripId: 1, name: `Activity ${id}` }) as ActivityDto;
const leg = (id: number, overrides: Partial<TransportationDto> = {}): TransportationDto =>
  ({
    id,
    tripId: 1,
    type: 'train',
    startLocationId: null,
    startLocationText: null,
    endLocationId: null,
    endLocationText: null,
    ...overrides,
  }) as TransportationDto;
const link = (sourceType: string, sourceId: number, targetType: string, targetId: number): EntityLinkDto =>
  ({
    id: `${sourceType}${sourceId}${targetType}${targetId}`,
    tripId: 1,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationship: 'OCCURRED_AT',
  }) as EntityLinkDto;

const sources = (overrides: Partial<NavSources> = {}): NavSources => ({
  locations: [],
  lodging: [],
  activities: [],
  transportation: [],
  customItems: [],
  foodLog: [],
  links: [],
  ...overrides,
});

describe('buildNavTargets', () => {
  it('DEST-001: a location navigates to itself, falling back from coordinates to address to name', () => {
    const targets = buildNavTargets(
      sources({
        locations: [
          location(1, { latitude: 64.1466, longitude: -21.9426, address: 'Hverfisgata 12' }),
          location(2, { address: 'Laugavegur 5, Reykjavik' }),
          location(3, { name: 'Hallgrimskirkja' }),
          location(4, { name: '  ' }),
        ],
      })
    );

    expect(targets.get(navKey('LOCATION', 1))?.place).toMatchObject({ latitude: 64.1466, longitude: -21.9426 });
    expect(targets.get(navKey('LOCATION', 2))?.place).toMatchObject({ address: 'Laugavegur 5, Reykjavik', latitude: null });
    expect(targets.get(navKey('LOCATION', 3))?.place).toEqual({ name: 'Hallgrimskirkja' });
    expect(targets.has(navKey('LOCATION', 4))).toBe(false);
    expect(targets.get(navKey('LOCATION', 1))).toMatchObject({ mode: 'driving', label: 'Map to' });
  });

  it('DEST-002: a lodging uses its linked place for coordinates, else its own address', () => {
    const targets = buildNavTargets(
      sources({
        locations: [location(10, { latitude: 41.9, longitude: 12.5, address: 'Via X' })],
        lodging: [
          lodging(1, { address: 'Via Nazionale 18' }), // has a linked place with coordinates too
          lodging(2, { address: 'Via Roma 3' }), // address only
          lodging(3), // nothing at all
        ],
        links: [link('LODGING', 1, 'LOCATION', 10)],
      })
    );

    // Coordinates from the link, but the stay's own name.
    expect(targets.get(navKey('LODGING', 1))?.place).toMatchObject({ name: 'Hotel 1', latitude: 41.9, longitude: 12.5 });
    expect(targets.get(navKey('LODGING', 2))?.place).toMatchObject({ name: 'Hotel 2', address: 'Via Roma 3', latitude: null });
    expect(targets.has(navKey('LODGING', 3))).toBe(false);
  });

  it('DEST-003: an activity goes to the place it is linked to, in either direction', () => {
    const targets = buildNavTargets(
      sources({
        locations: [
          location(10, { name: 'No coords', address: 'Some street 1' }),
          location(11, { name: 'Museum', latitude: 48.86, longitude: 2.34 }),
          location(12, { name: 'Park', latitude: 48.85, longitude: 2.3 }),
        ],
        activities: [activity(1), activity(2), activity(3), activity(4)],
        links: [
          // Activity -> place, and place -> activity; and a place with coordinates beats one without.
          link('ACTIVITY', 1, 'LOCATION', 10),
          link('LOCATION', 11, 'ACTIVITY', 1),
          link('LOCATION', 12, 'ACTIVITY', 2),
          link('ACTIVITY', 3, 'LOCATION', 10),
        ],
      })
    );

    expect(targets.get(navKey('ACTIVITY', 1))?.place).toMatchObject({ name: 'Museum', latitude: 48.86 });
    expect(targets.get(navKey('ACTIVITY', 2))?.place).toMatchObject({ name: 'Park' });
    expect(targets.get(navKey('ACTIVITY', 3))?.place).toMatchObject({ address: 'Some street 1', latitude: null });
    expect(targets.has(navKey('ACTIVITY', 4))).toBe(false);
  });

  it('DEST-004: a transport leg goes to where it ends, with a mode that suits its type', () => {
    const targets = buildNavTargets(
      sources({
        locations: [
          location(20, { name: 'Santa Lucia', latitude: 45.44, longitude: 12.32 }),
          location(21, { name: 'Start', latitude: 1, longitude: 1 }),
        ],
        transportation: [
          leg(1, { type: 'train', startLocationId: 21, endLocationId: 20 }),
          leg(2, { type: 'car', endLocationId: 20 }),
          leg(3, { type: 'walk', endLocationId: 20 }),
          leg(4, { type: 'bicycle', endLocationId: 20 }),
        ],
      })
    );

    const train = targets.get(navKey('TRANSPORTATION', 1));
    // The destination, not the start.
    expect(train?.place).toMatchObject({ name: 'Santa Lucia', latitude: 45.44 });
    expect(train).toMatchObject({ mode: 'transit', label: 'Map to destination' });
    expect(targets.get(navKey('TRANSPORTATION', 2))?.mode).toBe('driving');
    expect(targets.get(navKey('TRANSPORTATION', 3))?.mode).toBe('walking');
    expect(targets.get(navKey('TRANSPORTATION', 4))?.mode).toBe('bicycling');
  });

  it('DEST-005: a leg with only typed destination text goes to that text; with nothing, no button', () => {
    const targets = buildNavTargets(
      sources({
        transportation: [
          leg(1, { type: 'flight', endLocationText: ' Keflavik International Airport ' }),
          leg(2, { type: 'bus' }),
          leg(3, { type: 'bus', endLocationText: '   ' }),
        ],
      })
    );

    expect(targets.get(navKey('TRANSPORTATION', 1))).toMatchObject({
      place: { name: 'Keflavik International Airport', address: 'Keflavik International Airport' },
      mode: 'driving',
    });
    expect(targets.has(navKey('TRANSPORTATION', 2))).toBe(false);
    expect(targets.has(navKey('TRANSPORTATION', 3))).toBe(false);
  });

  it('DEST-006: custom items and meals use their place; items with nothing to go on get no button', () => {
    const targets = buildNavTargets(
      sources({
        locations: [location(30, { name: 'Bakery', latitude: 10, longitude: 10 }), location(31, { name: 'Cafe', latitude: 11, longitude: 11 })],
        customItems: [
          { id: 1, tripId: 1, name: 'Concert', locationId: 30 } as CustomItemDto,
          { id: 2, tripId: 1, name: 'Linked only', locationId: null } as CustomItemDto,
          { id: 3, tripId: 1, name: 'Nothing', locationId: null } as CustomItemDto,
        ],
        foodLog: [
          { id: 1, tripId: 1, restaurantName: 'Bakery', locationId: 30 } as FoodLogDto,
          { id: 2, tripId: 1, restaurantName: 'Cafe', locationId: null } as FoodLogDto,
          { id: 3, tripId: 1, restaurantName: 'Mystery', locationId: null } as FoodLogDto,
        ],
        links: [link('CUSTOM_ITEM', 2, 'LOCATION', 31), link('FOOD_LOG', 2, 'LOCATION', 31)],
      })
    );

    expect(targets.get(navKey('CUSTOM_ITEM', 1))?.place).toMatchObject({ name: 'Bakery' });
    expect(targets.get(navKey('CUSTOM_ITEM', 2))?.place).toMatchObject({ name: 'Cafe' });
    expect(targets.has(navKey('CUSTOM_ITEM', 3))).toBe(false);
    expect(targets.get(navKey('FOOD_LOG', 1))?.place).toMatchObject({ name: 'Bakery' });
    expect(targets.get(navKey('FOOD_LOG', 2))?.place).toMatchObject({ name: 'Cafe' });
    expect(targets.has(navKey('FOOD_LOG', 3))).toBe(false);
  });

  it('DEST-007: a place at 0,0 is not a destination', () => {
    const targets = buildNavTargets(
      sources({
        locations: [location(1, { latitude: 0, longitude: 0 }), location(2, { latitude: 0, longitude: 0, address: 'Real address' })],
      })
    );
    // 0,0 is a default-initialised value, not a place. With no address either, only the name is left.
    expect(targets.get(navKey('LOCATION', 1))?.place).toEqual({ name: 'Place 1' });
    expect(targets.get(navKey('LOCATION', 2))?.place).toMatchObject({ address: 'Real address', latitude: null });
  });

  it('DEST-008: picks a travel mode from the transport type', () => {
    expect(['car', 'taxi', 'flight', 'other', 'something new', ''].map(travelModeForTransport)).toEqual([
      'driving',
      'driving',
      'driving',
      'driving',
      'driving',
      'driving',
    ]);
    expect(['train', 'bus', 'ferry', 'Metro', 'TRAM'].map(travelModeForTransport)).toEqual([
      'transit',
      'transit',
      'transit',
      'transit',
      'transit',
    ]);
    expect(travelModeForTransport('walk')).toBe('walking');
    expect(travelModeForTransport('Bicycle')).toBe('bicycling');
  });
});
