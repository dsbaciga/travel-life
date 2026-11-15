import axios from 'axios';
import config from '../config';
import logger from '../config/logger';
import { AppError } from '../errors/errors';

/**
 * Find a place by name or address, for choosing where to search for food.
 *
 * Uses the OpenStreetMap Nominatim search API, whose usage policy asks for an identifying
 * User-Agent, no more than one request a second and caching. Answers are cached for an hour
 * per query, identical concurrent searches share one request, and the per-user rate limit on
 * the route keeps a single user well under the policy.
 */

const USER_AGENT = 'TravelLife/7 (self-hosted travel journal; place search)';
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export interface PlaceSearchResult {
  /** Short name, e.g. "Reykjavik" or "Hallgrimskirkja". */
  name: string;
  /** Full descriptive line to tell similar results apart. */
  description: string;
  latitude: number;
  longitude: number;
}

interface NominatimHit {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
}

const cache = new Map<string, { expires: number; results: Promise<PlaceSearchResult[]> }>();

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function toResults(hits: readonly NominatimHit[]): PlaceSearchResult[] {
  const results: PlaceSearchResult[] = [];
  for (const hit of hits) {
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    const description = hit.display_name?.trim();
    if (!description || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const name = hit.name?.trim() || description.split(',')[0].trim();
    results.push({ name, description, latitude, longitude });
  }
  return results;
}

async function fetchResults(query: string, limit: number): Promise<PlaceSearchResult[]> {
  try {
    const response = await axios.get<NominatimHit[]>(`${config.placeSearch.url.replace(/\/$/, '')}/search`, {
      params: { q: query, format: 'jsonv2', limit, addressdetails: 0, dedupe: 1 },
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      timeout: TIMEOUT_MS,
    });
    return toResults(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    logger.warn(`Place search failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new AppError('Place search is unavailable right now. Please try again in a moment.', 503);
  }
}

export async function searchPlaces(query: string, limit = 5): Promise<PlaceSearchResult[]> {
  const key = `${normalizeQuery(query)}|${limit}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.results;

  const results = fetchResults(query.trim(), limit);
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: now + CACHE_TTL_MS, results });
  // A failed search must not be remembered, or one blip blocks the query for an hour.
  results.catch(() => {
    if (cache.get(key)?.results === results) cache.delete(key);
  });
  return results;
}

export function clearPlaceSearchCache(): void {
  cache.clear();
}

const placeSearchService = { searchPlaces };
export default placeSearchService;
