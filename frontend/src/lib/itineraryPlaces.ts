/**
 * Adapters that turn itinerary entities into `MapsPlace` values for the
 * Directions deep links. Pure and dependency-free apart from the entity types.
 */

import type { Activity } from '../types/activity';
import type { Lodging } from '../types/lodging';
import type { Transportation } from '../types/transportation';
import { hasUsableLocation, type MapsPlace } from './mapsDeepLinks';

/**
 * The common shape of a place record. Full `Location` objects and the trimmed
 * ones embedded on `Transportation` both satisfy it.
 */
export interface LocationLike {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function placeFromLocation(location: LocationLike): MapsPlace {
  return {
    name: location.name,
    address: location.address ?? null,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
  };
}

/** The first linked location that can actually produce a deep link. */
export function firstNavigableLocation(
  locations: ReadonlyArray<LocationLike>
): MapsPlace | null {
  for (const location of locations) {
    const place = placeFromLocation(location);
    if (hasUsableLocation(place)) return place;
  }
  return null;
}

/**
 * Activities carry no address of their own — an activity is navigable only
 * through the locations linked to it. Its title ("Dinner", "Museum visit") is
 * not a place, so we never fall back to it.
 */
export function placeFromActivity(
  activity: Activity,
  linkedLocations: ReadonlyArray<LocationLike>
): MapsPlace | null {
  const linked = firstNavigableLocation(linkedLocations);
  if (linked === null) return null;
  // Prefer the location's own name — it is the thing on the map — but an
  // unnamed location is better labelled with the activity than with nothing.
  const hasName = typeof linked.name === 'string' && linked.name.trim().length > 0;
  return { ...linked, name: hasName ? linked.name : activity.name };
}

/**
 * Lodging has its own postal address. When a location is also linked we borrow
 * its coordinates, which route far more precisely than a street address.
 */
export function placeFromLodging(
  lodging: Lodging,
  linkedLocations: ReadonlyArray<LocationLike> = []
): MapsPlace | null {
  const linked = firstNavigableLocation(linkedLocations);

  const place: MapsPlace = {
    name: lodging.name,
    address: lodging.address ?? linked?.address ?? null,
    latitude: linked?.latitude ?? null,
    longitude: linked?.longitude ?? null,
  };

  return hasUsableLocation(place) ? place : null;
}

/**
 * One end of a transportation leg. `'from'` is what you normally want to
 * navigate to (getting to the airport); `'to'` is where the leg leaves you,
 * which becomes the origin of whatever comes next.
 */
export function placeFromTransportation(
  transportation: Transportation,
  end: 'from' | 'to'
): MapsPlace | null {
  const linked = end === 'from' ? transportation.fromLocation : transportation.toLocation;
  const freeText =
    end === 'from' ? transportation.fromLocationName : transportation.toLocationName;

  const place: MapsPlace = {
    name: linked?.name ?? freeText,
    address: linked?.address ?? null,
    latitude: linked?.latitude ?? null,
    longitude: linked?.longitude ?? null,
  };

  // Station and airport names geocode well, so a bare name is enough here.
  return hasUsableLocation(place) ? place : null;
}

/**
 * The place line shown under an itinerary item's title (styled `.place-name`:
 * italic serif). Only a real location counts: an activity's category
 * ("sightseeing") is a label, not a place, and belongs in the subtitle.
 * Used by both the Timeline and Today's Itinerary so they agree.
 */
export function getActivityPlaceName(activity: Pick<Activity, 'location'>): string | undefined {
  const name = activity.location?.name?.trim();
  return name ? name : undefined;
}
