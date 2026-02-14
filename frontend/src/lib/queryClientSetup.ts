/**
 * TanStack Query Client Configuration for PWA Offline Support
 *
 * This module configures the QueryClient with settings optimized for:
 * - Offline-first data access
 * - Cache persistence across sessions
 * - Graceful degradation when offline
 */

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from './queryPersister';

// Cache duration constants
const FIVE_MINUTES = 5 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Maximum age for persisted cache (7 days)
// After this time, the persisted cache will be discarded and fresh data fetched
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Create a QueryClient configured for offline-first PWA support
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes
        // During this time, no refetch will occur
        staleTime: FIVE_MINUTES,

        // Keep unused data in cache for 24 hours
        // This is essential for offline access - data remains available even when not actively used
        gcTime: TWENTY_FOUR_HOURS,

        // Don't refetch when window regains focus
        // This prevents unnecessary network requests and preserves offline data
        refetchOnWindowFocus: false,

        // Don't refetch when reconnecting
        // We handle this manually to avoid disrupting offline work
        refetchOnReconnect: false,

        // Refetch on mount only if data is stale (default behavior)
        // This ensures invalidated data (e.g., after editing a trip) gets refreshed
        // while still serving cached data during its staleTime window
        refetchOnMount: true,

        // Retry failed requests 3 times with exponential backoff
        // This handles temporary network issues gracefully
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Use cached data while fetching in background
        // If we have cached data, show it immediately
        placeholderData: (previousData) => previousData,

        // Network mode: pause requests when offline
        // This prevents failed requests from clearing cached data
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Mutations should also work offline-first
        // They will be queued and executed when back online
        networkMode: 'offlineFirst',

        // Retry mutations 3 times
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  });
}

// Singleton query client instance
let queryClientInstance: QueryClient | null = null;

/**
 * Get the singleton QueryClient instance
 * Creates it if it doesn't exist
 */
export function getQueryClient(): QueryClient {
  if (!queryClientInstance) {
    queryClientInstance = createQueryClient();
  }
  return queryClientInstance;
}

// Create the persister instance (singleton)
const persister = createIDBPersister();

/**
 * Get the IDB persister instance
 */
export function getQueryPersister() {
  return persister;
}

/**
 * Get the maximum cache age for persistence
 */
export function getMaxCacheAge() {
  return MAX_CACHE_AGE;
}

/**
 * Query keys that should be persisted
 * These are the primary data queries that benefit from offline caching
 */
export const PERSISTABLE_QUERY_KEYS = [
  'trips',
  'trip',
  'locations',
  'location',
  'activities',
  'activity',
  'lodging',
  'transportation',
  'photos',
  'photo',
  'albums',
  'album',
  'journals',
  'journal',
  'companions',
  'tags',
  'checklists',
  'checklist',
  'user',
  'settings',
] as const;

/**
 * Check if a query key should be persisted
 * Only persist queries for core data that's useful offline
 */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  if (!queryKey || queryKey.length === 0) {
    return false;
  }

  const firstKey = queryKey[0];
  if (typeof firstKey !== 'string') {
    return false;
  }

  // Check if the query key starts with any persistable key
  return PERSISTABLE_QUERY_KEYS.some(
    (key) => firstKey === key || firstKey.startsWith(`${key}-`)
  );
}

/**
 * Filter function for dehydrating queries
 * Determines which queries should be included in the persisted cache
 */
export function dehydrateQueryFilter(query: { queryKey: readonly unknown[]; state: { status: string; data?: unknown } }): boolean {
  // Only persist successful queries with resolved data
  // Queries in pending/paused state may contain Promise objects that can't be cloned to IndexedDB
  if (query.state.status !== 'success') {
    return false;
  }

  return shouldPersistQuery(query.queryKey);
}

// Re-export the provider for convenience
export { PersistQueryClientProvider };
