import { useCallback, useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import OfflineIndicator from './OfflineIndicator';
import ConflictsList from './ConflictsList';
import syncManager, { type StoredConflict } from '../../services/syncManager';
import { OFFLINE_SYNC_UPDATE_EVENT, notifyOfflineSyncUpdate } from '../../hooks/useOfflineReady';
import type {
  ConflictResolution as StoredConflictResolution,
  SyncEntityType,
} from '../../types/offline.types';
import type {
  SyncConflict,
  SyncConflictEntityType,
  ConflictResolution,
} from '../../types/sync.types';

/**
 * Map the sync pipeline's entity types onto the display types the conflict UI
 * knows how to label and icon.
 */
const ENTITY_TYPE_MAP: Partial<Record<SyncEntityType, SyncConflictEntityType>> = {
  trip: 'TRIP',
  location: 'LOCATION',
  activity: 'ACTIVITY',
  transportation: 'TRANSPORTATION',
  lodging: 'LODGING',
  journal: 'JOURNAL',
  checklistItem: 'CHECKLIST_ITEM',
};

/**
 * Display-only fallback for entity types the conflict UI has no label for
 * (tags, companions, photos, …). Conflicts are only ever raised for
 * update/delete of the mapped types today; the fallback exists so an
 * unmapped type is still shown and resolvable rather than hidden.
 */
const FALLBACK_ENTITY_TYPE: SyncConflictEntityType = 'ACTIVITY';

/**
 * The UI speaks 'keep-local'/'keep-server'; the sync pipeline speaks
 * 'local'/'server'.
 */
const RESOLUTION_MAP: Record<ConflictResolution, StoredConflictResolution> = {
  'keep-local': 'local',
  'keep-server': 'server',
  merge: 'merge',
};

/**
 * Adapt a conflict stored in IndexedDB into the shape the conflict UI renders.
 * Returns null for records without a key (which cannot be resolved).
 */
function toDisplayConflict(conflict: StoredConflict): SyncConflict | null {
  if (typeof conflict.id !== 'number') return null;

  return {
    id: conflict.id,
    entityType: ENTITY_TYPE_MAP[conflict.entityType] ?? FALLBACK_ENTITY_TYPE,
    entityId: conflict.entityId,
    localData: (conflict.localData ?? {}) as Record<string, unknown>,
    serverData: (conflict.serverData ?? {}) as Record<string, unknown>,
    localTimestamp: conflict.localTimestamp,
    serverTimestamp: conflict.serverTimestamp,
    // The stored record has no separate detection timestamp; the local edit
    // time is the closest available approximation.
    conflictDetectedAt: conflict.localTimestamp,
  };
}

/**
 * Global PWA status layer.
 *
 * Mounts the two pieces of the offline subsystem that must always be reachable:
 *
 * 1. `OfflineIndicator` — banner shown when offline or on a slow connection,
 *    with the real pending-change count from the IndexedDB sync queue.
 * 2. The conflict-resolution path — `syncManager` parks unresolvable sync
 *    conflicts in the IndexedDB `syncConflicts` store. Without this, they are
 *    invisible and permanently unresolvable. A floating indicator appears
 *    whenever conflicts exist and opens `ConflictsList` (which in turn opens
 *    `ConflictResolutionModal`).
 *
 * The conflicts panel is a plain overlay rather than the shared `Modal` so the
 * `ConflictResolutionModal` it opens is not a nested modal.
 */
export default function PwaStatusLayer() {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const pending = await syncManager.getPendingConflicts();
      setConflicts(
        pending
          .map(toDisplayConflict)
          .filter((conflict): conflict is SyncConflict => conflict !== null)
      );
    } catch (error) {
      console.error('[PwaStatusLayer] Failed to load sync conflicts:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleUpdate = () => {
      void refresh();
    };

    const unsubscribe = syncManager.onSyncComplete(handleUpdate);
    window.addEventListener(OFFLINE_SYNC_UPDATE_EVENT, handleUpdate);
    window.addEventListener('online', handleUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener(OFFLINE_SYNC_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('online', handleUpdate);
    };
  }, [refresh]);

  const handleResolve = useCallback(
    async (
      conflictId: number,
      resolution: ConflictResolution,
      resolvedData: Record<string, unknown>
    ): Promise<void> => {
      setIsResolving(true);
      try {
        await syncManager.resolveConflict(conflictId, RESOLUTION_MAP[resolution], resolvedData);
      } catch (error) {
        console.error('[PwaStatusLayer] Failed to resolve conflict:', error);
      } finally {
        setIsResolving(false);
        await refresh();
        notifyOfflineSyncUpdate();
      }
    },
    [refresh]
  );

  const handleResolveAll = useCallback(
    async (resolution: 'keep-local' | 'keep-server'): Promise<void> => {
      setIsResolving(true);
      try {
        for (const conflict of conflicts) {
          try {
            await syncManager.resolveConflict(conflict.id, RESOLUTION_MAP[resolution]);
          } catch (error) {
            console.error(
              `[PwaStatusLayer] Failed to resolve conflict ${conflict.id}:`,
              error
            );
          }
        }
      } finally {
        setIsResolving(false);
        await refresh();
        notifyOfflineSyncUpdate();
      }
    },
    [conflicts, refresh]
  );

  return (
    <>
      <OfflineIndicator position="top" />

      {conflicts.length > 0 && (
        <div className="fixed right-4 bottom-20 z-40 md:bottom-4">
          <ConflictsList.Indicator
            count={conflicts.length}
            onClick={() => setIsPanelOpen(true)}
          />
        </div>
      )}

      {isPanelOpen && (
        <div className="fixed inset-0 z-[90] overflow-y-auto p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsPanelOpen(false)}
            aria-hidden="true"
          />

          <div className="relative mx-auto mt-16 w-full max-w-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                aria-label="Close sync conflicts"
                className="
                  flex h-10 w-10 items-center justify-center rounded-full
                  bg-white/90 text-charcoal shadow-lg
                  hover:bg-white
                  dark:bg-navy-800/90 dark:text-warm-gray dark:hover:bg-navy-700
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                "
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <ConflictsList
              conflicts={conflicts}
              onResolve={handleResolve}
              onResolveAll={handleResolveAll}
              isResolving={isResolving}
            />
          </div>
        </div>
      )}
    </>
  );
}
