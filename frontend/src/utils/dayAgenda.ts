import type { Activity } from '../types/activity';
import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';
import type { Location } from '../types/location';
import { dayKeyInTimezone } from './timezone';

export interface AgendaPoint {
  latitude: number;
  longitude: number;
}

export type AgendaItemType = 'activity' | 'transportation' | 'lodging';

/** One row of a day's agenda. `number` matches the pin on the map. */
export interface AgendaItem {
  /** Stable across renders, unique within a day. */
  key: string;
  /** 1-based position in the day, shown in the list and on the pin. */
  number: number;
  type: AgendaItemType;
  /** Id of the underlying activity, transportation or lodging. */
  entityId: number;
  title: string;
  subtitle: string | null;
  /** The instant the item starts, or null when it has no time of day. */
  time: string | null;
  /** The zone `time` should be shown in. Already resolved; never UTC by default. */
  timezone: string;
  /** No time of day to show (all-day activity, ongoing stay). */
  allDay: boolean;
  /** Where the pin goes. Null when nothing gives this item coordinates. */
  point: AgendaPoint | null;
  /** Transportation only: where it ends, for drawing the leg. */
  endPoint: AgendaPoint | null;
  /** The trip tab that edits this item. */
  tab: 'activities' | 'transportation' | 'lodging';
}

export interface LocationLink {
  sourceType: string;
  sourceId: number;
  targetId: number;
}

export interface DayAgendaInput {
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  /** The trip's locations, used to give linked activities and stays a pin. */
  locations: Location[];
  /** Entity links whose target is a location. */
  locationLinks: LocationLink[];
  /** YYYY-MM-DD, the day to build. */
  dayKey: string;
  /**
   * Resolves the zone an entity's times are shown in. Receives the entity's
   * own timezone; the caller appends the trip's and the user's.
   */
  resolveTimezone: (entityTimezone: string | null | undefined) => string;
}

function toPoint(
  place: { latitude?: number | null; longitude?: number | null } | null | undefined
): AgendaPoint | null {
  if (!place) return null;
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (place.latitude == null || place.longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the numbered agenda for one calendar day of a trip.
 *
 * Each timestamp is bucketed onto a day in its own resolved timezone, so a
 * 9pm dinner in Tokyo lands on the Tokyo date. Items with a time come first
 * in time order, then all-day items. Numbers are assigned after sorting and
 * are given to every item, including those with no coordinates: those keep
 * their number in the list and simply have no pin.
 */
export function buildDayAgenda({
  activities,
  transportation,
  lodging,
  locations,
  locationLinks,
  dayKey,
  resolveTimezone,
}: DayAgendaInput): AgendaItem[] {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const linkedPoint = (sourceType: string, sourceId: number): AgendaPoint | null => {
    for (const link of locationLinks) {
      if (link.sourceType !== sourceType || link.sourceId !== sourceId) continue;
      const point = toPoint(locationById.get(link.targetId));
      if (point) return point;
    }
    return null;
  };

  type Draft = Omit<AgendaItem, 'number'>;
  const drafts: Draft[] = [];

  for (const activity of activities) {
    if (!activity.startTime) continue;
    const timezone = resolveTimezone(activity.timezone);
    if (dayKeyInTimezone(activity.startTime, timezone) !== dayKey) continue;
    drafts.push({
      key: `activity-${activity.id}`,
      type: 'activity',
      entityId: activity.id,
      title: activity.name,
      subtitle: activity.category || null,
      time: activity.allDay ? null : activity.startTime,
      timezone,
      allDay: activity.allDay,
      point: linkedPoint('ACTIVITY', activity.id),
      endPoint: null,
      tab: 'activities',
    });
  }

  for (const leg of transportation) {
    if (!leg.departureTime) continue;
    const timezone = resolveTimezone(leg.startTimezone);
    if (dayKeyInTimezone(leg.departureTime, timezone) !== dayKey) continue;
    const from = leg.fromLocation?.name || leg.fromLocationName;
    const to = leg.toLocation?.name || leg.toLocationName;
    const carrier = [leg.carrier, leg.vehicleNumber].filter(Boolean).join(' ');
    drafts.push({
      key: `transportation-${leg.id}`,
      type: 'transportation',
      entityId: leg.id,
      title: from && to ? `${from} to ${to}` : titleCase(leg.type),
      subtitle: [titleCase(leg.type), carrier].filter(Boolean).join(' · ') || null,
      time: leg.departureTime,
      timezone,
      allDay: false,
      point: toPoint(leg.route?.from) ?? toPoint(leg.fromLocation),
      endPoint: toPoint(leg.route?.to) ?? toPoint(leg.toLocation),
      tab: 'transportation',
    });
  }

  for (const stay of lodging) {
    const timezone = resolveTimezone(stay.timezone);
    const checkIn = dayKeyInTimezone(stay.checkInDate, timezone);
    const checkOut = dayKeyInTimezone(stay.checkOutDate, timezone);
    const base = {
      type: 'lodging' as const,
      entityId: stay.id,
      subtitle: titleCase(stay.type),
      timezone,
      point: linkedPoint('LODGING', stay.id),
      endPoint: null,
      tab: 'lodging' as const,
    };

    if (checkOut === dayKey) {
      drafts.push({
        ...base,
        key: `lodging-${stay.id}-out`,
        title: `Check out: ${stay.name}`,
        time: stay.checkOutDate,
        allDay: false,
      });
    }
    if (checkIn === dayKey) {
      drafts.push({
        ...base,
        key: `lodging-${stay.id}-in`,
        title: `Check in: ${stay.name}`,
        time: stay.checkInDate,
        allDay: false,
      });
    }
    if (checkIn && checkOut && checkIn < dayKey && dayKey < checkOut) {
      drafts.push({
        ...base,
        key: `lodging-${stay.id}-stay`,
        title: `Staying at ${stay.name}`,
        time: null,
        allDay: true,
      });
    }
  }

  drafts.sort((a, b) => {
    if (a.time && b.time) return Date.parse(a.time) - Date.parse(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.title.localeCompare(b.title);
  });

  return drafts.map((draft, index) => ({ ...draft, number: index + 1 }));
}

/**
 * Every calendar day from `startDate` to `endDate` inclusive, as YYYY-MM-DD.
 * Trip dates are date-only values stored at UTC midnight, so the range is
 * walked in UTC on purpose (see the date-only exception in CLAUDE.md).
 */
export function tripDayKeys(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string[] {
  if (!startDate) return [];
  const start = Date.parse(`${startDate.split('T')[0]}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate.split('T')[0]}T00:00:00Z`) : start;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const days: string[] = [];
  // Cap at two years so a typo in an end date cannot build a huge list.
  for (let t = start; t <= end && days.length < 731; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}
