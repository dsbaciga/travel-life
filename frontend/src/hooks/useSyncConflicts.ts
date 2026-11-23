import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  SyncConflict,
  ConflictResolution,
  ConflictResolutionResult,
} from '../types/sync.types';

/**
 * Storage key for persisting resolved conflicts
 */
const RESOLVED_CONFLICTS_STORAGE_KEY = 'travel-life-resolved-conflicts';
const PENDING_CONFLICTS_STORAGE_KEY = 'travel-life-pending-conflicts';

/**
 * Options for the useSyncConflicts hook
 */
export interface UseSyncConflictsOptions {
  /** Callback when a conflict is resolved successfully */
  onConflictResolved?: (result: ConflictResolutionResult) => void;
  /** Callback when all conflicts are resolved */
  onAllConflictsResolved?: () => void;
  /** Callback when a new conflict is added */
  onConflictAdded?: (conflict: SyncConflict) => void;
  /** Whether to persist resolved conflicts to localStorage */
  persistResolved?: boolean;
}

/**
 * Return type for useSyncConflicts hook
 */
export interface UseSyncConflictsReturn {
  /** List of current pending conflicts */
  conflicts: SyncConflict[];
  /** Number of unresolved conflicts */
  conflictCount: number;
  /** Whether there are any conflicts */
  hasConflicts: boolean;
  /** Whether a resolution is in progress */
  isResolving: boolean;
  /** Error message if resolution failed */
  error: string | null;
  /** Add a new conflict to the list */
  addConflict: (conflict: Omit<SyncConflict, 'id' | 'conflictDetectedAt'>) => void;
  /** Add multiple conflicts at once */
  addConflicts: (conflicts: Array<Omit<SyncConflict, 'id' | 'conflictDetectedAt'>>) => void;
  /** Resolve a single conflict */
  resolveConflict: (
    conflictId: number,
    resolution: ConflictResolution,
    mergedData?: Record<string, unknown>
  ) => Promise<void>;
  /** Resolve all conflicts with the same resolution */
  resolveAllConflicts: (resolution: 'keep-local' | 'keep-server') => Promise<void>;
  /** Clear all conflicts (use with caution) */
  clearAllConflicts: () => void;
  /** Get resolved conflicts history */
  getResolvedConflicts: () => ConflictResolutionResult[];
  /** Clear resolved conflicts history */
  clearResolvedHistory: () => void;
}

/**
 * Hook for managing sync conflicts in the PWA.
 *
 * Provides state management and operations for handling data conflicts
 * that occur when the same entity is modified both offline and on the server.
 *
 * Features:
 * - `conflicts` - List of current pending conflicts
 * - `resolveConflict(id, resolution, mergedData?)` - Resolve a single conflict
 * - `resolveAllConflicts(resolution)` - Batch resolve all conflicts
 * - `conflictCount` - Number of unresolved conflicts
 * - Store resolved conflicts for later sync
 *
 * @example
 * ```tsx
 * const {
 *   conflicts,
 *   conflictCount,
 *   resolveConflict,
 *   resolveAllConflicts,
 *   hasConflicts,
 * } = useSyncConflicts({
 *   onConflictResolved: (result) => {
 *     // Send resolved data to sync manager
 *     syncManager.applyResolution(result);
 *   },
 *   onAllConflictsResolved: () => {
 *     toast.success('All conflicts resolved!');
 *   },
 * });
 *
 * // Display conflicts list
 * <ConflictsList
 *   conflicts={conflicts}
 *   onResolve={resolveConflict}
 *   onResolveAll={resolveAllConflicts}
 * />
 *
 * // Show badge with conflict count
 * <ConflictsList.Badge count={conflictCount} />
 * ```
 */
export function useSyncConflicts(
  options: UseSyncConflictsOptions = {}
): UseSyncConflictsReturn {
  const {
    onConflictResolved,
    onAllConflictsResolved,
    onConflictAdded,
    persistResolved = true,
  } = options;

  // State
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for tracking next conflict ID
  const nextIdRef = useRef(1);

  // Load persisted conflicts on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PENDING_CONFLICTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SyncConflict[];
        setConflicts(parsed);
        // Update next ID to be higher than any existing
        const maxId = Math.max(0, ...parsed.map((c) => c.id));
        nextIdRef.current = maxId + 1;
      }
    } catch (err) {
      console.error('Failed to load persisted conflicts:', err);
    }
  }, []);

  // Persist conflicts when they change
  useEffect(() => {
    try {
      localStorage.setItem(PENDING_CONFLICTS_STORAGE_KEY, JSON.stringify(conflicts));
    } catch (err) {
      console.error('Failed to persist conflicts:', err);
    }
  }, [conflicts]);

  /**
   * Add a new conflict to the list
   */
  const addConflict = useCallback(
    (conflictData: Omit<SyncConflict, 'id' | 'conflictDetectedAt'>) => {
      const newConflict: SyncConflict = {
        ...conflictData,
        id: nextIdRef.current++,
        conflictDetectedAt: Date.now(),
      };

      setConflicts((prev) => [...prev, newConflict]);
      onConflictAdded?.(newConflict);
    },
    [onConflictAdded]
  );

  /**
   * Add multiple conflicts at once
   */
  const addConflicts = useCallback(
    (conflictDataArray: Array<Omit<SyncConflict, 'id' | 'conflictDetectedAt'>>) => {
      const now = Date.now();
      const newConflicts: SyncConflict[] = conflictDataArray.map((data) => ({
        ...data,
        id: nextIdRef.current++,
        conflictDetectedAt: now,
      }));

      setConflicts((prev) => [...prev, ...newConflicts]);
      newConflicts.forEach((conflict) => onConflictAdded?.(conflict));
    },
    [onConflictAdded]
  );

  /**
   * Save a resolved conflict to history
   */
  const saveResolvedConflict = useCallback(
    (result: ConflictResolutionResult) => {
      if (!persistResolved) return;

      try {
        const stored = localStorage.getItem(RESOLVED_CONFLICTS_STORAGE_KEY);
        const existing: ConflictResolutionResult[] = stored ? JSON.parse(stored) : [];

        // Add new result to the front, limit to last 100 resolutions
        const updated = [result, ...existing].slice(0, 100);
        localStorage.setItem(RESOLVED_CONFLICTS_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save resolved conflict:', err);
      }
    },
    [persistResolved]
  );

  /**
   * Resolve a single conflict
   */
  const resolveConflict = useCallback(
    async (
      conflictId: number,
      resolution: ConflictResolution,
      mergedData?: Record<string, unknown>
    ): Promise<void> => {
      setIsResolving(true);
      setError(null);

      try {
        // Find the conflict
        const conflict = conflicts.find((c) => c.id === conflictId);
        if (!conflict) {
          throw new Error(`Conflict with ID ${conflictId} not found`);
        }

        // Determine resolved data
        let resolvedData: Record<string, unknown>;
        switch (resolution) {
          case 'keep-local':
            resolvedData = conflict.localData;
            break;
          case 'keep-server':
            resolvedData = conflict.serverData;
            break;
          case 'merge':
            if (!mergedData) {
              throw new Error('Merged data is required for merge resolution');
            }
            resolvedData = mergedData;
            break;
          default:
            throw new Error(`Unknown resolution type: ${resolution}`);
        }

        // Create resolution result
        const result: ConflictResolutionResult = {
          conflictId,
          resolution,
          resolvedData,
          resolvedAt: Date.now(),
        };

        // Save to history
        saveResolvedConflict(result);

        // Remove from pending conflicts
        setConflicts((prev) => prev.filter((c) => c.id !== conflictId));

        // Notify callback
        onConflictResolved?.(result);

        // Check if all conflicts are resolved
        if (conflicts.length === 1) {
          onAllConflictsResolved?.();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Couldn't resolve conflict. Try again.";
        setError(errorMessage);
        throw err;
      } finally {
        setIsResolving(false);
      }
    },
    [conflicts, onConflictResolved, onAllConflictsResolved, saveResolvedConflict]
  );

  /**
   * Resolve all conflicts with the same resolution
   */
  const resolveAllConflicts = useCallback(
    async (resolution: 'keep-local' | 'keep-server'): Promise<void> => {
      setIsResolving(true);
      setError(null);

      try {
        const results: ConflictResolutionResult[] = [];
        const now = Date.now();

        for (const conflict of conflicts) {
          const resolvedData =
            resolution === 'keep-local' ? conflict.localData : conflict.serverData;

          const result: ConflictResolutionResult = {
            conflictId: conflict.id,
            resolution,
            resolvedData,
            resolvedAt: now,
          };

          results.push(result);
          saveResolvedConflict(result);
          onConflictResolved?.(result);
        }

        // Clear all conflicts
        setConflicts([]);

        // Notify all resolved
        onAllConflictsResolved?.();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Couldn't resolve all conflicts. Try again.";
        setError(errorMessage);
        throw err;
      } finally {
        setIsResolving(false);
      }
    },
    [conflicts, onConflictResolved, onAllConflictsResolved, saveResolvedConflict]
  );

  /**
   * Clear all pending conflicts
   */
  const clearAllConflicts = useCallback(() => {
    setConflicts([]);
    localStorage.removeItem(PENDING_CONFLICTS_STORAGE_KEY);
  }, []);

  /**
   * Get resolved conflicts history
   */
  const getResolvedConflicts = useCallback((): ConflictResolutionResult[] => {
    try {
      const stored = localStorage.getItem(RESOLVED_CONFLICTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  /**
   * Clear resolved conflicts history
   */
  const clearResolvedHistory = useCallback(() => {
    localStorage.removeItem(RESOLVED_CONFLICTS_STORAGE_KEY);
  }, []);

  return {
    conflicts,
    conflictCount: conflicts.length,
    hasConflicts: conflicts.length > 0,
    isResolving,
    error,
    addConflict,
    addConflicts,
    resolveConflict,
    resolveAllConflicts,
    clearAllConflicts,
    getResolvedConflicts,
    clearResolvedHistory,
  };
}

export default useSyncConflicts;
