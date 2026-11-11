/**
 * Read hooks. Every screen reads from SQLite, never from the network, so the
 * UI is identical online and offline; the `dataVersion` in each query key makes
 * queries re-read after a local write or a sync.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  EntityId,
  EntityLinkDto,
  EntityType,
  SyncEntityKind,
  SyncEntityMap,
  TripDto,
} from '@travel-life/shared';
import { dayKeyInTimezone, getDeviceTimezone, resolveTimezone } from '@travel-life/shared';
import {
  getEntity,
  getTrip,
  kvGet,
  listEntities,
  listLinksFor,
  listTrips,
} from '../db/repository';
import { buildTimelineItems, pickActiveTrip, type TimelineItem } from '../domain/timeline';
import { listDirtyKeys, listOutbox, type OutboxEntry } from '../sync/outbox';
import { getDb } from './db';
import { useSession } from './session';
import { useSync } from './sync';

/** The signed-in user's configured zone, else the device's. Never bare UTC. */
export function useUserTimezone(): string {
  const timezone = useSession((state) => state.session?.user.timezone);
  return resolveTimezone(timezone, getDeviceTimezone());
}

/** Resolver matching the web app's `useTimezoneResolver`: entity -> trip -> user -> device. */
export function useTimezoneResolver(): (...candidates: (string | null | undefined)[]) => string {
  const userTimezone = useUserTimezone();
  return (...candidates) => resolveTimezone(...candidates, userTimezone);
}

/** Re-renders on an interval, for countdowns and clocks. */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useTrips() {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['trips', version],
    queryFn: async (): Promise<TripDto[]> => listTrips(await getDb()),
  });
}

/** The trip the tabs are showing: the user's explicit pick, else the one in progress. */
export function useActiveTrip() {
  const version = useSync((state) => state.dataVersion);
  const chosen = useSync((state) => state.activeTripId);
  const userTimezone = useUserTimezone();
  return useQuery({
    queryKey: ['active-trip', chosen, version],
    queryFn: async (): Promise<TripDto | null> => {
      const db = await getDb();
      const stored = chosen ?? (await kvGet<number>(db, 'activeTripId'));
      if (stored) {
        const trip = await getTrip(db, stored);
        if (trip) return trip;
      }
      const todayKey = dayKeyInTimezone(new Date(), userTimezone);
      return pickActiveTrip(await listTrips(db), todayKey);
    },
  });
}

export function useEntities<K extends SyncEntityKind>(tripId: number | undefined, kind: K) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['entities', tripId, kind, version],
    enabled: tripId !== undefined,
    queryFn: async (): Promise<SyncEntityMap[K][]> => listEntities(await getDb(), tripId as number, kind),
  });
}

export function useEntity<K extends SyncEntityKind>(kind: K, id: EntityId | undefined) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['entity', kind, id, version],
    enabled: id !== undefined,
    queryFn: async (): Promise<SyncEntityMap[K] | null> => getEntity(await getDb(), kind, id as EntityId),
  });
}

export function useLinks(tripId: number | undefined, type: EntityType, id: EntityId | undefined) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['links', tripId, type, id, version],
    enabled: tripId !== undefined && id !== undefined,
    queryFn: async (): Promise<EntityLinkDto[]> =>
      listLinksFor(await getDb(), tripId as number, type, id as EntityId),
  });
}

export interface TripTimeline {
  items: TimelineItem[];
  sources: {
    activities: SyncEntityMap['ACTIVITY'][];
    transportation: SyncEntityMap['TRANSPORTATION'][];
    lodging: SyncEntityMap['LODGING'][];
    customItems: SyncEntityMap['CUSTOM_ITEM'][];
    locations: SyncEntityMap['LOCATION'][];
  };
}

/** Everything schedulable in a trip, flattened into timeline items. */
export function useTripTimeline(trip: TripDto | null | undefined) {
  const version = useSync((state) => state.dataVersion);
  const userTimezone = useUserTimezone();
  return useQuery({
    queryKey: ['timeline', trip?.id, trip?.timezone, userTimezone, version],
    enabled: Boolean(trip),
    queryFn: async (): Promise<TripTimeline> => {
      const db = await getDb();
      const tripId = (trip as TripDto).id;
      const [activities, transportation, lodging, customItems, locations] = await Promise.all([
        listEntities(db, tripId, 'ACTIVITY'),
        listEntities(db, tripId, 'TRANSPORTATION'),
        listEntities(db, tripId, 'LODGING'),
        listEntities(db, tripId, 'CUSTOM_ITEM'),
        listEntities(db, tripId, 'LOCATION'),
      ]);
      const sources = { activities, transportation, lodging, customItems, locations };
      return { items: buildTimelineItems(sources, trip?.timezone, userTimezone), sources };
    },
  });
}

export function useOutbox(tripId?: number) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['outbox', tripId, version],
    queryFn: async (): Promise<OutboxEntry[]> => listOutbox(await getDb(), { tripId }),
  });
}

/** `KIND:id` keys with unsynced changes, for the "pending" dot on rows. */
export function useDirtyKeys(tripId: number | undefined) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['dirty', tripId, version],
    enabled: tripId !== undefined,
    queryFn: async (): Promise<Set<string>> => listDirtyKeys(await getDb(), tripId as number),
  });
}

export function useKv<T>(key: string) {
  const version = useSync((state) => state.dataVersion);
  return useQuery({
    queryKey: ['kv', key, version],
    queryFn: async (): Promise<T | null> => kvGet<T>(await getDb(), key),
  });
}
