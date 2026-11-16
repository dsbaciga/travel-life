import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { capitalize } from '../utils/stringHelpers';

/**
 * Generic CRUD state management hook for Manager components
 *
 * Eliminates 150-200 lines of boilerplate per Manager component by providing:
 * - Standard CRUD state (items, loading, form visibility, editing)
 * - Standard CRUD operations (create, update, delete)
 * - Automatic data loading on mount
 * - Consistent error handling and user feedback
 *
 * @template T - The entity type (must have an id field)
 *
 * @param service - Service object with CRUD methods
 * @param service.getByTrip - Fetch all items for a trip
 * @param service.create - Create a new item
 * @param service.update - Update an existing item
 * @param service.delete - Delete an item
 * @param tripId - The trip ID to fetch items for
 * @param options - Configuration options
 * @param options.itemName - Display name for the entity (e.g., 'activity', 'lodging')
 * @param options.onUpdate - Callback after successful create/update/delete
 *
 * @returns Object with state and CRUD operation handlers
 *
 * @example
 * ```typescript
 * const manager = useManagerCRUD(activityService, tripId, {
 *   itemName: 'activity',
 *   onUpdate: refreshParentData,
 * });
 *
 * // Usage in component:
 * {manager.items.map(item => <ItemCard key={item.id} item={item} />)}
 * <button onClick={manager.openCreateForm}>Add Activity</button>
 * <button onClick={() => manager.openEditForm(item.id)}>Edit</button>
 * <button onClick={() => manager.handleDelete(item.id)}>Delete</button>
 * ```
 */
export function useManagerCRUD<T extends { id: number }, TCreateData = unknown, TUpdateData = unknown>(
  service: {
    getByTrip: (tripId: number) => Promise<T[]>;
    create: (data: TCreateData) => Promise<T>;
    update: (id: number, data: TUpdateData) => Promise<T>;
    delete: (id: number) => Promise<void>;
  },
  tripId: number,
  options: {
    itemName?: string;
    onUpdate?: () => void;
  } = {}
) {
  const { itemName = 'item', onUpdate } = options;

  // State
  const [items, setItems] = useState<T[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Loads all items for the trip
   * Called automatically on mount and after CRUD operations
   */
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await service.getByTrip(tripId);
      setItems(data);
    } catch (error) {
      console.error(`Failed to load ${itemName}s:`, error);
      toast.error(`Failed to load ${itemName}s`);
    } finally {
      setLoading(false);
    }
  }, [tripId, service, itemName]);

  /**
   * Creates a new item
   * @returns the created item, or null on failure
   */
  const handleCreateItem = useCallback(
    async (data: TCreateData): Promise<T | null> => {
      try {
        const created = await service.create(data);
        toast.success(`${capitalize(itemName)} added successfully`);
        await loadItems();
        onUpdate?.();
        return created;
      } catch (error) {
        console.error(`Failed to create ${itemName}:`, error);
        toast.error(`Failed to add ${itemName}`);
        return null;
      }
    },
    [service, loadItems, onUpdate, itemName]
  );

  /**
   * Creates a new item
   * @returns true if successful, false otherwise
   */
  const handleCreate = useCallback(
    async (data: TCreateData): Promise<boolean> => (await handleCreateItem(data)) !== null,
    [handleCreateItem]
  );

  /**
   * Updates an existing item
   * @returns true if successful, false otherwise
   */
  const handleUpdate = useCallback(
    async (id: number, data: TUpdateData): Promise<boolean> => {
      try {
        await service.update(id, data);
        toast.success(`${capitalize(itemName)} updated successfully`);
        await loadItems();
        onUpdate?.();
        return true;
      } catch (error) {
        console.error(`Failed to update ${itemName}:`, error);
        toast.error(`Failed to update ${itemName}`);
        return false;
      }
    },
    [service, loadItems, onUpdate, itemName]
  );

  /**
   * Deletes an item (without confirmation - use with ConfirmDialog)
   * @returns true if successful, false otherwise
   */
  const handleDelete = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await service.delete(id);
        toast.success(`${capitalize(itemName)} deleted successfully`);
        await loadItems();
        onUpdate?.();
        return true;
      } catch (error) {
        console.error(`Failed to delete ${itemName}:`, error);
        toast.error(`Failed to delete ${itemName}`);
        return false;
      }
    },
    [service, loadItems, onUpdate, itemName]
  );

  /**
   * Gets the default confirmation message for deleting an item
   * Use with ConfirmDialog for consistent messaging
   */
  const getDeleteConfirmation = useCallback(() => ({
    title: `Delete ${capitalize(itemName)}`,
    message: `Are you sure you want to delete this ${itemName}? This action cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger' as const,
  }), [itemName]);

  /**
   * Opens the form in create mode
   */
  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setShowForm(true);
  }, []);

  /**
   * Opens the form in edit mode for a specific item
   */
  const openEditForm = useCallback((id: number) => {
    setEditingId(id);
    setShowForm(true);
  }, []);

  /**
   * Closes the form and resets editing state
   */
  const closeForm = useCallback(() => {
    setEditingId(null);
    setShowForm(false);
  }, []);

  /**
   * Toggles form visibility
   * If closing, resets editing state
   */
  const toggleForm = useCallback(() => {
    if (showForm) {
      setEditingId(null);
    }
    setShowForm(!showForm);
  }, [showForm]);

  // Load items on mount or when tripId changes
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return {
    // State
    items,
    showForm,
    editingId,
    loading,
    isEditing: editingId !== null,

    // Data operations
    loadItems,
    handleCreate,
    handleCreateItem,
    handleUpdate,
    handleDelete,

    // Confirmation helpers
    getDeleteConfirmation,

    // Form controls
    openCreateForm,
    openEditForm,
    closeForm,
    toggleForm,

    // Setters (for advanced use cases)
    setItems,
    setShowForm,
    setEditingId,
  };
}