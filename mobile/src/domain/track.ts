/**
 * Storage and upload of GPS breadcrumbs. Pure SQLite + an injected sender, so
 * it is unit-tested without the native location module.
 */
import type { TrackPointDto } from '@travel-life/shared';
import { thinTrack } from '@travel-life/shared';
import type { SqlDriver } from '../db/driver';
import { ApiError } from '../sync/engine';

/** Server-side cap per request (`TRACK_BATCH_MAX_POINTS`), with headroom. */
const UPLOAD_BATCH = 500;

interface TrackRow {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  recorded_at: string;
}

/** Fixes worse than this are noise (indoors, tunnels) and only bloat the trail. */
const MAX_ACCEPTABLE_ACCURACY_M = 100;

/** Append fixes for a trip. Duplicate timestamps are ignored. */
export async function storeTrackPoints(
  db: SqlDriver,
  tripId: number,
  points: readonly TrackPointDto[]
): Promise<number> {
  let stored = 0;
  await db.transaction(async (tx) => {
    for (const point of points) {
      if (
        point.accuracy !== null &&
        point.accuracy !== undefined &&
        point.accuracy > MAX_ACCEPTABLE_ACCURACY_M
      ) {
        continue;
      }
      await tx.run(
        `INSERT OR IGNORE INTO track_points
           (trip_id, latitude, longitude, accuracy, altitude, speed, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tripId,
          point.latitude,
          point.longitude,
          point.accuracy ?? null,
          point.altitude ?? null,
          point.speed ?? null,
          point.recordedAt,
        ]
      );
      stored += 1;
    }
  });
  return stored;
}

/** One day's recorded trail for a trip, oldest first. */
export async function loadTrack(
  db: SqlDriver,
  tripId: number,
  fromIso: string,
  toIso: string
): Promise<TrackPointDto[]> {
  const rows = await db.all<TrackRow>(
    `SELECT * FROM track_points WHERE trip_id = ? AND recorded_at >= ? AND recorded_at < ?
     ORDER BY recorded_at ASC`,
    [tripId, fromIso, toIso]
  );
  return rows.map((row) => ({
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    recordedAt: row.recorded_at,
  }));
}

/**
 * Upload pending fixes in batches. Thinned first: a phone resting on a café
 * table produces hundreds of near-identical points that cost roaming data and
 * add nothing to the line. Stops quietly when offline.
 *
 * @returns Number of rows marked uploaded
 */
export async function uploadPendingTrack(
  db: SqlDriver,
  send: (tripId: number, points: TrackPointDto[]) => Promise<void>
): Promise<number> {
  let uploaded = 0;
  const trips = await db.all<{ trip_id: number }>(
    'SELECT DISTINCT trip_id FROM track_points WHERE uploaded = 0'
  );
  for (const { trip_id: tripId } of trips) {
    for (;;) {
      const rows = await db.all<TrackRow>(
        'SELECT * FROM track_points WHERE trip_id = ? AND uploaded = 0 ORDER BY recorded_at ASC LIMIT ?',
        [tripId, UPLOAD_BATCH]
      );
      if (rows.length === 0) break;
      const points = thinTrack(
        rows.map((row) => ({
          latitude: row.latitude,
          longitude: row.longitude,
          accuracy: row.accuracy,
          altitude: row.altitude,
          speed: row.speed,
          recordedAt: row.recorded_at,
        })),
        10
      );
      try {
        await send(tripId, points);
      } catch (error) {
        // The trip is gone or read-only for this user: these fixes can never
        // be delivered, so stop retrying them forever.
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await db.run('DELETE FROM track_points WHERE trip_id = ?', [tripId]);
          break;
        }
        return uploaded;
      }
      // Mark the whole fetched range, including the points thinning dropped.
      await db.run(
        'UPDATE track_points SET uploaded = 1 WHERE trip_id = ? AND uploaded = 0 AND id <= ?',
        [tripId, rows[rows.length - 1].id]
      );
      uploaded += rows.length;
      if (rows.length < UPLOAD_BATCH) break;
    }
  }
  return uploaded;
}

/** Drop uploaded fixes older than `days`; the server holds them now. */
export async function pruneUploadedTrack(db: SqlDriver, days = 14): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  await db.run('DELETE FROM track_points WHERE uploaded = 1 AND recorded_at < ?', [cutoff]);
}
