/**
 * OfflineSearchResults Component
 *
 * Displays search results from offline/IndexedDB search with support for:
 * - Grouped results by entity type
 * - Offline mode indicator
 * - Last indexed timestamp
 * - Empty state handling
 * - Dark mode support
 *
 * Designed to work alongside or replace online search results in GlobalSearch.
 */

import { useNavigate } from 'react-router-dom';
import { type UnifiedSearchResult } from '../hooks/useOfflineSearch';
import {
  type GroupedSearchResults,
  type SearchableEntityType,
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_ICONS,
} from '../lib/searchIndex';

// ============================================
// TYPES
// ============================================

export interface OfflineSearchResultsProps {
  /** Search results (flat list) */
  results: UnifiedSearchResult[];
  /** Grouped results (optional, for grouped display) */
  groupedResults?: GroupedSearchResults | null;
  /** Search query for highlighting */
  query: string;
  /** Whether search is in progress */
  isSearching?: boolean;
  /** Whether using offline mode */
  isOfflineMode?: boolean;
  /** Last indexed timestamp */
  lastIndexed?: number | null;
  /** Error message */
  error?: string | null;
  /** Index of currently selected result (for keyboard navigation) */
  selectedIndex?: number;
  /** Callback when a result is selected */
  onSelect?: (result: UnifiedSearchResult) => void;
  /** Whether to show grouped view */
  showGrouped?: boolean;
  /** Maximum results to show per group in grouped view */
  maxPerGroup?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Escapes special regex characters in a string so it can be used in a RegExp safely.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Renders text with search query matches highlighted using React elements
 * instead of raw HTML. Matched portions are wrapped in <mark> elements.
 */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim()) return <>{text}</>;

  const escapedQuery = escapeRegex(query.trim());
  const splitRegex = new RegExp(`(${escapedQuery})`, 'gi');
  const testRegex = new RegExp(`^${escapedQuery}$`, 'i');
  const parts = text.split(splitRegex);

  if (parts.length === 1) {
    // No matches found
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        testRegex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Formats a timestamp for display.
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Gets the icon path for an entity type.
 */
function getIconPath(type: UnifiedSearchResult['type']): string {
  const typeMap: Record<UnifiedSearchResult['type'], SearchableEntityType> = {
    trip: 'TRIP',
    location: 'LOCATION',
    photo: 'LOCATION', // Photos use location icon as fallback
    journal: 'JOURNAL',
    activity: 'ACTIVITY',
    transportation: 'TRANSPORTATION',
    lodging: 'LODGING',
  };
  return ENTITY_TYPE_ICONS[typeMap[type]] || ENTITY_TYPE_ICONS.TRIP;
}

/**
 * Gets the label for a result type.
 */
function getTypeLabel(type: UnifiedSearchResult['type']): string {
  const labels: Record<UnifiedSearchResult['type'], string> = {
    trip: 'Trip',
    location: 'Location',
    photo: 'Photo',
    journal: 'Journal',
    activity: 'Activity',
    transportation: 'Transportation',
    lodging: 'Lodging',
  };
  return labels[type] || type;
}

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Offline mode indicator banner.
 */
function OfflineIndicator({ lastIndexed }: { lastIndexed?: number | null }) {
  return (
    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
        <span className="font-medium">Searching offline data</span>
        {lastIndexed && (
          <span className="text-amber-600 dark:text-amber-400">
            | Last indexed: {formatTimestamp(lastIndexed)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Loading state indicator.
 */
function SearchingIndicator() {
  return (
    <div className="p-6 flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <div className="w-5 h-5 border-2 border-primary-500 dark:border-gold border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Searching...</span>
      </div>
    </div>
  );
}

/**
 * Error state display.
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className="p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
        <svg
          className="w-6 h-6 text-red-500 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  );
}

/**
 * Empty results state.
 */
function EmptyState({ query }: { query: string }) {
  return (
    <div className="p-8 text-center">
      <svg
        className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-gray-600 dark:text-gray-400 font-medium">No results found</p>
      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
        No offline data matches "{query}"
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
        Try different keywords or check your downloaded trips
      </p>
    </div>
  );
}

/**
 * Single search result item.
 */
function ResultItem({
  result,
  query,
  isSelected,
  onClick,
}: {
  result: UnifiedSearchResult;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const iconPath = getIconPath(result.type);

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-3 rounded-lg transition-all duration-150
        ${
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 dark:border-gold'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div
          className={`
            flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
            ${
              isSelected
                ? 'bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-gold'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }
          `}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={iconPath}
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white truncate">
            <HighlightText text={result.title} query={query} />
          </div>
          {result.subtitle && (
            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
              <HighlightText text={result.subtitle} query={query} />
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
              {getTypeLabel(result.type)}
            </span>
            {result.isOfflineResult && result.score && (
              <span className="text-xs text-amber-500 dark:text-amber-400">
                Score: {result.score}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Group header for grouped results.
 */
function GroupHeader({
  entityType,
  count,
}: {
  entityType: SearchableEntityType;
  count: number;
}) {
  const label = ENTITY_TYPE_LABELS[entityType];
  const iconPath = ENTITY_TYPE_ICONS[entityType];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <svg
        className="w-4 h-4 text-gray-500 dark:text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={iconPath}
        />
      </svg>
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        ({count})
      </span>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function OfflineSearchResults({
  results,
  groupedResults,
  query,
  isSearching = false,
  isOfflineMode = true,
  lastIndexed,
  error,
  selectedIndex = -1,
  onSelect,
  showGrouped = false,
  maxPerGroup = 5,
}: OfflineSearchResultsProps) {
  const navigate = useNavigate();

  // Handle result selection
  const handleSelect = (result: UnifiedSearchResult) => {
    if (onSelect) {
      onSelect(result);
    } else {
      navigate(result.url);
    }
  };

  // Show loading state
  if (isSearching) {
    return (
      <div className="overflow-hidden rounded-b-xl">
        {isOfflineMode && <OfflineIndicator lastIndexed={lastIndexed} />}
        <SearchingIndicator />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="overflow-hidden rounded-b-xl">
        {isOfflineMode && <OfflineIndicator lastIndexed={lastIndexed} />}
        <ErrorState error={error} />
      </div>
    );
  }

  // Show empty state if no query or no results
  if (!query || results.length === 0) {
    if (query) {
      return (
        <div className="overflow-hidden rounded-b-xl">
          {isOfflineMode && <OfflineIndicator lastIndexed={lastIndexed} />}
          <EmptyState query={query} />
        </div>
      );
    }
    return null;
  }

  // Render grouped results
  if (showGrouped && groupedResults && groupedResults.groups.length > 0) {
    let globalIndex = 0;

    return (
      <div className="overflow-hidden rounded-b-xl max-h-96 overflow-y-auto">
        {isOfflineMode && <OfflineIndicator lastIndexed={lastIndexed} />}
        {groupedResults.groups.map((group) => {
          const displayResults = group.results.slice(0, maxPerGroup);
          const hasMore = group.results.length > maxPerGroup;

          return (
            <div key={group.entityType}>
              <GroupHeader
                entityType={group.entityType}
                count={group.results.length}
              />
              <div className="p-2">
                {displayResults.map((result) => {
                  // Convert SearchResultItem to UnifiedSearchResult
                  const unifiedResult: UnifiedSearchResult = {
                    id: `${result.entityType}:${result.entityId}`,
                    type: result.entityType.toLowerCase() as UnifiedSearchResult['type'],
                    title: result.title,
                    subtitle: result.subtitle || result.snippet,
                    url: result.url,
                    score: result.score,
                    isOfflineResult: true,
                  };
                  const currentIndex = globalIndex++;
                  return (
                    <ResultItem
                      key={unifiedResult.id}
                      result={unifiedResult}
                      query={query}
                      isSelected={currentIndex === selectedIndex}
                      onClick={() => handleSelect(unifiedResult)}
                    />
                  );
                })}
                {hasMore && (
                  <div className="px-3 py-2 text-xs text-center text-gray-500 dark:text-gray-400">
                    +{group.results.length - maxPerGroup} more results
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Total results footer */}
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{groupedResults.total} results found</span>
            {lastIndexed && (
              <span>Indexed: {formatTimestamp(lastIndexed)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render flat results list
  return (
    <div className="overflow-hidden rounded-b-xl max-h-96 overflow-y-auto">
      {isOfflineMode && <OfflineIndicator lastIndexed={lastIndexed} />}
      <div className="p-2">
        {results.map((result, index) => (
          <ResultItem
            key={result.id}
            result={result}
            query={query}
            isSelected={index === selectedIndex}
            onClick={() => handleSelect(result)}
          />
        ))}
      </div>

      {/* Results count footer */}
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{results.length} results</span>
          {lastIndexed && (
            <span>Indexed: {formatTimestamp(lastIndexed)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export { OfflineIndicator, SearchingIndicator, ErrorState, EmptyState, ResultItem, GroupHeader };
