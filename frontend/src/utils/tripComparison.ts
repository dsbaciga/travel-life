import { MAX_COMPARE_TRIPS } from '../types/tripComparison';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * One colour per compared trip. These are the Okabe-Ito colour-blind-safe hues;
 * each stays distinct against both the light and dark map tiles. `text` is the
 * legible label colour on that fill. Colour is never the only cue: markers also
 * carry the trip's number and popups name the trip.
 */
export interface TripColor {
  fill: string;
  text: string;
}

export const TRIP_COLORS: readonly TripColor[] = [
  { fill: '#0072B2', text: '#ffffff' }, // blue
  { fill: '#E69F00', text: '#000000' }, // orange
  { fill: '#009E73', text: '#ffffff' }, // bluish green
  { fill: '#D55E00', text: '#ffffff' }, // vermillion
  { fill: '#CC79A7', text: '#000000' }, // reddish purple
  { fill: '#56B4E9', text: '#000000' }, // sky blue
  { fill: '#F0E442', text: '#000000' }, // yellow
  { fill: '#999999', text: '#000000' }, // grey
];

export function tripColor(index: number): TripColor {
  return TRIP_COLORS[index % TRIP_COLORS.length];
}

/**
 * Parses the `ids` query value into distinct positive integers, dropping junk and
 * duplicates and keeping the first MAX_COMPARE_TRIPS. Order is preserved.
 */
export function parseIdsParam(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!/^\d{1,9}$/.test(trimmed)) continue;
    const id = Number(trimmed);
    if (id > 0) seen.add(id);
  }
  return [...seen].slice(0, MAX_COMPARE_TRIPS);
}

/** Date-only `YYYY-MM-DD` (or ISO) to UTC midnight milliseconds. Never zone-converted. */
export function dateOnlyToMs(value: string): number {
  return Date.parse(`${value.split('T')[0]}T00:00:00.000Z`);
}

export interface TimelineTripInput {
  id: number;
  startDate: string | null;
  endDate: string | null;
}

export interface TimelineBar {
  id: number;
  /** Percent from the left edge of the axis. */
  left: number;
  /** Percent of the axis width. */
  width: number;
}

export interface TimelineLayout {
  /** First and last (inclusive) date on the axis, `YYYY-MM-DD`. */
  axisStart: string;
  axisEnd: string;
  bars: TimelineBar[];
  /** Evenly spaced axis tick dates with their percent position. */
  ticks: Array<{ date: string; left: number }>;
  /** Trips with no usable start/end dates, left off the axis. */
  undated: number[];
  /** Pairs of trip ids whose date ranges share at least one day. */
  overlaps: Array<[number, number]>;
}

const MIN_BAR_WIDTH = 1.2;

/**
 * Lays trips out on one horizontal axis. End dates are inclusive, so a one-day
 * trip still has width. Returns null when no trip has both dates.
 */
export function buildTimelineLayout(trips: TimelineTripInput[]): TimelineLayout | null {
  const dated = trips
    .map((trip) => {
      if (!trip.startDate || !trip.endDate) return null;
      const start = dateOnlyToMs(trip.startDate);
      const end = dateOnlyToMs(trip.endDate);
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
      return { id: trip.id, start, endExclusive: end + MS_PER_DAY };
    })
    .filter((trip): trip is { id: number; start: number; endExclusive: number } => trip !== null);

  const datedIds = new Set(dated.map((trip) => trip.id));
  const undated = trips.filter((trip) => !datedIds.has(trip.id)).map((trip) => trip.id);
  if (dated.length === 0) return null;

  const axisStartMs = Math.min(...dated.map((trip) => trip.start));
  const axisEndMs = Math.max(...dated.map((trip) => trip.endExclusive));
  const span = axisEndMs - axisStartMs;

  const bars = dated.map((trip) => ({
    id: trip.id,
    left: ((trip.start - axisStartMs) / span) * 100,
    width: Math.max(((trip.endExclusive - trip.start) / span) * 100, MIN_BAR_WIDTH),
  }));

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const ms = axisStartMs + Math.round((span * i) / tickCount / MS_PER_DAY) * MS_PER_DAY;
    return {
      date: new Date(Math.min(ms, axisEndMs - MS_PER_DAY)).toISOString().split('T')[0],
      left: (i / tickCount) * 100,
    };
  });

  const overlaps: Array<[number, number]> = [];
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      if (dated[i].start < dated[j].endExclusive && dated[j].start < dated[i].endExclusive) {
        overlaps.push([dated[i].id, dated[j].id]);
      }
    }
  }

  return {
    axisStart: new Date(axisStartMs).toISOString().split('T')[0],
    axisEnd: new Date(axisEndMs - MS_PER_DAY).toISOString().split('T')[0],
    bars,
    ticks,
    undated,
    overlaps,
  };
}
