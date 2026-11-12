/**
 * Builds the chronological day timeline and the "Next Up" hero from mirrored
 * entities. Pure: takes rows in, returns view models out.
 */

import type {
  ActivityDto,
  CustomItemDto,
  EntityId,
  LocationDto,
  LodgingDto,
  TransportationDto,
  TripDto,
} from '@travel-life/shared';
import {
  addDaysToDayKey,
  dateOnlyKey,
  dayKeyInTimezone,
  resolveTimezone,
} from '@travel-life/shared';

export type TimelineItemType =
  | 'ACTIVITY'
  | 'TRANSPORTATION'
  | 'LODGING_CHECK_IN'
  | 'LODGING_CHECK_OUT'
  | 'CUSTOM_ITEM';

export interface TimelineItem {
  /** Stable list key. */
  key: string;
  type: TimelineItemType;
  /** The mirrored entity kind this item edits. */
  entityKind: 'ACTIVITY' | 'TRANSPORTATION' | 'LODGING' | 'CUSTOM_ITEM';
  entityId: EntityId;
  title: string;
  subtitle: string | null;
  start: string | null;
  end: string | null;
  allDay: boolean;
  /** The zone this item's times are shown in. */
  timezone: string;
  /** Booking / confirmation code to show and copy. */
  confirmation: string | null;
  status: string | null;
  delayMinutes: number | null;
  manualOrder: number | null;
}

export interface TimelineSources {
  activities: readonly ActivityDto[];
  transportation: readonly TransportationDto[];
  lodging: readonly LodgingDto[];
  customItems: readonly CustomItemDto[];
  /** For resolving a transit leg's endpoint names. */
  locations?: readonly LocationDto[];
}

const TRANSPORT_LABEL: Readonly<Record<string, string>> = {
  flight: 'Flight',
  train: 'Train',
  bus: 'Bus',
  car: 'Drive',
  ferry: 'Ferry',
  bicycle: 'Bike',
  walk: 'Walk',
  other: 'Transit',
};

/**
 * Flatten every schedulable entity into timeline items, each resolved to its
 * own display timezone (`entity -> trip -> user -> device`, never bare UTC).
 */
export function buildTimelineItems(
  sources: TimelineSources,
  tripTimezone: string | null | undefined,
  userTimezone: string | null | undefined
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const locationName = new Map<string, string>();
  for (const location of sources.locations ?? []) {
    locationName.set(String(location.id), location.name);
  }
  const place = (id: EntityId | null, text: string | null): string | null =>
    (id !== null ? locationName.get(String(id)) : undefined) ?? text ?? null;

  for (const activity of sources.activities) {
    items.push({
      key: `ACTIVITY:${activity.id}`,
      type: 'ACTIVITY',
      entityKind: 'ACTIVITY',
      entityId: activity.id,
      title: activity.name,
      subtitle: activity.category,
      start: activity.startTime,
      end: activity.endTime,
      allDay: activity.allDay,
      timezone: resolveTimezone(activity.timezone, tripTimezone, userTimezone),
      confirmation: activity.bookingReference,
      status: null,
      delayMinutes: null,
      manualOrder: activity.manualOrder,
    });
  }

  for (const leg of sources.transportation) {
    const from = place(leg.startLocationId, leg.startLocationText);
    const to = place(leg.endLocationId, leg.endLocationText);
    const label = TRANSPORT_LABEL[leg.type] ?? 'Transit';
    const route = from && to ? `${from} → ${to}` : (to ?? from);
    items.push({
      key: `TRANSPORTATION:${leg.id}`,
      type: 'TRANSPORTATION',
      entityKind: 'TRANSPORTATION',
      entityId: leg.id,
      title: route ? `${label}: ${route}` : label,
      subtitle: [leg.company, leg.referenceNumber].filter(Boolean).join(' ') || null,
      // Once a leg has really left, that is the time that matters.
      start: leg.actualStart ?? leg.scheduledStart,
      end: leg.actualEnd ?? leg.scheduledEnd,
      allDay: false,
      // A departure is read on the clock of the place it departs from.
      timezone: resolveTimezone(leg.startTimezone, tripTimezone, userTimezone),
      confirmation: leg.bookingReference,
      status: leg.status,
      delayMinutes: leg.delayMinutes,
      manualOrder: null,
    });
  }

  for (const stay of sources.lodging) {
    const timezone = resolveTimezone(stay.timezone, tripTimezone, userTimezone);
    const shared = {
      entityKind: 'LODGING' as const,
      entityId: stay.id,
      subtitle: stay.address,
      end: null,
      allDay: false,
      timezone,
      confirmation: stay.confirmationNumber,
      status: null,
      delayMinutes: null,
      manualOrder: null,
    };
    items.push({
      ...shared,
      key: `LODGING_CHECK_IN:${stay.id}`,
      type: 'LODGING_CHECK_IN',
      title: `Check in: ${stay.name}`,
      start: stay.checkInDate,
    });
    items.push({
      ...shared,
      key: `LODGING_CHECK_OUT:${stay.id}`,
      type: 'LODGING_CHECK_OUT',
      title: `Check out: ${stay.name}`,
      start: stay.checkOutDate,
    });
  }

  for (const custom of sources.customItems) {
    items.push({
      key: `CUSTOM_ITEM:${custom.id}`,
      type: 'CUSTOM_ITEM',
      entityKind: 'CUSTOM_ITEM',
      entityId: custom.id,
      title: custom.name,
      subtitle: null,
      start: custom.startTime,
      end: custom.endTime,
      allDay: custom.allDay,
      timezone: resolveTimezone(custom.timezone, tripTimezone, userTimezone),
      confirmation: custom.confirmationNumber,
      status: null,
      delayMinutes: null,
      manualOrder: null,
    });
  }

  return items;
}

const startMs = (item: TimelineItem): number =>
  item.start ? new Date(item.start).getTime() : Number.POSITIVE_INFINITY;

/**
 * Order one day's items.
 *
 * All-day items lead, then everything chronologically. A manual drag order
 * only rearranges activities *among the slots activities already occupy*: a
 * train stays where its departure time puts it no matter how the stops around
 * it are shuffled.
 */
export function sortDayItems(items: readonly TimelineItem[]): TimelineItem[] {
  const chronological = items.slice().sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return startMs(a) - startMs(b) || a.title.localeCompare(b.title);
  });

  // All-day items are pinned to the top; only timed activities trade places.
  const movable = (item: TimelineItem): boolean => item.type === 'ACTIVITY' && !item.allDay;
  const activities = chronological.filter(movable);
  if (!activities.some((item) => item.manualOrder !== null)) return chronological;

  const ordered = activities
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = a.item.manualOrder;
      const bo = b.item.manualOrder;
      if (ao !== null && bo !== null) return ao - bo || a.index - b.index;
      if (ao !== null) return -1;
      if (bo !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);

  let next = 0;
  return chronological.map((item) => (movable(item) ? ordered[next++] : item));
}

/** Items that fall on a calendar day, each judged in its own timezone. */
export function itemsForDay(items: readonly TimelineItem[], dayKey: string): TimelineItem[] {
  return sortDayItems(
    items.filter((item) => item.start !== null && dayKeyInTimezone(item.start, item.timezone) === dayKey)
  );
}

/** Items with no time at all: the "unscheduled" pool a day can pull from. */
export function unscheduledItems(items: readonly TimelineItem[]): TimelineItem[] {
  return items
    .filter((item) => item.start === null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export interface TimelineDay {
  dayKey: string;
  items: TimelineItem[];
}

/**
 * Every day of the trip, in order, each with its items. Days outside the
 * trip's dates that still have items (an early flight out) are included.
 */
export function buildTripDays(
  trip: Pick<TripDto, 'startDate' | 'endDate'>,
  items: readonly TimelineItem[]
): TimelineDay[] {
  const keys = new Set<string>();
  const start = dateOnlyKey(trip.startDate);
  const end = dateOnlyKey(trip.endDate);
  if (start && end && start <= end) {
    // Bounded: a trip with corrupt dates must not spin forever.
    for (let key = start, guard = 0; key <= end && guard < 400; key = addDaysToDayKey(key, 1), guard++) {
      keys.add(key);
    }
  }
  for (const item of items) {
    if (item.start) keys.add(dayKeyInTimezone(item.start, item.timezone));
  }
  return [...keys]
    .filter(Boolean)
    .sort()
    .map((dayKey) => ({ dayKey, items: itemsForDay(items, dayKey) }));
}

export interface NextUp {
  item: TimelineItem;
  /** True when it has started and not yet ended. */
  inProgress: boolean;
}

/** How long an item with no end time is still considered "current". */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * The item the traveller should be looking at right now: something in
 * progress, else the next thing to start. All-day items never qualify — they
 * have no moment to count down to.
 */
export function findNextUp(items: readonly TimelineItem[], now: Date = new Date()): NextUp | null {
  const nowMs = now.getTime();
  let current: TimelineItem | null = null;
  let upcoming: TimelineItem | null = null;

  for (const item of items) {
    if (item.allDay || !item.start || item.status === 'cancelled') continue;
    const start = new Date(item.start).getTime();
    if (Number.isNaN(start)) continue;
    const end = item.end ? new Date(item.end).getTime() : start + DEFAULT_DURATION_MS;
    if (start <= nowMs && nowMs < end) {
      // Prefer whichever in-progress item started most recently.
      if (!current || start > startMs(current)) current = item;
    } else if (start > nowMs) {
      if (!upcoming || start < startMs(upcoming)) upcoming = item;
    }
  }

  // A check-in/out is a moment, not an occupation: do not let it mask the next real item.
  const isMoment = (item: TimelineItem): boolean =>
    item.type === 'LODGING_CHECK_IN' || item.type === 'LODGING_CHECK_OUT';
  if (current && !(isMoment(current) && upcoming)) return { item: current, inProgress: true };
  if (upcoming) return { item: upcoming, inProgress: false };
  return current ? { item: current, inProgress: true } : null;
}

/** The activity or lodging stay in progress at `now`, for smart auto-linking. */
export function findCurrentContext(
  sources: Pick<TimelineSources, 'activities' | 'lodging'>,
  now: Date = new Date()
): { activity: ActivityDto | null; lodging: LodgingDto | null } {
  const nowMs = now.getTime();
  let activity: ActivityDto | null = null;
  for (const candidate of sources.activities) {
    if (candidate.allDay || !candidate.startTime) continue;
    const start = new Date(candidate.startTime).getTime();
    const end = candidate.endTime
      ? new Date(candidate.endTime).getTime()
      : start + 2 * DEFAULT_DURATION_MS;
    if (start <= nowMs && nowMs < end) {
      if (!activity || start > new Date(activity.startTime as string).getTime()) activity = candidate;
    }
  }
  let lodging: LodgingDto | null = null;
  for (const stay of sources.lodging) {
    const start = new Date(stay.checkInDate).getTime();
    const end = new Date(stay.checkOutDate).getTime();
    if (start <= nowMs && nowMs < end) lodging = stay;
  }
  return { activity, lodging };
}

/**
 * Which trip is "the" trip right now: one whose dates contain today, else the
 * soonest upcoming, else the most recently ended.
 */
export function pickActiveTrip<T extends Pick<TripDto, 'startDate' | 'endDate' | 'status'>>(
  trips: readonly T[],
  todayKey: string
): T | null {
  const live = trips.filter((trip) => !/cancel/i.test(trip.status));
  const during = live.find((trip) => {
    const start = dateOnlyKey(trip.startDate);
    const end = dateOnlyKey(trip.endDate);
    return start !== '' && end !== '' && start <= todayKey && todayKey <= end;
  });
  if (during) return during;
  const upcoming = live
    .filter((trip) => dateOnlyKey(trip.startDate) > todayKey)
    .sort((a, b) => dateOnlyKey(a.startDate).localeCompare(dateOnlyKey(b.startDate)));
  if (upcoming.length > 0) return upcoming[0];
  const past = live
    .filter((trip) => dateOnlyKey(trip.endDate) !== '' && dateOnlyKey(trip.endDate) < todayKey)
    .sort((a, b) => dateOnlyKey(b.endDate).localeCompare(dateOnlyKey(a.endDate)));
  return past[0] ?? live[0] ?? null;
}
