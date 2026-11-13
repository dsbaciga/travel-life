import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';

export interface BookingRow {
  key: string;
  tab: 'transportation' | 'lodging';
  title: string;
  detail: string | null;
  at: string;
  timezone: string;
}

const titleCase = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** The next few bookings that have not started yet, soonest first. */
export function nextBookings(
  transportation: Transportation[],
  lodging: Lodging[],
  resolveTimezone: (entityTimezone: string | null | undefined) => string,
  limit: number,
  now: number = Date.now()
): BookingRow[] {
  const rows: BookingRow[] = [];

  for (const leg of transportation) {
    if (!leg.departureTime || Date.parse(leg.departureTime) < now) continue;
    const from = leg.fromLocation?.name || leg.fromLocationName;
    const to = leg.toLocation?.name || leg.toLocationName;
    rows.push({
      key: `t-${leg.id}`,
      tab: 'transportation',
      title: from && to ? `${from} to ${to}` : titleCase(leg.type),
      detail:
        [titleCase(leg.type), [leg.carrier, leg.vehicleNumber].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(' · ') || null,
      at: leg.departureTime,
      timezone: resolveTimezone(leg.startTimezone),
    });
  }

  for (const stay of lodging) {
    if (!stay.checkInDate || Date.parse(stay.checkInDate) < now) continue;
    rows.push({
      key: `l-${stay.id}`,
      tab: 'lodging',
      title: stay.name,
      detail: `${titleCase(stay.type)} · check in`,
      at: stay.checkInDate,
      timezone: resolveTimezone(stay.timezone),
    });
  }

  return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, limit);
}
