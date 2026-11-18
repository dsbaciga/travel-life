import {
  joinDateTimeLocal,
  shiftDateTimeParts,
  splitDateTimeLocal,
} from "./dateTimeDefaults";

/** Gap between the previous leg's arrival and the next leg's departure. */
export const LAYOVER_HOURS = 2;
/** Placeholder length of the new leg so its arrival never precedes its departure. */
export const DEFAULT_LEG_HOURS = 1;

/**
 * Suggested `datetime-local` times for a leg that follows one arriving at
 * `previousArrivalLocal`. Wall-clock arithmetic only, so the browser's own zone
 * and DST never shift the result.
 *
 * @returns `null` when the previous arrival is not a complete date and time.
 */
export function chainedLegTimes(
  previousArrivalLocal: string
): { departureTime: string; arrivalTime: string } | null {
  const departure = shiftDateTimeParts(
    splitDateTimeLocal(previousArrivalLocal),
    LAYOVER_HOURS
  );
  if (!departure) return null;
  const arrival = shiftDateTimeParts(departure, DEFAULT_LEG_HOURS);
  if (!arrival) return null;
  return {
    departureTime: joinDateTimeLocal(departure),
    arrivalTime: joinDateTimeLocal(arrival),
  };
}
