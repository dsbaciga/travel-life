import { useState, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';

/**
 * True paged pagination hook - only keeps one page of items in memory at a time
 *
 * Unlike usePagination which accumulates items (infinite scroll pattern),
 * this hook replaces items when navigating between pages, reducing memory usage
 * for large datasets.
 *
 * @template T - The item type
 *
 * @param loadFunction - Function to fetch paginated data
 *   Should accept (skip: number, take: number) and return { items, total, hasMore }
 * @param options - Configuration options
 * @param options.pageSize - Number of items per page (default: 40)
 * @param options.onError - Custom error handler
 * @param options.scrollToTop - Whether to scroll to top when changing pages (default: true)
 *
 * @returns Object with state and pagination controls
 */
export function usePagedPagination<T>(
  loadFunction: (skip: number, take: number) => Promise<{
    items: T[];
    total: number;
    hasMore: boolean;
  }>,
  options: {
    pageSize?: number;
    onError?: (error: unknown) => void;
    scrollToTop?: boolean;
  } = {}
) {
  const { pageSize = 40, onError, scrollToTop = true } = options;

  // State
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Computed values
  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize]);
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  /**
   * Load a specific page - replaces current items
   */
  const loadPage = useCallback(
    async (page: number, shouldScroll = true) => {
      if (page < 1) return;

      setLoading(true);
      setError(null);

      // Scroll to top when changing pages (not on initial load)
      if (scrollToTop && shouldScroll && page !== currentPage) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      const skip = (page - 1) * pageSize;

      try {
        const result = await loadFunction(skip, pageSize);
        setItems(result.items);
        setTotal(result.total);
        setCurrentPage(page);
      } catch (err) {
        console.error('Failed to load page:', err);
        setError(err instanceof Error ? err : new Error("Couldn't load. Try again."));

        if (onError) {
          onError(err);
        } else {
          toast.error("Couldn't load items. Try again.");
        }
      } finally {
        setLoading(false);
      }
    },
    [loadFunction, pageSize, onError, scrollToTop, currentPage]
  );

  /**
   * Load initial page (page 1) - does not scroll to top
   */
  const loadInitial = useCallback(() => {
    return loadPage(1, false);
  }, [loadPage]);

  /**
   * Go to next page
   */
  const nextPage = useCallback(() => {
    if (hasNextPage && !loading) {
      loadPage(currentPage + 1);
    }
  }, [hasNextPage, loading, currentPage, loadPage]);

  /**
   * Go to previous page
   */
  const previousPage = useCallback(() => {
    if (hasPreviousPage && !loading) {
      loadPage(currentPage - 1);
    }
  }, [hasPreviousPage, loading, currentPage, loadPage]);

  /**
   * Go to a specific page
   */
  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages && page !== currentPage && !loading) {
        loadPage(page);
      }
    },
    [totalPages, currentPage, loading, loadPage]
  );

  /**
   * Reset to page 1 - does not scroll to top
   */
  const reset = useCallback(() => {
    setItems([]);
    setTotal(0);
    setCurrentPage(1);
    setError(null);
    loadPage(1, false);
  }, [loadPage]);

  /**
   * Clear all items without reloading
   */
  const clear = useCallback(() => {
    setItems([]);
    setTotal(0);
    setCurrentPage(1);
    setError(null);
  }, []);

  /**
   * Generate page numbers for pagination UI
   * Shows: first, ..., current-1, current, current+1, ..., last
   */
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('ellipsis');
    }

    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1 && !pages.includes(totalPages)) {
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  return {
    // State
    items,
    total,
    currentPage,
    totalPages,
    pageSize,
    loading,
    error,

    // Navigation state
    hasNextPage,
    hasPreviousPage,

    // Actions
    loadInitial,
    loadPage,
    nextPage,
    previousPage,
    goToPage,
    reset,
    clear,

    // UI helpers
    pageNumbers,

    // Computed
    isEmpty: items.length === 0 && !loading,
    isLoadingInitial: loading && items.length === 0,

    // Range info for "Showing X-Y of Z"
    rangeStart: total > 0 ? (currentPage - 1) * pageSize + 1 : 0,
    rangeEnd: Math.min(currentPage * pageSize, total),
  };
}
