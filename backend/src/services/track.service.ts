import { fromZonedTime } from 'date-fns-tz';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { resolveTimezone, getUserTimezone } from './_shared/timezoneResolution';
import { findNearest, inferPositionAt, type TrackPoint } from './_shared/vendored/geo';
import type {
  InferPhotoLocationsInput,
  PhotoLocationProposal,
  TrackBatchInput,
} from '../types/mobile.types';

/** A photo is only matched to a fix recorded within this window of its `takenAt`. */
const MAX_PHOTO_GAP_MS = 10 * 60 * 1000;

/** How close an itinerary location must be to be proposed as the TAKEN_AT target. */
const LOCATION_MATCH_RADIUS_M = 150;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Background GPS breadcrumbs recorded by the companion app (Backlog #43) and
 * photo-location inference from them (Backlog #101).
 *
 * Points are per-user: two collaborators on one trip each have their own
 * trail, and a photo is only ever geotagged from the trail of the person
 * asking — one traveller's detour must not relocate another's photos.
 */
class TrackService {
  /**
   * Ingest a batch of points from the phone.
   *
   * Idempotent: the outbox on the phone retries a batch whenever it cannot
   * confirm delivery, and `(tripId, userId, recordedAt)` is unique, so a
   * replayed batch inserts nothing.
   *
   * @returns Counts of received and newly stored points
   */
  async ingestBatch(userId: number, tripId: number, data: TrackBatchInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // De-duplicate within the batch too: createMany's skipDuplicates covers
    // rows already in the table, and two identical timestamps in one statement
    // are also collapsed here so `stored` is an honest count.
    const seen = new Set<number>();
    const rows = [];
    for (const point of data.points) {
      const recordedAt = new Date(point.recordedAt);
      const key = recordedAt.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        tripId,
        userId,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy ?? null,
        altitude: point.altitude ?? null,
        speed: point.speed ?? null,
        recordedAt,
      });
    }

    const result = await prisma.tripTrackPoint.createMany({ data: rows, skipDuplicates: true });
    return { received: data.points.length, stored: result.count };
  }

  /**
   * One day of the caller's trail as a GeoJSON Feature, for `DayMiniMap`.
   *
   * "Day" is a calendar day where the trip is: the zone resolves
   * `requested -> trip.timezone -> user.timezone` and only then UTC.
   *
   * @param date - `YYYY-MM-DD`
   * @throws {AppError} 400 for a malformed date
   */
  async getTrackForDay(userId: number, tripId: number, date: string, timezone?: string) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    if (!DAY_KEY_PATTERN.test(date)) {
      throw new AppError('date must be YYYY-MM-DD', 400);
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { timezone: true },
    });
    const tz = resolveTimezone(timezone, trip?.timezone, await getUserTimezone(userId));

    let start: Date;
    let end: Date;
    try {
      start = fromZonedTime(`${date}T00:00:00`, tz);
      const [y, m, d] = date.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      end = fromZonedTime(`${next}T00:00:00`, tz);
    } catch {
      throw new AppError('Invalid timezone', 400);
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError('Invalid date or timezone', 400);
    }

    const points = await prisma.tripTrackPoint.findMany({
      where: { tripId, userId, recordedAt: { gte: start, lt: end } },
      orderBy: { recordedAt: 'asc' },
      select: { latitude: true, longitude: true, recordedAt: true },
    });

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        // GeoJSON is lng/lat (RFC 7946).
        coordinates: points.map((p) => [Number(p.longitude), Number(p.latitude)]),
      },
      properties: {
        date,
        timezone: tz,
        pointCount: points.length,
        // Parallel to `coordinates`, so the client can scrub the line by time.
        timestamps: points.map((p) => p.recordedAt.toISOString()),
        startedAt: points[0]?.recordedAt.toISOString() ?? null,
        endedAt: points[points.length - 1]?.recordedAt.toISOString() ?? null,
      },
    };
  }

  /**
   * Geotag photos that have a timestamp but no coordinates by matching
   * `takenAt` against the caller's GPS trail, and propose a TAKEN_AT link to
   * the itinerary location they were standing at.
   *
   * Read-only unless `apply` is set. Applying needs edit permission and runs
   * in one transaction so a photo never gets coordinates without its link.
   */
  async inferPhotoLocations(
    userId: number,
    tripId: number,
    data: InferPhotoLocationsInput = {}
  ): Promise<{ proposals: PhotoLocationProposal[]; applied: number; unmatched: number }> {
    await verifyTripAccessWithPermission(userId, tripId, data.apply ? 'edit' : 'view');

    const photos = await prisma.photo.findMany({
      where: {
        tripId,
        takenAt: { not: null },
        OR: [{ latitude: null }, { longitude: null }],
        ...(data.photoIds ? { id: { in: data.photoIds } } : {}),
      },
      select: { id: true, takenAt: true },
      orderBy: { takenAt: 'asc' },
    });

    if (photos.length === 0) {
      return { proposals: [], applied: 0, unmatched: 0 };
    }

    const times = photos.map((p) => (p.takenAt as Date).getTime());
    const windowStart = new Date(Math.min(...times) - MAX_PHOTO_GAP_MS);
    const windowEnd = new Date(Math.max(...times) + MAX_PHOTO_GAP_MS);

    const [trackRows, locations] = await Promise.all([
      prisma.tripTrackPoint.findMany({
        where: { tripId, userId, recordedAt: { gte: windowStart, lte: windowEnd } },
        orderBy: { recordedAt: 'asc' },
        select: { latitude: true, longitude: true, recordedAt: true },
      }),
      prisma.location.findMany({
        where: { tripId, latitude: { not: null }, longitude: { not: null } },
        select: { id: true, name: true, latitude: true, longitude: true },
      }),
    ]);

    const track: TrackPoint[] = trackRows.map((p) => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      recordedAt: p.recordedAt,
    }));
    const places = locations.map((l) => ({
      id: l.id,
      name: l.name,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
    }));

    const proposals: PhotoLocationProposal[] = [];
    for (const photo of photos) {
      const position = inferPositionAt(track, photo.takenAt as Date, MAX_PHOTO_GAP_MS);
      if (!position) continue;
      const nearest = findNearest(position, places, LOCATION_MATCH_RADIUS_M);
      proposals.push({
        photoId: photo.id,
        latitude: Number(position.latitude.toFixed(8)),
        longitude: Number(position.longitude.toFixed(8)),
        method: position.method,
        gapMs: position.gapMs,
        location: nearest
          ? {
              id: nearest.item.id,
              name: nearest.item.name,
              distanceMeters: Math.round(nearest.distanceMeters),
            }
          : null,
      });
    }

    let applied = 0;
    if (data.apply && proposals.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const proposal of proposals) {
          await tx.photo.update({
            where: { id: proposal.photoId },
            data: { latitude: proposal.latitude, longitude: proposal.longitude },
          });
        }
        const links = proposals
          .filter((p) => p.location !== null)
          .map((p) => ({
            tripId,
            sourceType: 'PHOTO' as const,
            sourceId: p.photoId,
            targetType: 'LOCATION' as const,
            targetId: (p.location as { id: number }).id,
            relationship: 'TAKEN_AT' as const,
          }));
        if (links.length > 0) {
          // A photo may already be linked to that location by hand.
          await tx.entityLink.createMany({ data: links, skipDuplicates: true });
        }
      });
      applied = proposals.length;
    }

    return { proposals, applied, unmatched: photos.length - proposals.length };
  }
}

export default new TrackService();
