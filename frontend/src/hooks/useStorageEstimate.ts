import { useState, useEffect, useCallback } from 'react';
import { useIOSDetection } from './useIOSDetection';

// iOS has a ~50MB limit for Cache API
const IOS_STORAGE_LIMIT = 50 * 1024 * 1024; // 50MB in bytes
// Warn when storage is at 80% (40MB on iOS)
const IOS_WARNING_THRESHOLD = 0.8;
// Default warning threshold for other platforms
const DEFAULT_WARNING_THRESHOLD = 0.9;

export interface StorageEstimateResult {
  /** Current storage usage in bytes */
  usage: number;
  /** Storage quota in bytes (if available) */
  quota: number;
  /** Percentage of quota used (0-100) */
  percentUsed: number;
  /** Whether storage is running low */
  isLow: boolean;
  /** Whether storage estimate is available */
  isSupported: boolean;
  /** Whether currently loading the estimate */
  isLoading: boolean;
  /** Error message if estimate failed */
  error: string | null;
  /** Refresh the storage estimate */
  refresh: () => Promise<void>;
  /** Human-readable usage string (e.g., "25.3 MB") */
  usageFormatted: string;
  /** Human-readable quota string (e.g., "50 MB") */
  quotaFormatted: string;
}

/**
 * Hook for getting storage usage estimates.
 *
 * Uses navigator.storage.estimate() with special handling for iOS limitations:
 * - iOS Safari has a ~50MB Cache API limit
 * - iOS doesn't always report accurate quota/usage
 * - Falls back to IndexedDB usage estimation when needed
 *
 * @example
 * ```tsx
 * const {
 *   usage,
 *   quota,
 *   percentUsed,
 *   isLow,
 *   usageFormatted,
 *   quotaFormatted,
 * } = useStorageEstimate();
 *
 * return (
 *   <div>
 *     <p>Storage: {usageFormatted} / {quotaFormatted}</p>
 *     <progress value={percentUsed} max={100} />
 *     {isLow && <span>Storage running low!</span>}
 *   </div>
 * );
 * ```
 */
export function useStorageEstimate(): StorageEstimateResult {
  const { isIOS } = useIOSDetection();

  const [usage, setUsage] = useState(0);
  const [quota, setQuota] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if Storage API is supported
  const isSupported = typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.estimate === 'function';

  // Estimate storage usage
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isSupported) {
        // Fallback: try to estimate from IndexedDB
        const idbUsage = await estimateIndexedDBUsage();
        setUsage(idbUsage);
        // Use iOS limit as fallback quota
        setQuota(isIOS ? IOS_STORAGE_LIMIT : 100 * 1024 * 1024); // 100MB default
        return;
      }

      const estimate = await navigator.storage.estimate();

      let estimatedUsage = estimate.usage || 0;
      let estimatedQuota = estimate.quota || 0;

      // iOS-specific handling
      if (isIOS) {
        // iOS often reports very large quota but actual limit is ~50MB
        estimatedQuota = Math.min(estimatedQuota, IOS_STORAGE_LIMIT);

        // If no usage reported, try to estimate from IndexedDB
        if (estimatedUsage === 0) {
          estimatedUsage = await estimateIndexedDBUsage();
        }
      }

      setUsage(estimatedUsage);
      setQuota(estimatedQuota);
    } catch (err) {
      console.error('Failed to estimate storage:', err);
      setError(err instanceof Error ? err.message : "Couldn't estimate storage. Try again.");

      // Fallback to safe defaults
      setUsage(0);
      setQuota(isIOS ? IOS_STORAGE_LIMIT : 0);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isIOS]);

  // Initial load and periodic refresh
  useEffect(() => {
    refresh();

    // Refresh every 5 minutes while the page is active
    const interval = setInterval(refresh, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refresh]);

  // Calculate derived values
  const percentUsed = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;

  const warningThreshold = isIOS ? IOS_WARNING_THRESHOLD : DEFAULT_WARNING_THRESHOLD;
  const isLow = percentUsed >= warningThreshold * 100;

  return {
    usage,
    quota,
    percentUsed,
    isLow,
    isSupported,
    isLoading,
    error,
    refresh,
    usageFormatted: formatBytes(usage),
    quotaFormatted: formatBytes(quota),
  };
}

/**
 * Estimate IndexedDB usage by iterating through databases.
 *
 * This is a fallback for browsers/platforms that don't support
 * navigator.storage.estimate() or report inaccurate values.
 */
async function estimateIndexedDBUsage(): Promise<number> {
  if (typeof indexedDB === 'undefined') {
    return 0;
  }

  try {
    // Try to get database names if supported
    if ('databases' in indexedDB && typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      let totalSize = 0;

      for (const dbInfo of databases) {
        if (dbInfo.name) {
          try {
            const size = await estimateDatabaseSize(dbInfo.name);
            totalSize += size;
          } catch {
            // Skip databases we can't access
          }
        }
      }

      return totalSize;
    }
  } catch {
    // indexedDB.databases() not supported or failed
  }

  // Fallback: try to estimate our known database
  try {
    return await estimateDatabaseSize('travel-life-offline');
  } catch {
    return 0;
  }
}

/**
 * Estimate the size of a single IndexedDB database.
 */
async function estimateDatabaseSize(dbName: string): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);

    request.onsuccess = () => {
      const db = request.result;
      let totalSize = 0;

      const storeNames = Array.from(db.objectStoreNames);

      if (storeNames.length === 0) {
        db.close();
        resolve(0);
        return;
      }

      const transaction = db.transaction(storeNames, 'readonly');
      let storesProcessed = 0;

      storeNames.forEach((storeName) => {
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();

        countRequest.onsuccess = () => {
          // Rough estimate: assume average record size of 1KB
          // This is a very rough estimate but better than nothing
          totalSize += countRequest.result * 1024;
          storesProcessed++;

          if (storesProcessed === storeNames.length) {
            db.close();
            resolve(totalSize);
          }
        };

        countRequest.onerror = () => {
          storesProcessed++;
          if (storesProcessed === storeNames.length) {
            db.close();
            resolve(totalSize);
          }
        };
      });

      transaction.onerror = () => {
        db.close();
        resolve(0);
      };
    };

    request.onerror = () => {
      resolve(0);
    };

    // Timeout after 5 seconds
    setTimeout(() => resolve(0), 5000);
  });
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Format with appropriate precision
  if (i >= 2) {
    // MB and GB: 1 decimal place
    return `${size.toFixed(1)} ${sizes[i]}`;
  }
  // KB and B: no decimal
  return `${Math.round(size)} ${sizes[i]}`;
}

export default useStorageEstimate;
