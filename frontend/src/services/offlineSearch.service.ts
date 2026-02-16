/**
 * Offline Search Service for Travel Life PWA
 *
 * Provides local search functionality when the application is offline.
 * Builds and maintains a search index in IndexedDB for fast client-side searching.
 *
 * Features:
 * - Build search indexes from cached trip data
 * - Search across multiple entity types
 * - Relevance-based ranking
 * - Snippet extraction with match highlighting
 */

import { getDb } from '../lib/offlineDb';
import {
  normalizeMultiple,
  normalize,
  calculateRelevance,
  extractSnippet,
  createResultUrl,
  type SearchableEntityType,
  type SearchResultItem,
  type GroupedSearchResults,
  ENTITY_TYPE_LABELS,
} from '../lib/searchIndex';
import type { SearchIndexEntry } from '../types/offline.types';

// ============================================
// TYPES
// ============================================

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Entity types to search (all if not specified) */
  entityTypes?: SearchableEntityType[];
  /** Minimum relevance score to include */
  minScore?: number;
}

/**
 * Index statistics.
 */
export interface IndexStats {
  /** Total entries in the index */
  totalEntries: number;
  /** Entries per trip */
  tripCounts: Record<string, number>;
  /** Entries per entity type */
  typeCounts: Record<SearchableEntityType, number>;
  /** Last index rebuild timestamp */
  lastRebuild: number | null;
}

// ============================================
// DEFAULT OPTIONS
// ============================================

const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  limit: 50,
  entityTypes: ['TRIP', 'LOCATION', 'ACTIVITY', 'JOURNAL', 'TRANSPORTATION', 'LODGING'],
  minScore: 1,
};

// ============================================
// INDEX BUILDING HELPERS
// ============================================

/**
 * Creates a search index entry ID.
 */
function createIndexId(entityType: SearchableEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Extracts searchable text and title from a trip.
 */
function extractTripSearchData(trip: {
  title: string;
  description?: string | null;
  status?: string;
  timezone?: string | null;
}): { searchText: string; title: string; subtitle?: string } {
  return {
    searchText: normalizeMultiple([trip.title, trip.description, trip.status]),
    title: trip.title,
    subtitle: trip.status || undefined,
  };
}

/**
 * Extracts searchable text and title from a location.
 */
function extractLocationSearchData(location: {
  name: string;
  address?: string | null;
  notes?: string | null;
  category?: { name: string } | null;
}): { searchText: string; title: string; subtitle?: string } {
  const categoryName = location.category?.name;
  return {
    searchText: normalizeMultiple([location.name, location.address, location.notes, categoryName]),
    title: location.name,
    subtitle: categoryName || location.address || undefined,
  };
}

/**
 * Extracts searchable text and title from an activity.
 */
function extractActivitySearchData(activity: {
  name: string;
  description?: string | null;
  notes?: string | null;
  category?: string | null;
  location?: string | null;
}): { searchText: string; title: string; subtitle?: string } {
  return {
    searchText: normalizeMultiple([activity.name, activity.description, activity.notes, activity.category, activity.location]),
    title: activity.name,
    subtitle: activity.category || undefined,
  };
}

/**
 * Extracts searchable text and title from a journal entry.
 */
function extractJournalSearchData(journal: {
  title?: string | null;
  content?: string | null;
  date?: string | null;
  mood?: string | null;
  weather?: string | null;
}): { searchText: string; title: string; subtitle?: string } {
  return {
    searchText: normalizeMultiple([journal.title, journal.content, journal.mood, journal.weather]),
    title: journal.title || 'Journal Entry',
    subtitle: journal.date || undefined,
  };
}

/**
 * Extracts searchable text and title from transportation.
 */
function extractTransportationSearchData(transport: {
  type: string;
  departureLocation?: string | null;
  arrivalLocation?: string | null;
  carrier?: string | null;
  flightNumber?: string | null;
  notes?: string | null;
  bookingReference?: string | null;
}): { searchText: string; title: string; subtitle?: string } {
  const title = transport.flightNumber
    ? `${transport.type} ${transport.flightNumber}`
    : transport.type;

  const routeParts = [transport.departureLocation, transport.arrivalLocation].filter(Boolean);
  const subtitle = routeParts.length > 0 ? routeParts.join(' to ') : transport.carrier || undefined;

  return {
    searchText: normalizeMultiple([
      transport.type,
      transport.departureLocation,
      transport.arrivalLocation,
      transport.carrier,
      transport.flightNumber,
      transport.notes,
      transport.bookingReference,
    ]),
    title,
    subtitle,
  };
}

/**
 * Extracts searchable text and title from lodging.
 */
function extractLodgingSearchData(lodging: {
  name: string;
  type: string;
  address?: string | null;
  notes?: string | null;
  bookingReference?: string | null;
  phone?: string | null;
  email?: string | null;
}): { searchText: string; title: string; subtitle?: string } {
  return {
    searchText: normalizeMultiple([
      lodging.name,
      lodging.type,
      lodging.address,
      lodging.notes,
      lodging.bookingReference,
      lodging.phone,
      lodging.email,
    ]),
    title: lodging.name,
    subtitle: lodging.type || lodging.address || undefined,
  };
}

// ============================================
// OFFLINE SEARCH SERVICE CLASS
// ============================================

class OfflineSearchService {
  /**
   * Builds a search index for a specific trip's cached data.
   * Indexes all entity types associated with the trip.
   *
   * @param tripId - Trip ID to index
   * @returns Number of entries indexed
   */
  async buildSearchIndex(tripId: string): Promise<number> {
    const db = await getDb();
    let indexedCount = 0;

    try {
      // Get all cached data for this trip
      const [trip, locations, activities, journals, transportation, lodging] = await Promise.all([
        db.get('trips', tripId),
        db.getAllFromIndex('locations', 'by-trip', tripId),
        db.getAllFromIndex('activities', 'by-trip', tripId),
        db.getAllFromIndex('journals', 'by-trip', tripId),
        db.getAllFromIndex('transportation', 'by-trip', tripId),
        db.getAllFromIndex('lodging', 'by-trip', tripId),
      ]);

      // Start a transaction for all writes
      const tx = db.transaction('searchIndex', 'readwrite');
      const store = tx.objectStore('searchIndex');
      const now = Date.now();

      // Index trip
      if (trip?.data) {
        const { searchText, title, subtitle } = extractTripSearchData(trip.data);
        const entry: SearchIndexEntry = {
          id: createIndexId('TRIP', tripId),
          entityType: 'TRIP' as const,
          entityId: tripId,
          tripId,
          searchableText: searchText,
          searchText,
          title,
          subtitle,
          indexedAt: now,
        };
        await store.put(entry);
        indexedCount++;
      }

      // Index locations
      for (const loc of locations) {
        if (loc?.data) {
          const { searchText, title, subtitle } = extractLocationSearchData(loc.data);
          const entry: SearchIndexEntry = {
            id: createIndexId('LOCATION', loc.id),
            entityType: 'LOCATION' as const,
            entityId: loc.id,
            tripId,
            searchableText: searchText,
            searchText,
            title,
            subtitle,
            indexedAt: now,
          };
          await store.put(entry);
          indexedCount++;
        }
      }

      // Index activities
      for (const act of activities) {
        if (act?.data) {
          const { searchText, title, subtitle } = extractActivitySearchData(act.data);
          const entry: SearchIndexEntry = {
            id: createIndexId('ACTIVITY', act.id),
            entityType: 'ACTIVITY' as const,
            entityId: act.id,
            tripId,
            searchableText: searchText,
            searchText,
            title,
            subtitle,
            indexedAt: now,
          };
          await store.put(entry);
          indexedCount++;
        }
      }

      // Index journal entries
      for (const journal of journals) {
        if (journal?.data) {
          const { searchText, title, subtitle } = extractJournalSearchData(journal.data);
          const entry: SearchIndexEntry = {
            id: createIndexId('JOURNAL', journal.id),
            entityType: 'JOURNAL_ENTRY' as const,
            entityId: journal.id,
            tripId,
            searchableText: searchText,
            searchText,
            title,
            subtitle,
            indexedAt: now,
          };
          await store.put(entry);
          indexedCount++;
        }
      }

      // Index transportation
      for (const transport of transportation) {
        if (transport?.data) {
          const { searchText, title, subtitle } = extractTransportationSearchData(transport.data);
          const entry: SearchIndexEntry = {
            id: createIndexId('TRANSPORTATION', transport.id),
            entityType: 'TRANSPORTATION' as const,
            entityId: transport.id,
            tripId,
            searchableText: searchText,
            searchText,
            title,
            subtitle,
            indexedAt: now,
          };
          await store.put(entry);
          indexedCount++;
        }
      }

      // Index lodging
      for (const lodge of lodging) {
        if (lodge?.data) {
          const { searchText, title, subtitle } = extractLodgingSearchData(lodge.data);
          const entry: SearchIndexEntry = {
            id: createIndexId('LODGING', lodge.id),
            entityType: 'LODGING' as const,
            entityId: lodge.id,
            tripId,
            searchableText: searchText,
            searchText,
            title,
            subtitle,
            indexedAt: now,
          };
          await store.put(entry);
          indexedCount++;
        }
      }

      await tx.done;

      // Update metadata with last index time
      await db.put('metadata', {
        key: `searchIndex:${tripId}:lastIndexed`,
        value: Date.now(),
      });

      // Debug logging removed for production (SEC-16)
      return indexedCount;
    } catch (error) {
      console.error(`[OfflineSearch] Failed to build index for trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Rebuilds search indexes for all cached trips.
   *
   * @returns Total number of entries indexed
   */
  async rebuildAllIndexes(): Promise<number> {
    const db = await getDb();
    let totalIndexed = 0;

    try {
      // Clear existing search index
      await db.clear('searchIndex');

      // Get all cached trips
      const trips = await db.getAll('trips');

      // Index each trip
      for (const trip of trips) {
        const count = await this.buildSearchIndex(trip.id);
        totalIndexed += count;
      }

      // Update global rebuild timestamp
      await db.put('metadata', {
        key: 'searchIndex:lastRebuild',
        value: Date.now(),
      });

      // Debug logging removed for production (SEC-16)
      return totalIndexed;
    } catch (error) {
      console.error('[OfflineSearch] Failed to rebuild indexes:', error);
      throw error;
    }
  }

  /**
   * Removes search index entries for a specific trip.
   *
   * @param tripId - Trip ID to remove from index
   */
  async removeFromIndex(tripId: string): Promise<void> {
    const db = await getDb();

    try {
      const entries = await db.getAllFromIndex('searchIndex', 'by-trip', tripId);
      const tx = db.transaction('searchIndex', 'readwrite');

      for (const entry of entries) {
        await tx.store.delete(entry.id);
      }

      await tx.done;

      // Remove metadata
      await db.delete('metadata', `searchIndex:${tripId}:lastIndexed`);

      // Debug logging removed for production (SEC-16)
    } catch (error) {
      console.error(`[OfflineSearch] Failed to remove index for trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Searches across all indexed data.
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Array of search results sorted by relevance
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const normalizedQuery = normalize(query);

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const db = await getDb();

    try {
      // Get all index entries
      const entries = await db.getAll('searchIndex');

      // Filter and score results
      const results: SearchResultItem[] = [];

      for (const entry of entries) {
        // Skip if entity type not in filter
        const entryType = entry.entityType === 'JOURNAL_ENTRY' ? 'JOURNAL' : entry.entityType;
        if (!opts.entityTypes.includes(entryType as SearchableEntityType)) {
          continue;
        }

        // Calculate relevance score
        const score = calculateRelevance(normalizedQuery, entry.searchText);

        if (score < opts.minScore) {
          continue;
        }

        // Determine which field matched best
        const matchedField = this.determineMatchedField(entry, normalizedQuery);

        // Extract snippet
        const snippetResult = extractSnippet(
          entry.subtitle || entry.title,
          query,
          150
        );

        results.push({
          entityType: entryType as SearchableEntityType,
          entityId: entry.entityId,
          tripId: entry.tripId,
          title: entry.title,
          subtitle: entry.subtitle,
          matchedField,
          snippet: snippetResult.snippet,
          score,
          url: createResultUrl(entryType as SearchableEntityType, entry.entityId, entry.tripId),
        });
      }

      // Sort by score (descending) and limit results
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, opts.limit);
    } catch (error) {
      console.error('[OfflineSearch] Search failed:', error);
      throw error;
    }
  }

  /**
   * Searches within a specific trip.
   *
   * @param tripId - Trip ID to search within
   * @param query - Search query
   * @param options - Search options
   * @returns Array of search results sorted by relevance
   */
  async searchTrip(tripId: string, query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const normalizedQuery = normalize(query);

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const db = await getDb();

    try {
      // Get index entries for this trip only
      const entries = await db.getAllFromIndex('searchIndex', 'by-trip', tripId);

      // Filter and score results
      const results: SearchResultItem[] = [];

      for (const entry of entries) {
        // Skip if entity type not in filter
        const entryType = entry.entityType === 'JOURNAL_ENTRY' ? 'JOURNAL' : entry.entityType;
        if (!opts.entityTypes.includes(entryType as SearchableEntityType)) {
          continue;
        }

        // Calculate relevance score
        const score = calculateRelevance(normalizedQuery, entry.searchText);

        if (score < opts.minScore) {
          continue;
        }

        // Determine which field matched best
        const matchedField = this.determineMatchedField(entry, normalizedQuery);

        // Extract snippet
        const snippetResult = extractSnippet(
          entry.subtitle || entry.title,
          query,
          150
        );

        results.push({
          entityType: entryType as SearchableEntityType,
          entityId: entry.entityId,
          tripId: entry.tripId,
          title: entry.title,
          subtitle: entry.subtitle,
          matchedField,
          snippet: snippetResult.snippet,
          score,
          url: createResultUrl(entryType as SearchableEntityType, entry.entityId, entry.tripId),
        });
      }

      // Sort by score (descending) and limit results
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, opts.limit);
    } catch (error) {
      console.error(`[OfflineSearch] Search in trip ${tripId} failed:`, error);
      throw error;
    }
  }

  /**
   * Gets grouped search results by entity type.
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Grouped search results
   */
  async searchGrouped(query: string, options?: SearchOptions): Promise<GroupedSearchResults> {
    const results = await this.search(query, options);

    // Group by entity type
    const grouped = new Map<SearchableEntityType, SearchResultItem[]>();

    for (const result of results) {
      const existing = grouped.get(result.entityType) || [];
      existing.push(result);
      grouped.set(result.entityType, existing);
    }

    // Convert to array format
    const groups = Array.from(grouped.entries()).map(([entityType, items]) => ({
      entityType,
      label: ENTITY_TYPE_LABELS[entityType],
      results: items,
    }));

    // Sort groups by result count
    groups.sort((a, b) => b.results.length - a.results.length);

    return {
      groups,
      total: results.length,
      query,
      timestamp: Date.now(),
    };
  }

  /**
   * Gets the timestamp when a trip was last indexed.
   *
   * @param tripId - Trip ID
   * @returns Timestamp or null if never indexed
   */
  async getLastIndexed(tripId: string): Promise<number | null> {
    const db = await getDb();
    const metadata = await db.get('metadata', `searchIndex:${tripId}:lastIndexed`);
    return metadata?.value as number | null;
  }

  /**
   * Gets the timestamp of the last global index rebuild.
   *
   * @returns Timestamp or null if never rebuilt
   */
  async getLastRebuild(): Promise<number | null> {
    const db = await getDb();
    const metadata = await db.get('metadata', 'searchIndex:lastRebuild');
    return metadata?.value as number | null;
  }

  /**
   * Gets statistics about the search index.
   *
   * @returns Index statistics
   */
  async getStats(): Promise<IndexStats> {
    const db = await getDb();

    try {
      const entries = await db.getAll('searchIndex');
      const lastRebuild = await this.getLastRebuild();

      const tripCounts: Record<string, number> = {};
      const typeCounts: Record<SearchableEntityType, number> = {
        TRIP: 0,
        LOCATION: 0,
        ACTIVITY: 0,
        JOURNAL: 0,
        TRANSPORTATION: 0,
        LODGING: 0,
      };

      for (const entry of entries) {
        // Count by trip
        tripCounts[entry.tripId] = (tripCounts[entry.tripId] || 0) + 1;

        // Count by type
        const entryType = entry.entityType === 'JOURNAL_ENTRY' ? 'JOURNAL' : entry.entityType;
        if (entryType in typeCounts) {
          typeCounts[entryType as SearchableEntityType]++;
        }
      }

      return {
        totalEntries: entries.length,
        tripCounts,
        typeCounts,
        lastRebuild,
      };
    } catch (error) {
      console.error('[OfflineSearch] Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Checks if the search index needs rebuilding.
   * Returns true if index is empty or stale (> 24 hours old).
   *
   * @returns True if rebuild is recommended
   */
  async needsRebuild(): Promise<boolean> {
    const db = await getDb();

    try {
      const count = await db.count('searchIndex');
      if (count === 0) return true;

      const lastRebuild = await this.getLastRebuild();
      if (!lastRebuild) return true;

      // Suggest rebuild if older than 24 hours
      const ageMs = Date.now() - lastRebuild;
      const hourMs = 60 * 60 * 1000;
      return ageMs > 24 * hourMs;
    } catch {
      return true;
    }
  }

  /**
   * Determines which field matched the query best.
   * @private
   */
  private determineMatchedField(entry: SearchIndexEntry, normalizedQuery: string): string {
    // Check title first
    if (normalize(entry.title).includes(normalizedQuery)) {
      return 'title';
    }

    // Check subtitle
    if (entry.subtitle && normalize(entry.subtitle).includes(normalizedQuery)) {
      return 'subtitle';
    }

    // Default to content
    return 'content';
  }
}

// Export singleton instance
export const offlineSearchService = new OfflineSearchService();
export default offlineSearchService;
