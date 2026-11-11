/**
 * The "passive intelligence" pieces that need no network: context-aware link
 * suggestions, share-sheet parsing, camera-roll grouping, the widget snapshot,
 * the parking pin, and budget burn rate. All pure.
 */

import type {
  ActivityDto,
  EntityId,
  EntityType,
  ExpenseDto,
  LatLng,
  LinkRelationship,
  LocationDto,
  LodgingDto,
  TripDto,
} from '@travel-life/shared';
import {
  dateOnlyKey,
  findNearest,
  formatCountdown,
  formatTimeInTimezone,
  getDefaultRelationship,
  haversineMeters,
  isUsableCoordinate,
} from '@travel-life/shared';
import { findCurrentContext, type NextUp } from './timeline';

// =============================================================================
// SMART CONTEXT AUTO-LINKING
// =============================================================================

/** Plan §3.2: suggest the Location within 150 m. */
export const AUTO_LINK_RADIUS_M = 150;

export interface LinkSuggestion {
  targetType: EntityType;
  targetId: EntityId;
  relationship: LinkRelationship;
  label: string;
  reason: 'nearby' | 'happening_now';
  /** Present for `nearby`. */
  distanceMeters?: number;
}

export interface AutoLinkContext {
  locations: readonly LocationDto[];
  activities: readonly ActivityDto[];
  lodging: readonly LodgingDto[];
}

/**
 * What a new entity should probably be linked to, given where and when it was
 * made. The relationship is the shared default for the pair (a photo near a
 * location is TAKEN_AT, a journal entry DOCUMENTS whatever it touches).
 *
 * @param sourceType - The entity being created
 * @param position - Current GPS fix, if there is one
 * @param at - When the entity happened (now, or a photo's EXIF time)
 */
export function suggestLinks(
  sourceType: EntityType,
  context: AutoLinkContext,
  position: Partial<LatLng> | null | undefined,
  at: Date = new Date()
): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];

  if (sourceType !== 'LOCATION' && isUsableCoordinate(position)) {
    const nearest = findNearest(position, context.locations, AUTO_LINK_RADIUS_M);
    if (nearest) {
      suggestions.push({
        targetType: 'LOCATION',
        targetId: nearest.item.id,
        relationship: getDefaultRelationship(sourceType, 'LOCATION'),
        label: nearest.item.name,
        reason: 'nearby',
        distanceMeters: Math.round(nearest.distanceMeters),
      });
    }
  }

  const { activity, lodging } = findCurrentContext(context, at);
  if (activity && sourceType !== 'ACTIVITY') {
    suggestions.push({
      targetType: 'ACTIVITY',
      targetId: activity.id,
      relationship: getDefaultRelationship(sourceType, 'ACTIVITY'),
      label: activity.name,
      reason: 'happening_now',
    });
  }
  // Lodging is "happening" for days at a time; only offer it when nothing more
  // specific is, or it would be attached to every photo of the trip.
  if (lodging && !activity && sourceType !== 'LODGING' && sourceType !== 'ACTIVITY') {
    suggestions.push({
      targetType: 'LODGING',
      targetId: lodging.id,
      relationship: getDefaultRelationship(sourceType, 'LODGING'),
      label: lodging.name,
      reason: 'happening_now',
    });
  }
  return suggestions;
}

// =============================================================================
// SHARE SHEET
// =============================================================================

export type SharedContent =
  | { type: 'place'; name: string | null; latitude: number | null; longitude: number | null; url: string }
  | { type: 'url'; url: string; title: string | null }
  | { type: 'pdf'; uri: string; name: string | null }
  | { type: 'images'; uris: string[] }
  | { type: 'text'; text: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const MAPS_HOST =
  /(^|\.)(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|maps\.apple)/i;

const inRange = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Pull a place out of a Google/Apple Maps share URL.
 * Short links (`maps.app.goo.gl/…`) carry no coordinates; those return the
 * place with null coordinates so the UI can still save it by name.
 */
export function parseMapsUrl(
  url: string,
  fallbackName: string | null = null
): Extract<SharedContent, { type: 'place' }> | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!MAPS_HOST.test(`${parsed.hostname}${parsed.pathname}`)) return null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  let name: string | null = fallbackName;

  const take = (lat: string, lng: string): boolean => {
    const a = Number(lat);
    const b = Number(lng);
    if (!inRange(a, b)) return false;
    latitude = a;
    longitude = b;
    return true;
  };

  // Google: the pin itself is in `!3d<lat>!4d<lng>`; `@lat,lng,zoom` is only
  // the viewport centre, so prefer the former.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  const viewport = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  const pair = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;
  if (pin) take(pin[1], pin[2]);
  if (latitude === null) {
    for (const key of ['ll', 'sll', 'q', 'query', 'coordinate', 'center', 'daddr']) {
      const match = pair.exec(parsed.searchParams.get(key) ?? '');
      if (match && take(match[1], match[2])) break;
    }
  }
  if (latitude === null && viewport) take(viewport[1], viewport[2]);

  const placeSegment = /\/maps\/place\/([^/@]+)/.exec(parsed.pathname);
  if (placeSegment) {
    name = decodeURIComponent(placeSegment[1].replace(/\+/g, ' '));
  } else {
    const q = parsed.searchParams.get('q') ?? parsed.searchParams.get('query') ?? parsed.searchParams.get('name');
    if (q && !pair.test(q)) name = q;
  }

  return { type: 'place', name: name?.trim() || null, latitude, longitude, url };
}

export interface RawShare {
  text?: string | null;
  webUrl?: string | null;
  files?: readonly { path: string; mimeType?: string | null; fileName?: string | null }[] | null;
}

/** Decide what an incoming share is, so the right "save as…" sheet opens. */
export function classifyShare(share: RawShare): SharedContent | null {
  const files = share.files ?? [];
  const pdf = files.find(
    (file) => file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName ?? file.path)
  );
  if (pdf) return { type: 'pdf', uri: pdf.path, name: pdf.fileName ?? null };

  const images = files.filter((file) => (file.mimeType ?? '').startsWith('image/'));
  if (images.length > 0) return { type: 'images', uris: images.map((file) => file.path) };

  const text = share.text?.trim() ?? '';
  const url = share.webUrl?.trim() || URL_PATTERN.exec(text)?.[0] || '';
  if (url) {
    // Apps share "Place name\nhttps://…": the text around the URL is the title.
    const title = text.replace(url, '').trim().split('\n')[0]?.trim() || null;
    return parseMapsUrl(url, title) ?? { type: 'url', url, title };
  }
  return text ? { type: 'text', text } : null;
}

// =============================================================================
// CAMERA ROLL
// =============================================================================

export interface CameraAsset {
  id: string;
  uri: string;
  /** Epoch ms. */
  creationTime: number;
  latitude?: number | null;
  longitude?: number | null;
}

/** Assets created during the trip (inclusive of both end days, in the trip's zone). */
export function filterAssetsForTrip<T extends CameraAsset>(
  assets: readonly T[],
  trip: Pick<TripDto, 'startDate' | 'endDate'>,
  dayKeyOf: (epochMs: number) => string
): T[] {
  const start = dateOnlyKey(trip.startDate);
  const end = dateOnlyKey(trip.endDate);
  if (!start || !end) return [];
  return assets.filter((asset) => {
    const key = dayKeyOf(asset.creationTime);
    return key >= start && key <= end;
  });
}

export interface AssetCluster<T extends CameraAsset> {
  assets: T[];
  startMs: number;
  endMs: number;
  center: LatLng | null;
}

/**
 * Group photos into "moments": consecutive shots less than `maxGapMinutes`
 * apart and, when both carry GPS, within `maxDistanceMeters` of each other.
 */
export function clusterAssets<T extends CameraAsset>(
  assets: readonly T[],
  options: { maxGapMinutes?: number; maxDistanceMeters?: number } = {}
): AssetCluster<T>[] {
  const maxGap = (options.maxGapMinutes ?? 20) * 60000;
  const maxDistance = options.maxDistanceMeters ?? 250;
  const sorted = assets.slice().sort((a, b) => a.creationTime - b.creationTime);
  const groups: T[][] = [];

  for (const asset of sorted) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    let joins = false;
    if (previous && asset.creationTime - previous.creationTime <= maxGap) {
      joins =
        !isUsableCoordinate(previous) ||
        !isUsableCoordinate(asset) ||
        haversineMeters(previous, asset) <= maxDistance;
    }
    if (joins) group.push(asset);
    else groups.push([asset]);
  }

  return groups.map((group) => {
    const located = group.filter((asset): asset is T & LatLng => isUsableCoordinate(asset));
    return {
      assets: group,
      startMs: group[0].creationTime,
      endMs: group[group.length - 1].creationTime,
      center:
        located.length > 0
          ? {
              latitude: located.reduce((sum, a) => sum + a.latitude, 0) / located.length,
              longitude: located.reduce((sum, a) => sum + a.longitude, 0) / located.length,
            }
          : null,
    };
  });
}

// =============================================================================
// WIDGET SNAPSHOT
// =============================================================================

export interface WidgetSnapshot {
  tripTitle: string | null;
  title: string;
  /** "14:05 CEST" style. */
  timeLabel: string | null;
  countdown: string | null;
  detail: string | null;
  /** Deep link the widget opens. */
  url: string;
  generatedAt: string;
}

/** What the home-screen widget shows. Written to shared storage after each sync. */
export function buildWidgetSnapshot(
  trip: Pick<TripDto, 'id' | 'title' | 'startDate'> | null,
  nextUp: NextUp | null,
  now: Date = new Date()
): WidgetSnapshot {
  const generatedAt = now.toISOString();
  if (!trip) {
    return {
      tripTitle: null,
      title: 'No upcoming trip',
      timeLabel: null,
      countdown: null,
      detail: null,
      url: 'travellife://',
      generatedAt,
    };
  }
  if (!nextUp || !nextUp.item.start) {
    const start = trip.startDate ? new Date(trip.startDate) : null;
    const upcoming = start && start.getTime() > now.getTime();
    return {
      tripTitle: trip.title,
      title: upcoming ? trip.title : 'Nothing scheduled next',
      timeLabel: null,
      countdown: upcoming && start ? formatCountdown(start, now) : null,
      detail: null,
      url: `travellife://trip/${trip.id}`,
      generatedAt,
    };
  }
  const { item, inProgress } = nextUp;
  const detail = [
    item.status === 'delayed' && item.delayMinutes ? `Delayed ${item.delayMinutes}m` : null,
    item.confirmation,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    tripTitle: trip.title,
    title: item.title,
    timeLabel: formatTimeInTimezone(item.start, item.timezone),
    countdown: inProgress ? 'now' : formatCountdown(item.start as string, now),
    detail: detail || null,
    url: `travellife://trip/${trip.id}`,
    generatedAt,
  };
}

// =============================================================================
// WHERE I PARKED (#123)
// =============================================================================

export interface ParkingPin extends LatLng {
  savedAt: string;
  note: string | null;
  photoUri: string | null;
  /** When the meter runs out. */
  meterExpiresAt: string | null;
}

export type MeterState = 'none' | 'ok' | 'soon' | 'expired';

/** Meter status with a ten-minute "go now" warning window. */
export function meterStatus(pin: Pick<ParkingPin, 'meterExpiresAt'>, now: Date = new Date()): {
  state: MeterState;
  label: string | null;
} {
  if (!pin.meterExpiresAt) return { state: 'none', label: null };
  const remaining = new Date(pin.meterExpiresAt).getTime() - now.getTime();
  if (Number.isNaN(remaining)) return { state: 'none', label: null };
  if (remaining <= 0) return { state: 'expired', label: `Expired ${formatCountdown(pin.meterExpiresAt, now)}` };
  return {
    state: remaining <= 10 * 60000 ? 'soon' : 'ok',
    label: `Meter ${formatCountdown(pin.meterExpiresAt, now)}`,
  };
}

// =============================================================================
// BUDGET BURN RATE (#106)
// =============================================================================

export interface BurnRate {
  spent: number;
  budget: number;
  /** Fraction of the budget spent, 0–1+. */
  spentFraction: number;
  /** Fraction of the trip elapsed, 0–1. */
  elapsedFraction: number;
  state: 'under' | 'on_track' | 'over';
  /** Share of expenses that had no converted amount and were left out. */
  unconvertedCount: number;
}

/**
 * Spending pace against the trip budget.
 *
 * Uses each expense's FX-snapshotted `baseAmount` when the server computed
 * one, the raw amount when the expense is already in the budget currency, and
 * skips anything else rather than adding unlike currencies together.
 */
export function computeBurnRate(
  trip: Pick<TripDto, 'budget' | 'budgetCurrency' | 'startDate' | 'endDate'>,
  expenses: readonly ExpenseDto[],
  todayKey: string
): BurnRate | null {
  if (!trip.budget || trip.budget <= 0) return null;
  let spent = 0;
  let unconvertedCount = 0;
  for (const expense of expenses) {
    if (expense.baseAmount !== null && expense.baseAmount !== undefined) spent += expense.baseAmount;
    else if (!expense.currency || expense.currency === trip.budgetCurrency) spent += expense.amount;
    else unconvertedCount += 1;
  }

  const start = dateOnlyKey(trip.startDate);
  const end = dateOnlyKey(trip.endDate);
  let elapsedFraction = 1;
  if (start && end) {
    const dayMs = 86400000;
    const total = (Date.parse(end) - Date.parse(start)) / dayMs + 1;
    const elapsed = (Date.parse(todayKey) - Date.parse(start)) / dayMs + 1;
    elapsedFraction = Math.max(0, Math.min(1, elapsed / total));
  }

  const spentFraction = spent / trip.budget;
  const state =
    spentFraction > 1 || spentFraction > elapsedFraction + 0.1
      ? 'over'
      : spentFraction < elapsedFraction - 0.1
        ? 'under'
        : 'on_track';
  return {
    spent: Math.round(spent * 100) / 100,
    budget: trip.budget,
    spentFraction,
    elapsedFraction,
    state,
    unconvertedCount,
  };
}
