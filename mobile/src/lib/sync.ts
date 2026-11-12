/**
 * Sync orchestration for the running app: which trips to mirror, when to sync,
 * and a small store the UI reads for status.
 */
import { create } from 'zustand';
import type { TripDto } from '@travel-life/shared';
import { dateOnlyKey } from '@travel-life/shared';
import { kvGet, kvSet, listPinnedTripIds, listTrips, removeTrip, upsertTrip } from '../db/repository';
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
    try {
      // The trip list endpoint is paginated; the companion only needs recent trips.
      const response = await api.request<{ trips?: TripDto[] } | TripDto[]>('/trips', {
        query: { limit: '100' },
      });
      remote = Array.isArray(response) ? response : (response?.trips ?? []);
    } catch (error) {
      if (error instanceof ApiError && error.status !== null && error.status < 500 && error.status !== 401) {
        throw error;
      }
      total.interrupted = true;
    }

    if (remote) {
      const pinnedTripIds = await listPinnedTripIds(db);
      const wanted = remote.filter((trip) =>
        shouldMirrorTrip(trip, todayKey, pinnedTripIds.has(trip.id))
      );
      const wantedIds = new Set(wanted.map((trip) => trip.id));
      for (const trip of wanted) await upsertTrip(db, trip);
      for (const local of await listTrips(db)) {
        // Deleted, access revoked, or aged out — but never while it is pinned
        // or still has unsynced (pending, conflict, or failed) work queued.
        if (!wantedIds.has(local.id) && !pinnedTripIds.has(local.id)) {
          const outbox = await countOutbox(db, local.id);
          const hasUnsyncedWork = outbox.pending > 0 || outbox.conflict > 0 || outbox.failed > 0;
          if (!hasUnsyncedWork) {
            await removeTrip(db, local.id);
          }
        }
      }
    }

    for (const trip of await listTrips(db)) {
      const result = await syncTrip(db, api.syncApi, trip.id);
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
      counts,
      activeTripId: active ?? null,
      dataVersion: state.dataVersion + 1,
    }));
    void refreshWidget();
    return total;
  } catch (error) {
    useSync.setState({
      syncing: false,
      lastError: error instanceof Error ? error.message : 'Sync failed',
    });
    return null;
  }
}
