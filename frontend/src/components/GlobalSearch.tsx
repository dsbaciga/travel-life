/**
 * GlobalSearch Component
 *
 * Provides global search across trips, locations, photos, and journal entries.
 * Features autocomplete, keyboard navigation, and quick actions.
 *
 * Features:
 * - Search across multiple entity types
 * - Real-time autocomplete suggestions
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Recent searches history
 * - Quick access to results
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <GlobalSearch />
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import searchService, { type SearchResult } from '../services/search.service';

interface GlobalSearchProps {
  /** Show as compact mode (for navbar) */
  compact?: boolean;
  /** Callback when search is closed */
  onClose?: () => void;
}

export default function GlobalSearch({ compact = false, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const navigate = useNavigate();

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save search to recent searches
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setRecentSearches((prev) => {
      const updated = [searchQuery, ...prev.filter((q) => q !== searchQuery)].slice(0, 5);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Mock search function - replace with actual API call
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);

    try {
      const response = await searchService.globalSearch(searchQuery);
      setResults(response.results);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectResult(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowResults(false);
      onClose?.();
    }
  };

  // Handle result selection - uses ref for query to keep stable identity
  const handleSelectResult = useCallback((result: SearchResult) => {
    saveRecentSearch(queryRef.current);
    navigate(result.url);
    setShowResults(false);
    setQuery('');
    onClose?.();
  }, [navigate, saveRecentSearch, onClose]);

  // Handle recent search selection
  const handleRecentSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    setShowResults(true);
    inputRef.current?.focus();
  };

  // Clear recent searches
  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  // Register keyboard shortcut (Ctrl+K or Cmd+K)
  const { registerShortcut } = useKeyboardShortcuts();

  useEffect(() => {
    const cleanup = registerShortcut({
      key: 'k',
      ctrl: true,
      description: 'Open global search',
      action: () => {
        inputRef.current?.focus();
        setShowResults(true);
      },
      category: 'Navigation',
    });
    return cleanup;
  }, [registerShortcut]);

  // Get icon for result type
  const getTypeIcon = useCallback((type: SearchResult['type']) => {
    switch (type) {
      case 'trip':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
            />
          </svg>
        );
      case 'location':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
          </svg>
        );
      case 'photo':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        );
      case 'journal':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        );
    }
  }, []);

  // Render search results inline - the list is small enough that memoization
  // adds complexity without meaningful benefit
  const renderedResults = query && results.length > 0 ? (
    <div className="p-2">
      {results.map((result, index) => (
        <button
          key={`${result.type}-${result.id}`}
          onClick={() => handleSelectResult(result)}
          className={`
            w-full text-left px-3 py-3 rounded-lg transition-colors duration-150
            ${
              index === selectedIndex
                ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500 dark:border-sky'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          <div className="flex items-start gap-3">
            <div
              className={`
              flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
              ${
                index === selectedIndex
                  ? 'bg-primary-100 dark:bg-primary-800 text-primary-600 dark:text-sky'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }
            `}
            >
              {getTypeIcon(result.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {result.title}
              </div>
              {result.subtitle && (
                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {result.subtitle}
                </div>
              )}
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 capitalize">
                {result.type}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`relative ${compact ? 'w-full max-w-md' : 'w-full max-w-2xl mx-auto'}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          name="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search trips, locations, photos\u2026"
          aria-label="Search trips, locations, photos"
          className={`
            w-full pl-10 pr-12 py-3
            border-2 border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-white
            rounded-xl
            focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky
            focus:border-transparent
            transition-colors duration-200
            ${compact ? 'text-sm' : 'text-base'}
          `}
        />
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full animate-spin" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : (
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Results Dropdown */}
      {showResults && (query || recentSearches.length > 0) && (
        <div
          ref={resultsRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-96 overflow-y-auto z-[70] animate-slide-in"
        >
          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((search) => (
                <button
                  key={search}
                  onClick={() => handleRecentSearch(search)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{search}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Search Results (memoized) */}
          {renderedResults}

          {/* No Results */}
          {query && !isLoading && results.length === 0 && (
            <div className="p-8 text-center">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
                Try different keywords
              </p>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {showResults && (
        <div
          className="fixed inset-0 z-[60]"
          aria-hidden="true"
          onClick={() => {
            setShowResults(false);
            onClose?.();
          }}
        />
      )}
    </div>
  );
}
