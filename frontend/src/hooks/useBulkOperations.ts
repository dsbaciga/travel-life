import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useBulkSelection } from './useBulkSelection';
import { pluralize } from '../utils/stringHelpers';
import { getApiErrorMessage } from '../lib/errors';

/** The entity noun for a count: "1 stay", "3 stays". */
const nounFor = (entityName: string, count: number) =>
  count === 1 ? entityName : pluralize(entityName);

/**
 * Service interface for bulk operations.
 * Each manager's service provides these two methods for bulk delete/update.
 */
interface BulkService<TUpdates = Record<string, unknown>> {
  bulkDelete: (tripId: number, ids: number[]) => Promise<{ success: boolean; deletedCount: number }>;
  bulkUpdate: (tripId: number, ids: number[], updates: TUpdates) => Promise<unknown>;
}

interface UseBulkOperationsOptions {
  /** The trip ID for bulk operations */
  tripId: number;
  /** Display name for the entity type (e.g., "activity", "lodging") */
  entityName: string;
  /** Bulk service with bulkDelete and bulkUpdate methods */
  service: BulkService;
  /** Reload items after bulk operations */
  loadItems: () => Promise<void>;
  /** Optional parent update callback */
  onUpdate?: () => void;
  /** Confirmation dialog function - returns true if confirmed */
  confirm: (options: {
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning' | 'info';
  }) => Promise<boolean>;
}

/**
 * Hook that combines bulk selection state with bulk delete and edit operations.
 *
 * Eliminates ~100 lines of boilerplate per Manager component by providing:
 * - Bulk selection state via useBulkSelection (Pattern 11)
 * - handleBulkDelete with confirmation dialog (Pattern 8)
 * - handleBulkEdit with modal state management (Pattern 9)
 * - All related loading states (isBulkDeleting, isBulkEditing)
 * - Bulk edit modal visibility state (showBulkEditModal)
 *
 * @template T - Entity type with an `id` field
 *
 * @example
 * ```tsx
 * const bulk = useBulkOperations<Activity>({
 *   tripId,
 *   entityName: 'activity',
 *   service: {
 *     bulkDelete: activityService.bulkDeleteActivities,
 *     bulkUpdate: activityService.bulkUpdateActivities,
 *   },
 *   loadItems: manager.loadItems,
 *   onUpdate,
 *   confirm,
 * });
 *
 * // Use bulk.selection for selection state
 * // Use bulk.handleBulkDelete / bulk.handleBulkEdit for operations
 * // Use bulk.showBulkEditModal / bulk.setShowBulkEditModal for modal
 * ```
 */
export function useBulkOperations<T extends { id: number }>(
  options: UseBulkOperationsOptions
) {
  const { tripId, entityName, service, loadItems, onUpdate, confirm } = options;

  // Core selection state
  const selection = useBulkSelection<T>();

  // Bulk operation loading states
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);

  // Bulk edit modal visibility
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);

  /**
   * Handles bulk deletion of selected items with confirmation dialog.
   * Shows a confirmation prompt, performs the deletion, provides feedback,
   * exits selection mode, and refreshes the item list.
   */
  const handleBulkDelete = useCallback(async () => {
    const selectedIds = selection.getSelectedIds();
    if (selectedIds.length === 0) return;

    const confirmed = await confirm({
      title: `Delete ${nounFor(entityName, selectedIds.length)}`,
      message: `Delete ${selectedIds.length} selected ${nounFor(entityName, selectedIds.length)}? You can't undo this.`,
      confirmLabel: `Delete ${selectedIds.length} ${nounFor(entityName, selectedIds.length)}`,
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      await service.bulkDelete(tripId, selectedIds);
      toast.success(`Deleted ${selectedIds.length} ${nounFor(entityName, selectedIds.length)}`);
      selection.exitSelectionMode();
      await loadItems();
      onUpdate?.();
    } catch (error) {
      console.error(`Failed to bulk delete ${pluralize(entityName)}:`, error);
      toast.error(getApiErrorMessage(error, `Couldn't delete some ${pluralize(entityName)}. Try again.`));
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selection, confirm, entityName, service, tripId, loadItems, onUpdate]);

  /**
   * Handles bulk editing of selected items.
   * Applies the given updates to all selected items, provides feedback,
   * closes the edit modal, exits selection mode, and refreshes the item list.
   *
   * @param updates - Object containing the field updates to apply
   */
  const handleBulkEdit = useCallback(async (updates: Record<string, unknown>) => {
    const selectedIds = selection.getSelectedIds();
    if (selectedIds.length === 0) return;

    setIsBulkEditing(true);
    try {
      await service.bulkUpdate(tripId, selectedIds, updates);
      toast.success(`Updated ${selectedIds.length} ${nounFor(entityName, selectedIds.length)}`);
      setShowBulkEditModal(false);
      selection.exitSelectionMode();
      await loadItems();
      onUpdate?.();
    } catch (error) {
      console.error(`Failed to bulk update ${pluralize(entityName)}:`, error);
      toast.error(getApiErrorMessage(error, `Couldn't update some ${pluralize(entityName)}. Try again.`));
    } finally {
      setIsBulkEditing(false);
    }
  }, [selection, entityName, service, tripId, loadItems, onUpdate]);

  /**
   * Opens the bulk edit modal
   */
  const openBulkEditModal = useCallback(() => {
    setShowBulkEditModal(true);
  }, []);

  /**
   * Closes the bulk edit modal
   */
  const closeBulkEditModal = useCallback(() => {
    setShowBulkEditModal(false);
  }, []);

  return {
    // Selection state and operations (from useBulkSelection)
    selection,

    // Bulk operation handlers
    handleBulkDelete,
    handleBulkEdit,

    // Loading states
    isBulkDeleting,
    isBulkEditing,

    // Bulk edit modal state
    showBulkEditModal,
    setShowBulkEditModal,
    openBulkEditModal,
    closeBulkEditModal,
  };
}

export default useBulkOperations;
