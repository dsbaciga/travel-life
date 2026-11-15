/**
 * Where an itinerary item can be navigated to, for the "Map to" button.
 *
 * Pure: the screens load the rows, this works out the destination of each.
 * Entities carry very different amounts of location detail (see `MapsPlace`), so
 * most fall back from coordinates, to a place they are linked to, to an address.
 */
import type {
  ActivityDto,
  CustomItemDto,
  EntityId,
  EntityLinkDto,
  FoodLogDto,
  LocationDto,
  LodgingDto,
  MapsPlace,
  SyncEntityKind,
  TransportationDto,
  TravelMode,
} from '@travel-life/shared';
import { isUsableCoordinate } from '@travel-life/shared';

export interface NavTarget {
  place: MapsPlace;
  mode: TravelMode;
  /** Button words: "Map to", or "Map to destination" for a journey. */
  label: string;
  /** What is being navigated to, for messages. */
  title: string;
}

/** The kinds that can have a destination. */
export const NAVIGABLE_KINDS = [
  'LOCATION',
  'LODGING',
  'ACTIVITY',
  'TRANSPORTATION',
  'CUSTOM_ITEM',
  'FOOD_LOG',
] as const satisfies readonly SyncEntityKind[];

export const navKey = (kind: string, id: EntityId): string => `${kind}:${id}`;

/**
 * How you would get to where a leg ends. A car or taxi drives; a walk or a bike ride
 * is that; trains, buses, ferries and metros are transit. A flight or anything unknown
 * defaults to driving, the way most people reach an airport or an unlisted stop.
 */
export function travelModeForTransport(type: string): TravelMode {
  switch (type.trim().toLowerCase()) {
    case 'walk':
    case 'walking':
      return 'walking';
    case 'bicycle':
    case 'bike':
    case 'cycling':
      return 'bicycling';
    case 'train':
    case 'bus':
    case 'ferry':
    case 'metro':
    case 'subway':
    case 'tram':
      return 'transit';
    default:
      return 'driving';
  }
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** A place's navigable form, or null when there is nothing to navigate to. */
function placeOf(parts: {
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): MapsPlace | null {
  const coords = isUsableCoordinate(parts) ? { latitude: parts.latitude, longitude: parts.longitude } : null;
  const address = text(parts.address);
  const name = text(parts.name);
  if (!coords && !address) return null;
  return { name, address, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null };
}

export interface NavSources {
  locations: readonly LocationDto[];
  lodging: readonly LodgingDto[];
  activities: readonly ActivityDto[];
  transportation: readonly TransportationDto[];
  customItems: readonly CustomItemDto[];
  foodLog: readonly FoodLogDto[];
  links: readonly EntityLinkDto[];
}

/** Destinations for every item in a trip that has one, keyed by {@link navKey}. */
export function buildNavTargets(sources: NavSources): Map<string, NavTarget> {
  const targets = new Map<string, NavTarget>();
  const locationById = new Map(sources.locations.map((location) => [String(location.id), location]));

  // Places each entity is linked to, in either direction, best (has coordinates) first.
  const linked = new Map<string, LocationDto[]>();
  const addLink = (key: string, locationId: EntityId) => {
    const location = locationById.get(String(locationId));
    if (!location) return;
    const list = linked.get(key) ?? [];
    list.push(location);
    linked.set(key, list);
  };
  for (const link of sources.links) {
    if (link.targetType === 'LOCATION') addLink(navKey(link.sourceType, link.sourceId), link.targetId);
    if (link.sourceType === 'LOCATION') addLink(navKey(link.targetType, link.targetId), link.sourceId);
  }
  const linkedPlace = (kind: SyncEntityKind, id: EntityId): MapsPlace | null => {
    const candidates = linked.get(navKey(kind, id)) ?? [];
    const places = candidates.map((location) => placeOf(location)).filter((place): place is MapsPlace => place !== null);
    return places.find((place) => place.latitude !== null) ?? places[0] ?? null;
  };
  const byLocationId = (locationId: EntityId | null): MapsPlace | null => {
    const location = locationId === null ? undefined : locationById.get(String(locationId));
    return location ? placeOf(location) : null;
  };

  const set = (kind: SyncEntityKind, id: EntityId, place: MapsPlace | null, title: string, mode: TravelMode = 'driving', label = 'Map to') => {
    if (place) targets.set(navKey(kind, id), { place, mode, label, title });
  };

  for (const location of sources.locations) {
    // A place nobody gave coordinates or an address can still be found by its name.
    const place = placeOf(location) ?? (text(location.name) ? { name: text(location.name) } : null);
    set('LOCATION', location.id, place, location.name);
  }

  for (const stay of sources.lodging) {
    const own = placeOf({ name: stay.name, address: stay.address });
    const fromLink = linkedPlace('LODGING', stay.id);
    // The linked place has the coordinates; the stay's own address is the fallback.
    const place = fromLink && fromLink.latitude !== null ? { ...fromLink, name: stay.name } : (own ?? fromLink);
    set('LODGING', stay.id, place, stay.name);
  }

  for (const activity of sources.activities) {
    set('ACTIVITY', activity.id, linkedPlace('ACTIVITY', activity.id), activity.name);
  }

  for (const item of sources.customItems) {
    set('CUSTOM_ITEM', item.id, byLocationId(item.locationId) ?? linkedPlace('CUSTOM_ITEM', item.id), item.name);
  }

  for (const entry of sources.foodLog) {
    set('FOOD_LOG', entry.id, byLocationId(entry.locationId) ?? linkedPlace('FOOD_LOG', entry.id), entry.restaurantName);
  }

  for (const leg of sources.transportation) {
    // A journey is navigated to where it ends: its end place, else the destination as typed.
    const endText = text(leg.endLocationText);
    const place = byLocationId(leg.endLocationId) ?? (endText ? { name: endText, address: endText } : null);
    set('TRANSPORTATION', leg.id, place, endText ?? 'the destination', travelModeForTransport(leg.type), 'Map to destination');
  }

  return targets;
}
