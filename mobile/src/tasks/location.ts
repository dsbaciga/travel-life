/**
 * Background GPS track logging (Backlog #43).
 *
 * The OS wakes the task with batches of fixes; each batch is appended to
 * SQLite and uploaded opportunistically. Nothing here assumes the UI is alive:
 * the task runs headless, so it opens the database and reads the session
 * itself.
 *
 * This module must be imported from the app entry (`src/app/_layout.tsx`) so
 * the task is defined before the OS can deliver to it.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { TripDto } from '@travel-life/shared';
import { dayKeyInTimezone, getDeviceTimezone } from '@travel-life/shared';
import type { SqlDriver } from '../db/driver';
import { kvGet, kvSet, listTrips } from '../db/repository';
import { pickActiveTrip } from '../domain/timeline';
import { pruneUploadedTrack, storeTrackPoints, uploadPendingTrack } from '../domain/track';
import { getDb } from '../lib/db';
import { api, useSession } from '../lib/session';

export const LOCATION_TASK = 'travel-life-background-location';

async function tripToRecordFor(db: SqlDriver): Promise<TripDto | null> {
  const chosen = await kvGet<number>(db, 'trackingTripId');
  const trips = await listTrips(db);
  if (chosen) {
    const match = trips.find((trip) => trip.id === chosen);
    if (match) return match;
  }
  return pickActiveTrip(trips, dayKeyInTimezone(new Date(), getDeviceTimezone()));
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const db = await getDb();
    const trip = await tripToRecordFor(db);
    if (!trip) return;

    await storeTrackPoints(
      db,
      trip.id,
      data.locations.map((fix) => ({
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
        altitude: fix.coords.altitude,
        speed: fix.coords.speed,
        recordedAt: new Date(fix.timestamp).toISOString(),
      }))
    );

    // Headless launch: the session store has not been hydrated by the UI.
    if (!useSession.getState().hydrated) await useSession.getState().hydrate();
    if (!useSession.getState().session) return;
    await uploadPendingTrack(db, async (tripId, points) => {
      await api.request(`/trips/${tripId}/tracks/batch`, { method: 'POST', body: { points } });
    });
    await pruneUploadedTrack(db);
  }
);

export type TrackingStartResult = 'started' | 'foreground-denied' | 'background-denied';

/**
 * Ask for permission (foreground first, then "always") and start recording.
 * The plan's battery targets: 25 m distance filter, batches deferred to once
 * a minute, and automatic pausing when stationary.
 */
export async function startTracking(tripId: number): Promise<TrackingStartResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'foreground-denied';
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return 'background-denied';

  await kvSet(await getDb(), 'trackingTripId', tripId);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return 'started';

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 25,
    deferredUpdatesInterval: 60000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Recording your route',
      notificationBody: 'Travel Life is logging this trip’s path.',
    },
  });
  return 'started';
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isTracking(): Promise<boolean> {
  return (
    (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK)) &&
    (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
  );
}

/** A single foreground fix, or null when permission is missing or GPS times out. */
type PositionFailure = 'denied' | 'unavailable';
let lastPositionFailure: PositionFailure | null = null;

/** How long to wait for a satellite fix before giving up. */
const FIX_TIMEOUT_MS = 15000;

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  lastPositionFailure = null;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      lastPositionFailure = 'denied';
      return null;
    }
    // A recent fix is good enough for "where am I", and is all there is indoors.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60000 });
    // High accuracy means GPS, which needs no network. Network-based accuracy
    // levels fail exactly when the traveller is offline.
    const fix =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          // Do not make Google's network-assisted "Location Accuracy" setting a
          // precondition: plain GPS is enough, and the prompt cannot be
          // answered usefully offline.
          mayShowUserSettingsDialog: false,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
      ]));
    if (!fix) {
      lastPositionFailure = 'unavailable';
      return null;
    }
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    lastPositionFailure = 'unavailable';
    return null;
  }
}

/**
 * Why the last `getCurrentPosition()` returned nothing, as a sentence for the
 * traveller. `purpose` completes "... is needed to <purpose>".
 */
export function positionFailureMessage(purpose: string): string {
  return lastPositionFailure === 'denied'
    ? `Location permission is needed to ${purpose}.`
    : `Could not get a GPS fix to ${purpose}. Try again outdoors, or enter the place by hand.`;
}
