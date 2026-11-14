/**
 * Sync orchestration for the running app: which trips to mirror, when to sync,
 * and a small store the UI reads for status.
 */
import { create } from 'zustand';
import type { TripDto } from '@travel-life/shared';
import { dateOnlyKey } from '@travel-life/shared';
import {
  kvGet,
  kvSet,
  listPinnedTripIds,
  listTrips,
  removeTrip,
  setTripPinned,
  upsertTrip,
} from '../db/repository';
import { ApiError, syncTrip, type SyncResult } from '../sync/engine';
import { countOutbox, type OutboxCounts } from '../sync/outbox';
import { getDb } from './db';
import { refreshTripExtras } from './extras';
import { api, useSession } from './session';
import { refreshWidget } from '../tasks/widget';

interface SyncState {
  syncing: boolean;
  /** True when the last attempt could not reach the server. */
  offline: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  counts: OutboxCounts;
  /** Queued edits waiting on another edit that could not be delivered. */
  blocked: number;
  /** Bumped whenever local data changes, so queries re-read SQLite. */
  dataVersion: number;
  activeTripId: number | null;
  bump(): void;
  setActiveTrip(tripId: number | null): Promise<void>;
}

export const useSync = create<SyncState>((set) => ({
  syncing: false,
  offline: false,
  lastSyncedAt: null,
  lastError: null,
  counts: { pending: 0, conflict: 0, failed: 0 },
  blocked: 0,
  dataVersion: 0,
  activeTripId: null,
  bump: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
  async setActiveTrip(tripId) {
    await kvSet(await getDb(), 'activeTripId', tripId);
    set((state) => ({ activeTripId: tripId, dataVersion: state.dataVersion + 1 }));
  },
}));

/** Call after any local write so screens refresh and the badge updates. */
export async function notifyLocalChange(): Promise<void> {
  const counts = await countOutbox(await getDb());
  useSync.setState((state) => ({ counts, dataVersion: state.dataVersion + 1 }));
  void refreshWidget();
}

/**
 * Trips worth keeping on the phone: anything not finished more than a month
 * ago, or pinned by the user. Mirroring every trip a user has ever taken would
 * waste roaming data.
 */
export function shouldMirrorTrip(
  trip: Pick<TripDto, 'endDate' | 'status'>,
  todayKey: string,
  isPinned = false
): boolean {
  if (/cancel/i.test(trip.status)) return false;
  if (isPinned) return true;
  const end = dateOnlyKey(trip.endDate);
  if (!end) return true;
  const cutoff = new Date(Date.parse(todayKey) - 30 * 86400000).toISOString().slice(0, 10);
  return end >= cutoff;
}

const DISMISSED_KEY = 'dismissedTrips';

/** Trips the user removed from this phone; sync must not bring them back by itself. */
export async function listDismissedTripIds(db: Awaited<ReturnType<typeof getDb>>): Promise<Set<number>> {
  return new Set((await kvGet<number[]>(db, DISMISSED_KEY)) ?? []);
}

async function setDismissed(tripId: number, dismissed: boolean): Promise<void> {
  const db = await getDb();
  const ids = await listDismissedTripIds(db);
  if (dismissed) ids.add(tripId);
  else ids.delete(tripId);
  await kvSet(db, DISMISSED_KEY, [...ids]);
}

/**
 * Take a trip off the phone. Refuses (returns false) while edits to it have
 * not reached the server, so nothing the user typed can be lost.
 */
export async function removeTripFromPhone(tripId: number): Promise<boolean> {
  const db = await getDb();
  const outbox = await countOutbox(db, tripId);
  if (outbox.pending + outbox.conflict + outbox.failed > 0) return false;
  await setDismissed(tripId, true);
  await setTripPinned(db, tripId, false);
  await removeTrip(db, tripId);
  await notifyLocalChange();
  return true;
}

/** Bring a removed trip back (undo, or "Download" from the server list). */
export async function restoreTripToPhone(trip: TripDto, keep: boolean): Promise<void> {
  const db = await getDb();
  await setDismissed(trip.id, false);
  await upsertTrip(db, trip);
  if (keep) await setTripPinned(db, trip.id, true);
  await notifyLocalChange();
  void syncNow();
}

/**
 * Every trip this account can open: its own plus trips shared with it.
 * `complete` is false when the shared list could not be read, so callers must
 * not conclude that a missing trip was deleted or un-shared.
 */
export async function fetchRemoteTrips(): Promise<{ trips: TripDto[]; complete: boolean }> {
  const response = await api.request<{ trips?: TripDto[] } | TripDto[]>('/trips', {
    query: { limit: '100' },
  });
  const own = Array.isArray(response) ? response : (response?.trips ?? []);
  try {
    const shared = await api.request<TripDto[] | null>('/collaboration/trips/shared');
    const known = new Set(own.map((trip) => trip.id));
    return { trips: [...own, ...(shared ?? []).filter((trip) => !known.has(trip.id))], complete: true };
  } catch {
    return { trips: own, complete: false };
  }
}

let inFlight: Promise<SyncResult | null> | null = null;

/**
 * Refresh the trip list, then sync every mirrored trip. Safe to call from
 * anywhere, any number of times: concurrent calls share one run.
 */
export function syncNow(): Promise<SyncResult | null> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<SyncResult | null> {
  if (!useSession.getState().session) return null;
  const db = await getDb();
  useSync.setState({ syncing: true, lastError: null });
  const total: SyncResult = {
    sent: 0,
    failed: 0,
    conflicts: 0,
    blocked: 0,
    interrupted: false,
    pulled: false,
  };

  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    let remote: TripDto[] | null = null;
    let listComplete = true;
    try {
      const fetched = await fetchRemoteTrips();
      remote = fetched.trips;
      listComplete = fetched.complete;
    } catch (error) {
      if (error instanceof ApiError && error.status !== null && error.status < 500 && error.status !== 401) {
        throw error;
      }
      total.interrupted = true;
    }

    if (remote) {
      const pinnedTripIds = await listPinnedTripIds(db);
      const dismissed = await listDismissedTripIds(db);
      const wanted = remote.filter(
        (trip) =>
          (!dismissed.has(trip.id) || pinnedTripIds.has(trip.id)) &&
          shouldMirrorTrip(trip, todayKey, pinnedTripIds.has(trip.id))
      );
      const wantedIds = new Set(wanted.map((trip) => trip.id));
      for (const trip of wanted) await upsertTrip(db, trip);
      for (const local of await listTrips(db)) {
        // Deleted, access revoked, or aged out — but never while it is pinned
        // or still has unsynced (pending, conflict, or failed) work queued.
        if (listComplete && !wantedIds.has(local.id) && !pinnedTripIds.has(local.id)) {
          const outbox = await countOutbox(db, local.id);
          const hasUnsyncedWork = outbox.pending > 0 || outbox.conflict > 0 || outbox.failed > 0;
          if (!hasUnsyncedWork) {
            await removeTrip(db, local.id);
          }
        }
      }
    }

    const tripProblems: string[] = [];
    for (const trip of await listTrips(db)) {
      let result: SyncResult;
      try {
        result = await syncTrip(db, api.syncApi, trip.id);
      } catch (error) {
        // A trip the server refuses (access revoked, deleted) must not stop the
        // other trips, or their queued edits, from syncing.
        if (error instanceof ApiError && error.status === 401) throw error;
        tripProblems.push(`${trip.title}: ${error instanceof Error ? error.message : 'sync failed'}`);
        continue;
      }
      total.sent += result.sent;
      total.failed += result.failed;
      total.conflicts += result.conflicts;
      total.blocked += result.blocked;
      total.pulled = total.pulled || result.pulled;
      if (result.interrupted) {
        total.interrupted = true;
        break;
      }
      // Emergency card and phrasebook: cached whole for offline use.
      await refreshTripExtras(trip.id);
    }

    const active = useSync.getState().activeTripId ?? (await kvGet<number>(db, 'activeTripId'));
    const counts = await countOutbox(db);
    useSync.setState((state) => ({
      syncing: false,
      offline: total.interrupted,
      lastSyncedAt: total.interrupted ? state.lastSyncedAt : new Date().toISOString(),
      lastError: tripProblems.length > 0 ? tripProblems.join('\n') : null,
      blocked: total.blocked,
      counts,
      activeTripId: active ?? null,
      dataVersion: state.dataVersion + 1,
    }));
    void refreshWidget();
    return total;
  } catch (error) {
    const signedOut = error instanceof ApiError && error.status === 401;
    useSync.setState({
      syncing: false,
      offline: false,
      lastError: signedOut
        ? 'Your session expired. Sign in again to keep syncing.'
        : error instanceof Error
          ? error.message
          : 'Sync failed',
    });
    return null;
  }
}
