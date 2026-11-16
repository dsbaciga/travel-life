/**
 * Turns a trip's activities, transportation and lodging into the flat list the
 * Today card selects from, with the place, address and booking number each one
 * needs. Pure, so it runs the same from cached data as from fresh data.
 */

import type { Activity } from '../types/activity';
import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';
import type { Location } from '../types/location';
import {
  placeFromActivity,
  placeFromLodging,
  placeFromTransportation,
} from '../lib/itineraryPlaces';
import { pickPreviousPlace, type MapsPlace } from '../lib/mapsDeepLinks';
import type { LocationLink } from './dayAgenda';
import type { TimedItem } from './todayNextUp';

export type TodayItemKind = 'activity' | 'departure' | 'check_in' | 'check_out';

export interface TodayItem extends TimedItem {
  type: 'activity' | 'transportation' | 'lodging';
  kind: TodayItemKind;
  entityId: number;
  title: string;
  subtitle: string | null;
  /** Where to be for this item. Null when nothing gives it a place. */
  destination: MapsPlace | null;
  /** Where the item leaves the traveller: a leg's arrival, otherwise the same place. */
  endPlace: MapsPlace | null;
  /** The human-readable line under the title. */
  address: string | null;
  /** Confirmation or booking number, trimmed; null when the record has none. */
  confirmation: string | null;
  tab: 'activities' | 'transportation' | 'lodging';
}

export interface BuildTodayItemsInput {
  activities: readonly Activity[];
  transportation: readonly Transportation[];
  lodging: readonly Lodging[];
  locations: readonly Location[];
  locationLinks: readonly LocationLink[];
  /** Resolves an entity's own zone against the trip's and the user's. */
  resolveTimezone: (entityTimezone: string | null | undefined) => string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}/;

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function addressOf(place: MapsPlace | null): string | null {
  return trimToNull(place?.address) ?? trimToNull(place?.name);
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A lodging time with no time of day is a date, not an instant. */
function lodgingAllDay(value: string): boolean {
  return DATE_ONLY.test(value) && !value.includes('T');
}

export function buildTodayItems({
  activities,
  transportation,
  lodging,
  locations,
  locationLinks,
  resolveTimezone,
}: BuildTodayItemsInput): TodayItem[] {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const linkedLocations = (sourceType: string, sourceId: number): Location[] =>
    locationLinks
      .filter((link) => link.sourceType === sourceType && link.sourceId === sourceId)
      .flatMap((link) => {
        const location = locationById.get(link.targetId);
        return location ? [location] : [];
      });

  const items: TodayItem[] = [];

  for (const activity of activities) {
    if (!activity.startTime) continue;
    const place = placeFromActivity(activity, linkedLocations('ACTIVITY', activity.id));
    items.push({
      key: `activity-${activity.id}`,
      type: 'activity',
      kind: 'activity',
      entityId: activity.id,
      title: activity.name,
      subtitle: trimToNull(activity.category),
      start: activity.startTime,
      end: activity.endTime,
      timezone: resolveTimezone(activity.timezone),
      allDay: activity.allDay,
      destination: place,
      endPlace: place,
      address: addressOf(place),
      confirmation: trimToNull(activity.bookingReference),
      tab: 'activities',
    });
  }

  for (const leg of transportation) {
    if (!leg.departureTime) continue;
    const from = trimToNull(leg.fromLocation?.name) ?? trimToNull(leg.fromLocationName);
    const to = trimToNull(leg.toLocation?.name) ?? trimToNull(leg.toLocationName);
    const carrier = [leg.carrier, leg.vehicleNumber].filter(Boolean).join(' ');
    // Getting to the departure point is what you need on the ground.
    const departure = placeFromTransportation(leg, 'from');
    const startTimezone = resolveTimezone(leg.startTimezone);
    items.push({
      key: `transportation-${leg.id}`,
      type: 'transportation',
      kind: 'departure',
      entityId: leg.id,
      title: from && to ? `${from} to ${to}` : titleCase(leg.type),
      subtitle: [titleCase(leg.type), carrier].filter(Boolean).join(' · ') || null,
      start: leg.departureTime,
      end: leg.arrivalTime,
      timezone: startTimezone,
      endTimezone: leg.endTimezone ? resolveTimezone(leg.endTimezone) : startTimezone,
      allDay: false,
      destination: departure,
      endPlace: placeFromTransportation(leg, 'to') ?? departure,
      address: addressOf(departure),
      confirmation: trimToNull(leg.confirmationNumber),
      tab: 'transportation',
    });
  }

  for (const stay of lodging) {
    const timezone = resolveTimezone(stay.timezone);
    const place = placeFromLodging(stay, linkedLocations('LODGING', stay.id));
    const common = {
      type: 'lodging' as const,
      entityId: stay.id,
      subtitle: titleCase(stay.type),
      end: null,
      timezone,
      destination: place,
      endPlace: place,
      address: trimToNull(stay.address) ?? addressOf(place),
      confirmation: trimToNull(stay.confirmationNumber),
      tab: 'lodging' as const,
    };
    if (stay.checkInDate) {
      items.push({
        ...common,
        key: `lodging-${stay.id}-in`,
        kind: 'check_in',
        title: `Check in: ${stay.name}`,
        start: stay.checkInDate,
        allDay: lodgingAllDay(stay.checkInDate),
      });
    }
    if (stay.checkOutDate) {
      items.push({
        ...common,
        key: `lodging-${stay.id}-out`,
        kind: 'check_out',
        title: `Check out: ${stay.name}`,
        start: stay.checkOutDate,
        allDay: lodgingAllDay(stay.checkOutDate),
      });
    }
  }

  return items;
}

/**
 * Where a Directions link for `target` should start: the nearest earlier timed
 * item that has a real place, measured from where that item leaves you (a
 * transportation leg drops you at its arrival, not its departure). Null means
 * "from the device's current location".
 */
export function originPlaceFor(
  items: readonly TodayItem[],
  target: TodayItem
): MapsPlace | null {
  const ordered = items
    .filter((item) => !item.allDay && item.start !== null && !Number.isNaN(Date.parse(item.start)))
    .sort((a, b) => Date.parse(a.start ?? '') - Date.parse(b.start ?? ''));
  const index = ordered.findIndex((item) => item.key === target.key);
  if (index < 0) return null;
  return pickPreviousPlace(
    ordered.map((item) => item.endPlace),
    index
  );
}
