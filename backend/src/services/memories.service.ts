import prisma from '../config/database';
import { AppError } from '../errors/errors';
import {
  MemoryJournalEntry,
  MemoryPhoto,
  MemoryTrip,
  OnThisDayYear,
  YearInReview,
  YearInReviewTag,
} from '../types/memories.types';

/** Trip statuses that never represent real travel and are excluded from memories. */
const EXCLUDED_STATUSES = ['Dream', 'Planning', 'Cancelled'];

/** Maximum photos returned per "On This Day" year group. */
const MAX_PHOTOS_PER_YEAR = 8;

/** Number of highlight photos spread across a Year in Review. */
const HIGHLIGHT_PHOTO_COUNT = 12;

/** Number of top tags returned for a Year in Review. */
const TOP_TAG_COUNT = 5;

interface RawMemoryPhoto {
  id: number;
  trip_id: number;
  source: string;
  local_path: string | null;
  thumbnail_path: string | null;
  caption: string | null;
  taken_at: Date;
  trip_title: string;
}

interface RawMemoryJournalEntry {
  id: number;
  trip_id: number;
  title: string | null;
  content: string;
  date: Date;
  trip_title: string;
}

const tripSelect = {
  id: true,
  title: true,
  startDate: true,
  endDate: true,
  status: true,
  tripTypeEmoji: true,
  coverPhoto: {
    select: { id: true, source: true, thumbnailPath: true, localPath: true },
  },
} as const;

interface TripRecord {
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  tripTypeEmoji: string | null;
  coverPhoto: {
    id: number;
    source: string;
    thumbnailPath: string | null;
    localPath: string | null;
  } | null;
}

function toMemoryTrip(trip: TripRecord): MemoryTrip {
  return {
    id: trip.id,
    title: trip.title,
    startDate: trip.startDate ? trip.startDate.toISOString() : null,
    endDate: trip.endDate ? trip.endDate.toISOString() : null,
    status: trip.status,
    tripTypeEmoji: trip.tripTypeEmoji,
    coverPhoto: trip.coverPhoto
      ? {
          id: trip.coverPhoto.id,
          source: trip.coverPhoto.source,
          thumbnailPath: trip.coverPhoto.thumbnailPath,
          localPath: trip.coverPhoto.localPath,
        }
      : null,
  };
}

function toMemoryPhoto(raw: RawMemoryPhoto): MemoryPhoto {
  return {
    id: raw.id,
    tripId: raw.trip_id,
    tripTitle: raw.trip_title,
    source: raw.source,
    thumbnailPath: raw.thumbnail_path,
    localPath: raw.local_path,
    caption: raw.caption,
    takenAt: raw.taken_at ? raw.taken_at.toISOString() : null,
  };
}

/**
 * Build a UTC date for (year, month, day) and verify it is a real calendar
 * date (guards against Feb 29 rolling over to Mar 1 in non-leap years).
 */
function utcDateOrNull(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Heuristically extract country and city names from a free-text address.
 * Addresses come from Nominatim geocoding and are comma-separated, ending
 * with the country. Segments containing digits (street numbers, postal
 * codes) are ignored.
 */
function parseAddressParts(address: string): { country: string | null; city: string | null } {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length < 60 && !/\d/.test(part));

  if (parts.length === 0) {
    return { country: null, city: null };
  }

  const country = parts[parts.length - 1];

  // Walk backwards past region-like segments that embed the country name
  // (e.g. "Metropolitan France") to find a plausible city segment.
  const candidates = parts
    .slice(0, -1)
    .filter((part) => !part.toLowerCase().includes(country.toLowerCase()));

  // The segment right before the country is usually a state/region, and the
  // one before that the city/county (e.g. "Los Angeles, California, United
  // States"). Short addresses like "Paris, France" have just the city.
  let city: string | null = null;
  if (candidates.length >= 2) {
    city = candidates[candidates.length - 2];
  } else if (candidates.length === 1) {
    city = candidates[0];
  }

  if (city) {
    city = city.replace(/\s+(County|District|Municipality)$/i, '').trim() || null;
  }

  return { country, city };
}

class MemoriesService {
  /**
   * Find things that happened on the given month/day in prior years:
   * trips in progress on that date, photos taken on that date, and journal
   * entries dated that date. Grouped by year, newest year first.
   */
  async getOnThisDay(userId: number, month?: number, day?: number): Promise<OnThisDayYear[]> {
    const today = new Date();
    const targetMonth = month ?? today.getMonth() + 1;
    const targetDay = day ?? today.getDate();

    if (targetMonth < 1 || targetMonth > 12 || targetDay < 1 || targetDay > 31) {
      throw new AppError('Invalid month or day', 400);
    }

    const currentYear = today.getFullYear();

    const [trips, photos, journalEntries] = await Promise.all([
      prisma.trip.findMany({
        where: {
          userId,
          status: { notIn: EXCLUDED_STATUSES },
          startDate: { not: null },
          endDate: { not: null },
        },
        select: tripSelect,
      }),
      prisma.$queryRaw<RawMemoryPhoto[]>`
        SELECT p.id, p.trip_id, p.source, p.local_path, p.thumbnail_path,
               p.caption, p.taken_at, t.title AS trip_title
        FROM photos p
        JOIN trips t ON t.id = p.trip_id
        WHERE t.user_id = ${userId}
          AND p.taken_at IS NOT NULL
          AND EXTRACT(MONTH FROM p.taken_at) = ${targetMonth}
          AND EXTRACT(DAY FROM p.taken_at) = ${targetDay}
          AND EXTRACT(YEAR FROM p.taken_at) < ${currentYear}
        ORDER BY p.taken_at DESC
        LIMIT 200
      `,
      prisma.$queryRaw<RawMemoryJournalEntry[]>`
        SELECT j.id, j.trip_id, j.title, LEFT(j.content, 220) AS content,
               j.date, t.title AS trip_title
        FROM journal_entries j
        JOIN trips t ON t.id = j.trip_id
        WHERE t.user_id = ${userId}
          AND j.date IS NOT NULL
          AND EXTRACT(MONTH FROM j.date) = ${targetMonth}
          AND EXTRACT(DAY FROM j.date) = ${targetDay}
          AND EXTRACT(YEAR FROM j.date) < ${currentYear}
        ORDER BY j.date DESC
        LIMIT 100
      `,
    ]);

    const yearGroups = new Map<number, OnThisDayYear>();
    const groupFor = (year: number): OnThisDayYear => {
      let group = yearGroups.get(year);
      if (!group) {
        group = { year, trips: [], photos: [], journalEntries: [] };
        yearGroups.set(year, group);
      }
      return group;
    };

    // Trips that were in progress on this month/day in a prior year
    for (const trip of trips) {
      if (!trip.startDate || !trip.endDate) continue;
      const startYear = trip.startDate.getUTCFullYear();
      const endYear = trip.endDate.getUTCFullYear();
      for (let year = startYear; year <= Math.min(endYear, currentYear - 1); year++) {
        const candidate = utcDateOrNull(year, targetMonth, targetDay);
        if (!candidate) continue;
        if (candidate >= trip.startDate && candidate <= trip.endDate) {
          groupFor(year).trips.push(toMemoryTrip(trip));
        }
      }
    }

    // Photos taken on this month/day in prior years
    for (const raw of photos) {
      const year = raw.taken_at.getUTCFullYear();
      const group = groupFor(year);
      if (group.photos.length < MAX_PHOTOS_PER_YEAR) {
        group.photos.push(toMemoryPhoto(raw));
      }
    }

    // Journal entries dated this month/day in prior years
    for (const entry of journalEntries) {
      const year = entry.date.getUTCFullYear();
      const excerpt =
        entry.content.length > 200 ? `${entry.content.slice(0, 200).trimEnd()}…` : entry.content;
      const memoryEntry: MemoryJournalEntry = {
        id: entry.id,
        tripId: entry.trip_id,
        tripTitle: entry.trip_title,
        title: entry.title,
        date: entry.date.toISOString(),
        excerpt,
      };
      groupFor(year).journalEntries.push(memoryEntry);
    }

    return Array.from(yearGroups.values()).sort((a, b) => b.year - a.year);
  }

  /**
   * Aggregate a calendar year of travel: trips overlapping the year, days
   * traveled, countries/cities, distance, flights, photos, journal entries,
   * top tags, per-month trip-day counts, and highlight photos.
   */
  async getYearInReview(userId: number, year: number): Promise<YearInReview> {
    if (year < 1900 || year > 2100) {
      throw new AppError('Invalid year: must be between 1900 and 2100', 400);
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const [allDatedTrips, yearTrips] = await Promise.all([
      prisma.trip.findMany({
        where: {
          userId,
          status: { notIn: EXCLUDED_STATUSES },
          startDate: { not: null },
          endDate: { not: null },
        },
        select: { startDate: true, endDate: true },
      }),
      prisma.trip.findMany({
        where: {
          userId,
          status: { notIn: EXCLUDED_STATUSES },
          startDate: { not: null, lte: yearEnd },
          endDate: { not: null, gte: yearStart },
        },
        select: tripSelect,
        orderBy: { startDate: 'asc' },
      }),
    ]);

    // Years with at least one dated trip, newest first (for the year selector)
    const availableYearSet = new Set<number>();
    for (const trip of allDatedTrips) {
      if (!trip.startDate || !trip.endDate) continue;
      for (let y = trip.startDate.getUTCFullYear(); y <= trip.endDate.getUTCFullYear(); y++) {
        availableYearSet.add(y);
      }
    }
    const availableYears = Array.from(availableYearSet).sort((a, b) => b - a);

    const tripIds = yearTrips.map((trip) => trip.id);

    // Days traveled + per-month trip-day counts (union of trip days, clipped to the year)
    const traveledDays = new Set<string>();
    const monthlyTripDays = new Array<number>(12).fill(0);
    for (const trip of yearTrips) {
      if (!trip.startDate || !trip.endDate) continue;
      const from = trip.startDate > yearStart ? trip.startDate : yearStart;
      const to = trip.endDate < yearEnd ? trip.endDate : yearEnd;
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
      while (cursor <= to) {
        const key = cursor.toISOString().slice(0, 10);
        if (!traveledDays.has(key)) {
          traveledDays.add(key);
          monthlyTripDays[cursor.getUTCMonth()] += 1;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // Everything below is empty/zero when the year has no trips, which the
    // frontend renders as an empty state.
    const [locations, transportation, photoCount, journalEntryCount, tagCounts, rawHighlights] =
      await Promise.all([
        tripIds.length > 0
          ? prisma.location.findMany({
              where: { tripId: { in: tripIds }, address: { not: null } },
              select: { address: true },
            })
          : Promise.resolve([]),
        tripIds.length > 0
          ? prisma.transportation.findMany({
              where: { tripId: { in: tripIds } },
              select: { type: true, calculatedDistance: true },
            })
          : Promise.resolve([]),
        prisma.photo.count({
          where: {
            trip: { userId },
            OR: [
              { takenAt: { gte: yearStart, lte: yearEnd } },
              ...(tripIds.length > 0 ? [{ takenAt: null, tripId: { in: tripIds } }] : []),
            ],
          },
        }),
        prisma.journalEntry.count({
          where: {
            trip: { userId },
            OR: [
              { date: { gte: yearStart, lte: yearEnd } },
              ...(tripIds.length > 0 ? [{ date: null, tripId: { in: tripIds } }] : []),
            ],
          },
        }),
        tripIds.length > 0
          ? prisma.tripTagAssignment.groupBy({
              by: ['tagId'],
              where: { tripId: { in: tripIds } },
              _count: { tagId: true },
            })
          : Promise.resolve([]),
        prisma.$queryRaw<RawMemoryPhoto[]>`
          SELECT p.id, p.trip_id, p.source, p.local_path, p.thumbnail_path,
                 p.caption, p.taken_at, t.title AS trip_title
          FROM photos p
          JOIN trips t ON t.id = p.trip_id
          WHERE t.user_id = ${userId}
            AND p.taken_at >= ${yearStart}
            AND p.taken_at <= ${yearEnd}
          ORDER BY p.taken_at ASC
        `,
      ]);

    // Distinct countries and cities parsed from location addresses
    const countries = new Map<string, string>();
    const cities = new Map<string, string>();
    for (const location of locations) {
      if (!location.address) continue;
      const { country, city } = parseAddressParts(location.address);
      if (country && !countries.has(country.toLowerCase())) {
        countries.set(country.toLowerCase(), country);
      }
      if (city && !cities.has(city.toLowerCase())) {
        cities.set(city.toLowerCase(), city);
      }
    }

    // Distance + flight count from transportation records
    let totalDistanceKm = 0;
    let flightCount = 0;
    for (const leg of transportation) {
      if (leg.calculatedDistance) {
        totalDistanceKm += Number(leg.calculatedDistance);
      }
      if (leg.type.toLowerCase() === 'flight') {
        flightCount += 1;
      }
    }

    // Top tags across the year's trips
    const sortedTagCounts = [...tagCounts]
      .sort((a, b) => b._count.tagId - a._count.tagId)
      .slice(0, TOP_TAG_COUNT);
    let topTags: YearInReviewTag[] = [];
    if (sortedTagCounts.length > 0) {
      const tags = await prisma.tripTag.findMany({
        where: { id: { in: sortedTagCounts.map((t) => t.tagId) } },
        select: { id: true, name: true, color: true, textColor: true },
      });
      const tagById = new Map(tags.map((tag) => [tag.id, tag]));
      topTags = sortedTagCounts.flatMap((entry) => {
        const tag = tagById.get(entry.tagId);
        return tag
          ? [{ id: tag.id, name: tag.name, color: tag.color, textColor: tag.textColor, tripCount: entry._count.tagId }]
          : [];
      });
    }

    // Spread up to HIGHLIGHT_PHOTO_COUNT photos evenly across the year
    let highlightPhotos: MemoryPhoto[] = [];
    if (rawHighlights.length > 0) {
      if (rawHighlights.length <= HIGHLIGHT_PHOTO_COUNT) {
        highlightPhotos = rawHighlights.map(toMemoryPhoto);
      } else {
        const step = rawHighlights.length / HIGHLIGHT_PHOTO_COUNT;
        for (let i = 0; i < HIGHLIGHT_PHOTO_COUNT; i++) {
          highlightPhotos.push(toMemoryPhoto(rawHighlights[Math.floor(i * step)]));
        }
      }
    }

    return {
      year,
      availableYears,
      tripCount: yearTrips.length,
      daysTraveled: traveledDays.size,
      countries: Array.from(countries.values()).sort(),
      cities: Array.from(cities.values()).sort(),
      totalDistanceKm: Math.round(totalDistanceKm),
      flightCount,
      photoCount,
      journalEntryCount,
      topTags,
      monthlyTripDays,
      trips: yearTrips.map(toMemoryTrip),
      highlightPhotos,
    };
  }
}

export default new MemoriesService();
