import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Generic pagination hook for "load more" patterns
 *
 * Handles:
 * - Initial data loading
 * - Progressive loading (load more)
 * - Loading states
 * - Error handling
 * - Has more detection
 *
 * @template T - The item type
 *
 * @param loadFunction - Function to fetch paginated data
 *   Should accept (skip: number, take: number) and return { items, total, hasMore }
 * @param options - Configuration options
 * @param options.pageSize - Number of items per page (default: 40)
 * @param options.enabled - Whether to auto-load on mount (default: true)
 * @param options.onError - Custom error handler
 *
 * @returns Object with state and pagination controls
 *
 * @example
 * ```typescript
 * const photoPagination = usePagination(
 *   async (skip, take) => {
 *     const result = await photoService.getPhotosByTrip(tripId, { skip, take });
 *     return {
 *       items: result.photos,
 *       total: result.total,
 *       hasMore: result.hasMore,
 *     };
 *   },
 *   { pageSize: 40 }
 * );
 *
 * // In component:
 * {photoPagination.items.map(photo => <Photo key={photo.id} photo={photo} />)}
 * {photoPagination.hasMore && (
 *   <button onClick={photoPagination.loadMore} disabled={photoPagination.loadingMore}>
 *     Load More
 *   </button>
 * )}
 * ```
 */
export function usePagination<T>(
  loadFunction: (skip: number, take: number) => Promise<{
    items: T[];
    total: number;
    hasMore: boolean;
  }>,
  options: {
    pageSize?: number;
    enabled?: boolean;
    onError?: (error: unknown) => void;
  } = {}
) {
  const {
    pageSize = 40,
    enabled = true,
    onError,
  } = options;

  // State
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Loads initial page of items
   * Replaces existing items with fresh data
   */
  const loadInitial = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = await loadFunction(0, pageSize);
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load initial items:', err);
      setError(err instanceof Error ? err : new Error("Couldn't load. Try again."));

      if (onError) {
        onError(err);
      } else {
        toast.error("Couldn't load items. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [loadFunction, pageSize, enabled, onError]);

  /**
   * Loads next page of items
   * Appends to existing items
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;

    setLoadingMore(true);
    setError(null);

    try {
      const result = await loadFunction(items.length, pageSize);
      setItems(prev => [...prev, ...result.items]);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load more items:', err);
      setError(err instanceof Error ? err : new Error("Couldn't load more. Try again."));

      if (onError) {
        onError(err);
      } else {
        toast.error("Couldn't load more items. Try again.");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadFunction, items.length, pageSize, hasMore, loadingMore, loading, onError]);

  /**
   * Resets pagination state and reloads from beginning
   */
  const reset = useCallback(() => {
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setError(null);
    loadInitial();
  }, [loadInitial]);

  /**
   * Clears all items without reloading
   */
  const clear = useCallback(() => {
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setError(null);
  }, []);

  /**
   * Manually set items (useful for optimistic updates)
   */
  const setItemsManually = useCallback((newItems: T[] | ((prev: T[]) => T[])) => {
    setItems(newItems);
  }, []);

  return {
    // State
    items,
    total,
    hasMore,
    loading,
    loadingMore,
    error,

    // Actions
    loadInitial,
    loadMore,
    reset,
    clear,
    setItems: setItemsManually,

    // Computed
    isEmpty: items.length === 0 && !loading,
    isLoadingInitial: loading && items.length === 0,
  };
}

/**
 * Simple pagination hook with automatic initial load
 * Wrapper around usePagination that auto-loads on mount
 *
 * @example
 * ```typescript
 * const pagination = useAutoPagination(async (skip, take) => {
 *   // ... fetch logic
 * });
 *
 * useEffect(() => {
 *   pagination.loadInitial();
 * }, [tripId]); // Reload when dependency changes
 * ```
 */
export function useAutoPagination<T>(
  loadFunction: (skip: number, take: number) => Promise<{
    items: T[];
    total: number;
    hasMore: boolean;
  }>,
  options: {
    pageSize?: number;
    onError?: (error: unknown) => void;
  } = {}
) {
  const pagination = usePagination(loadFunction, { ...options, enabled: true });

  // Note: Caller should trigger loadInitial() in useEffect with appropriate dependencies
  return pagination;
}

/**
 * Infinite scroll pagination hook
 * Automatically loads more when scrolling near bottom
 *
 * @example
 * ```typescript
 * const pagination = useInfiniteScroll(
 *   loadFunction,
 *   { threshold: 100 } // Load more when within 100px of bottom
 * );
 *
 * <div ref={pagination.scrollRef}>
 *   {pagination.items.map(item => <Item key={item.id} item={item} />)}
 * </div>
 * ```
 */
export function useInfiniteScroll<T>(
  loadFunction: (skip: number, take: number) => Promise<{
    items: T[];
    total: number;
    hasMore: boolean;
  }>,
  options: {
    pageSize?: number;
    enabled?: boolean;
    threshold?: number; // Distance from bottom in pixels
    onError?: (error: unknown) => void;
  } = {}
) {
  const {
    threshold = 100,
    ...paginationOptions
  } = options;

  const pagination = usePagination(loadFunction, paginationOptions);

  // Scroll event handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (scrollBottom < threshold && pagination.hasMore && !pagination.loadingMore) {
      pagination.loadMore();
    }
  }, [threshold, pagination]);

  return {
    ...pagination,
    onScroll: handleScroll,
  };
}

/**
 * Creates a ref callback for infinite scroll without manual onScroll handling
 * Uses Intersection Observer API for better performance
 *
 * @example
 * ```typescript
 * const pagination = usePagination(loadFunction);
 * const sentinelRef = useInfiniteScrollSentinel(pagination.loadMore, {
 *   enabled: pagination.hasMore && !pagination.loadingMore
 * });
 *
 * <div>
 *   {pagination.items.map(item => <Item key={item.id} item={item} />)}
 *   <div ref={sentinelRef} />
 * </div>
 * ```
 */
export function useInfiniteScrollSentinel(
  loadMore: () => void,
  options: {
    enabled?: boolean;
    threshold?: number; // 0 to 1, percentage of visibility
  } = {}
) {
  const { enabled = true, threshold = 0.1 } = options;

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [loadMore, enabled, threshold]);

  return sentinelRef;
}
