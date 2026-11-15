import axios from 'axios';
import config from '../config';
import logger from '../config/logger';
import { AppError } from '../errors/errors';
import { isAxiosError } from '../types/prisma-helpers';
import { haversineMeters } from './_shared/vendored/geo';
import {
  dietMatch,
  dietMatchRank,
  dietaryProfile,
  type DietaryRestriction,
  type NearbyFoodPlace,
  type NearbyFoodResponse,
  type OsmTags,
} from './_shared/vendored/nearbyFood';

/**
 * Nearby food search, from OpenStreetMap through the Overpass API.
 *
 * Free and worldwide, with no key. Restaurants carry diet tags (`diet:vegan=yes`
 * ...) only where a mapper added them, so most places come back as "not confirmed"
 * for a diet; `dietMatch` (shared with the phone) does the reading.
 *
 * The raw places are cached per area and the diet is applied afterwards, so
 * flipping the diet chip on the phone does not ask Overpass again. Overpass is a
 * shared public service: requests are cached, de-duplicated and identified, as its
 * usage policy asks.
 */

/** `amenity` values that are somewhere to eat or drink. */
const FOOD_AMENITIES = ['restaurant', 'cafe', 'fast_food', 'food_court', 'pub', 'bar', 'biergarten', 'ice_cream'];
/** `shop` values that sell food to eat now. */
const FOOD_SHOPS = ['bakery', 'deli', 'pastry'];

/** Elements asked of Overpass. More than the page size, so diet ranking has something to choose from. */
const OVERPASS_ELEMENT_CAP = 300;
/**
 * How long each server gets. A healthy one answers in a second or two, while one that is
 * queueing can take 30 s or never reply, so every server but the last is only probed for
 * a few seconds and the last gets longer.
 */
const OVERPASS_PROBE_TIMEOUT_MS = 10_000;
const OVERPASS_FINAL_TIMEOUT_MS = 25_000;

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
/** Coordinates are rounded to 3 decimals (about 110 m) to share a cache entry between nearby searches. */
const CACHE_PRECISION = 3;
/** The search runs around the rounded point, so cover the most the rounding can move it (~79 m). */
const ROUNDING_MARGIN_M = 120;

const USER_AGENT = 'TravelLife/7 (self-hosted travel journal; OpenStreetMap data via Overpass)';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface CacheEntry {
  expires: number;
  elements: Promise<OverpassElement[]>;
}

export interface NearbyFoodSearch {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  diet?: DietaryRestriction;
  limit: number;
}

export function buildOverpassQuery(latitude: number, longitude: number, radiusMeters: number): string {
  const around = `(around:${Math.round(radiusMeters)},${latitude},${longitude})`;
  return (
    `[out:json][timeout:20];(` +
    `nwr${around}["amenity"~"^(${FOOD_AMENITIES.join('|')})$"]["name"];` +
    `nwr${around}["shop"~"^(${FOOD_SHOPS.join('|')})$"]["name"];` +
    `);out center tags ${OVERPASS_ELEMENT_CAP};`
  );
}

const cleanTag = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** "Hverfisgata 12, Reykjavik" from whatever address tags the place has. */
function addressOf(tags: OsmTags): string | null {
  const street = [cleanTag(tags['addr:street']), cleanTag(tags['addr:housenumber'])].filter(Boolean).join(' ');
  const city = cleanTag(tags['addr:city']);
  const full = [street, city].filter(Boolean).join(', ');
  return full || cleanTag(tags['addr:full']);
}

/** Turn one Overpass element into a place, or null when it has no name or no position. */
function toPlace(
  element: OverpassElement,
  origin: { latitude: number; longitude: number },
  diet: DietaryRestriction | undefined
): NearbyFoodPlace | null {
  const tags: OsmTags = element.tags ?? {};
  const name = cleanTag(tags.name);
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  return {
    id: `${element.type}/${element.id}`,
    name,
    category: tags.amenity ?? tags.shop ?? 'restaurant',
    cuisine: (tags.cuisine ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean),
    latitude,
    longitude,
    distanceMeters: Math.round(haversineMeters(origin, { latitude, longitude })),
    openingHours: cleanTag(tags.opening_hours),
    phone: cleanTag(tags.phone) ?? cleanTag(tags['contact:phone']),
    website: cleanTag(tags.website) ?? cleanTag(tags['contact:website']),
    address: addressOf(tags),
    diet: diet ? dietMatch(tags, diet) : null,
    dietary: dietaryProfile(tags),
  };
}

/** Statuses a public Overpass server answers with when it is at capacity: worth retrying shortly. */
const BUSY_STATUSES = new Set([429, 502, 503, 504]);

class NearbyFoodService {
  private readonly cache = new Map<string, CacheEntry>();
  /** The server that answered last, tried first next time so a dead one is not paid for on every search. */
  private preferred = 0;

  /** Drops the cache and forgets the preferred server; used by tests. */
  clearCache(): void {
    this.cache.clear();
    this.preferred = 0;
  }

  private async postQuery(url: string, query: string, timeoutMs: number): Promise<OverpassElement[]> {
    const response = await axios.post<{ elements?: OverpassElement[] }>(
      url,
      new URLSearchParams({ data: query }).toString(),
      {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      }
    );
    return response.data?.elements ?? [];
  }

  /**
   * Asks each configured Overpass server in turn until one answers. The public ones are
   * regularly at capacity (a 502 "all query workers are busy") or accept the request and
   * never reply, so a single server makes the feature feel broken.
   */
  private async fetchFromOverpass(latitude: number, longitude: number, radiusMeters: number): Promise<OverpassElement[]> {
    const query = buildOverpassQuery(latitude, longitude, radiusMeters);
    const urls = config.overpass.urls;
    let sawBusy = false;

    for (let attempt = 0; attempt < urls.length; attempt += 1) {
      const index = (this.preferred + attempt) % urls.length;
      try {
        const isLast = attempt === urls.length - 1;
        const elements = await this.postQuery(
          urls[index],
          query,
          isLast ? OVERPASS_FINAL_TIMEOUT_MS : OVERPASS_PROBE_TIMEOUT_MS
        );
        this.preferred = index;
        return elements;
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        // No status at all is a timeout or a dropped connection: also a server too loaded to answer.
        if (status === undefined || BUSY_STATUSES.has(status)) sawBusy = true;
        logger.warn('[NearbyFood] Overpass request failed', {
          server: urls[index],
          status,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (sawBusy) {
      throw new AppError('Nearby search is busy right now. Please try again in a moment.', 503);
    }
    throw new AppError('Nearby search is unavailable right now.', 502);
  }

  /** The cached, de-duplicated elements around a point. Failures are never cached. */
  private elementsAround(latitude: number, longitude: number, radiusMeters: number): Promise<OverpassElement[]> {
    const lat = Number(latitude.toFixed(CACHE_PRECISION));
    const lng = Number(longitude.toFixed(CACHE_PRECISION));
    const key = `${lat},${lng},${radiusMeters}`;
    const now = Date.now();

    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.elements;

    const elements = this.fetchFromOverpass(lat, lng, radiusMeters + ROUNDING_MARGIN_M);
    this.cache.set(key, { expires: now + CACHE_TTL_MS, elements });
    // A failed request must not poison the entry for ten minutes.
    elements.catch(() => {
      if (this.cache.get(key)?.elements === elements) this.cache.delete(key);
    });

    // Keep the map bounded: drop the oldest entries first.
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return elements;
  }

  async searchNearbyFood(search: NearbyFoodSearch): Promise<NearbyFoodResponse> {
    const { latitude, longitude, radiusMeters, diet, limit } = search;
    const origin = { latitude, longitude };
    const elements = await this.elementsAround(latitude, longitude, radiusMeters);

    const seen = new Set<string>();
    let places: NearbyFoodPlace[] = [];
    for (const element of elements) {
      const place = toPlace(element, origin, diet);
      if (!place || place.distanceMeters > radiusMeters || seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(place);
    }

    // A place that says outright it does not cater for the diet is left out, but counted.
    let excludedCount = 0;
    if (diet) {
      const kept = places.filter((place) => place.diet !== 'no');
      excludedCount = places.length - kept.length;
      places = kept;
    }

    places.sort((a, b) => {
      if (diet && a.diet && b.diet) {
        const byMatch = dietMatchRank(a.diet) - dietMatchRank(b.diet);
        if (byMatch !== 0) return byMatch;
      }
      return a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name);
    });

    return {
      center: origin,
      radiusMeters,
      diet: diet ?? null,
      places: places.slice(0, limit),
      excludedCount,
    };
  }
}

export const nearbyFoodService = new NearbyFoodService();
export default nearbyFoodService;
