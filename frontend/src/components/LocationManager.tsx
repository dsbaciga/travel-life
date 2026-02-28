import { useState, useEffect, useMemo, useCallback } from "react";
import type { Location, CreateLocationInput, UpdateLocationInput, LocationCategory } from "../types/location";
import locationService from "../services/location.service";
import toast from "react-hot-toast";
import LinkButton from "./LinkButton";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import FormModal from "./FormModal";
import FormSection from "./FormSection";
import LocationDisplay from "./LocationDisplay";
import PhotoPreviewPopover from "./timeline/PhotoPreviewPopover";
import LinkPanel from "./LinkPanel";
import DraftIndicator from "./DraftIndicator";
import DraftRestorePrompt from "./DraftRestorePrompt";
import { useFormFields } from "../hooks/useFormFields";
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useEditFromUrlParam } from "../hooks/useEditFromUrlParam";
import { useEntityLinking } from "../hooks/useEntityLinking";
import { useAutoSaveDraft } from "../hooks/useAutoSaveDraft";
import { useBulkSelection } from "../hooks/useBulkSelection";
import EmptyState, { EmptyIllustrations } from "./EmptyState";
import { ListItemSkeleton } from "./SkeletonLoader";
import LocationSearchMap from "./LocationSearchMap";
import TripLocationsMap from "./TripLocationsMap";
import BulkActionBar from "./BulkActionBar";
import BulkEditModal from "./BulkEditModal";
import MarkdownRenderer from "./MarkdownRenderer";
import MarkdownEditor from "./MarkdownEditor";
import { stripMarkdown } from "../utils/stripMarkdown";

/**
 * LocationManager handles CRUD operations for trip locations (points of interest).
 * Supports hierarchical locations (parent-child relationships), geocoding via
 * interactive map search, custom categories, and entity linking.
 *
 * Features:
 * - Interactive map-based location search and selection
 * - Geocoding integration with Nominatim
 * - Hierarchical location organization (e.g., "Paris" > "Eiffel Tower")
 * - Custom location categories with icons
 * - Photo preview popover showing linked photos
 * - Entity linking to photos, activities, etc.
 * - Trip locations map visualization
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip
 * @param props.tripTimezone - Timezone for the trip (kept for API compatibility)
 * @param props.onUpdate - Callback triggered after CRUD operations to refresh parent data
 *
 * @example
 * ```tsx
 * <LocationManager
 *   tripId={123}
 *   tripTimezone="Europe/Paris"
 *   onUpdate={() => refetchTrip()}
 * />
 * ```
 */
interface LocationManagerProps {
  tripId: number;
  tripTimezone?: string | null;
  onUpdate?: () => void;
}

interface LocationFormFields {
  name: string;
  address: string;
  notes: string;
  latitude: number | undefined;
  longitude: number | undefined;
  parentId: number | null | undefined;
  categoryId: number | undefined;
}

const initialFormState: LocationFormFields = {
  name: "",
  address: "",
  notes: "",
  latitude: undefined,
  longitude: undefined,
  parentId: undefined,
  categoryId: undefined,
};

export default function LocationManager({
  tripId,
  onUpdate,
}: LocationManagerProps) {
  // Service adapter for useManagerCRUD hook (memoized to prevent infinite loops)
  const locationServiceAdapter = useMemo(() => ({
    getByTrip: locationService.getLocationsByTrip,
    create: locationService.createLocation,
    update: locationService.updateLocation,
    delete: locationService.deleteLocation,
  }), []);

  // Initialize CRUD hook
  const manager = useManagerCRUD<Location, CreateLocationInput, UpdateLocationInput>(locationServiceAdapter, tripId, {
    itemName: "location",
    onUpdate,
  });

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);
  const { openLinkPanel, closeLinkPanel, linkingEntityId, showLinkPanel } = useEntityLinking({
    entityType: 'LOCATION',
    tripId,
  });

  const [categories, setCategories] = useState<LocationCategory[]>([]);
  const [keepFormOpenAfterSave, setKeepFormOpenAfterSave] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Bulk selection state
  const bulkSelection = useBulkSelection<Location>();
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);

  const { values, handleChange, reset, setAllFields } =
    useFormFields<LocationFormFields>(initialFormState);

  // Auto-save draft for form data
  const draftKey = manager.editingId ? manager.editingId : tripId;
  const draft = useAutoSaveDraft(values, {
    entityType: 'location',
    id: draftKey,
    isEditMode: !!manager.editingId,
    tripId,
    defaultValues: initialFormState,
    enabled: manager.showForm,
  });

  // Check for existing draft when form opens in create mode
  // Use initialDraftExists to only show prompt for drafts from previous sessions
  useEffect(() => {
    if (manager.showForm && !manager.editingId && draft.initialDraftExists) {
      setShowDraftPrompt(true);
    }
  }, [manager.showForm, manager.editingId, draft.initialDraftExists]);

  // Handle draft restore
  const handleRestoreDraft = useCallback(() => {
    const restoredData = draft.restoreDraft();
    if (restoredData) {
      setAllFields(restoredData);
    }
    setShowDraftPrompt(false);
  }, [draft, setAllFields]);

  // Handle draft discard
  const handleDiscardDraft = useCallback(() => {
    draft.clearDraft();
    setShowDraftPrompt(false);
  }, [draft]);

  // Destructure stable method for dependency array
  const { openEditForm } = manager;

  // Stable callback for URL-based edit navigation
  const handleEditFromUrl = useCallback((location: Location) => {
    handleChange("name", location.name);
    handleChange("address", location.address || "");
    handleChange("notes", location.notes || "");
    handleChange("latitude", location.latitude || undefined);
    handleChange("longitude", location.longitude || undefined);
    handleChange("parentId", location.parentId ?? null);
    handleChange("categoryId", location.categoryId || undefined);
    openEditForm(location.id);
  }, [handleChange, openEditForm]);

  // Handle URL-based edit navigation (e.g., from EntityDetailModal)
  useEditFromUrlParam(manager.items, handleEditFromUrl, {
    loading: manager.loading,
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const cats = await locationService.getCategories();
      setCategories(cats);
    } catch {
      console.error("Failed to load location categories");
    }
  };

  const resetForm = useCallback(() => {
    reset();
    manager.setEditingId(null);
    setKeepFormOpenAfterSave(false);
    setShowDraftPrompt(false);
    draft.clearDraft();
  }, [reset, manager, draft]);

  const handleLocationSelect = (data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => {
    handleChange("name", data.name);
    handleChange("address", data.address);
    handleChange("latitude", data.latitude);
    handleChange("longitude", data.longitude);
  };

  const handleEdit = (location: Location) => {
    handleChange("name", location.name);
    handleChange("address", location.address || "");
    handleChange("notes", location.notes || "");
    handleChange("latitude", location.latitude || undefined);
    handleChange("longitude", location.longitude || undefined);
    handleChange("parentId", location.parentId ?? null);
    handleChange("categoryId", location.categoryId || undefined);
    manager.openEditForm(location.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!values.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (manager.editingId) {
      // For updates, send null to clear empty fields
      const updateData = {
        name: values.name,
        address: values.address || undefined,
        notes: values.notes || undefined,
        latitude: values.latitude,
        longitude: values.longitude,
        parentId: values.parentId,
        categoryId: values.categoryId,
      };
      const success = await manager.handleUpdate(manager.editingId, updateData);
      if (success) {
        resetForm();
        manager.closeForm();
      }
    } else {
      // For creates, use undefined to omit optional fields
      const createData = {
        tripId,
        name: values.name,
        address: values.address || undefined,
        notes: values.notes || undefined,
        latitude: values.latitude,
        longitude: values.longitude,
        parentId: values.parentId,
        categoryId: values.categoryId,
      };
      const success = await manager.handleCreate(createData);
      if (success) {
        if (keepFormOpenAfterSave) {
          // Reset form but keep modal open for quick successive entries
          reset();
          setKeepFormOpenAfterSave(false);
          // Focus first input for quick data entry
          setTimeout(() => {
            const firstInput = document.querySelector<HTMLInputElement>('#location-name');
            firstInput?.focus();
          }, 50);
        } else {
          // Standard flow: reset and close
          resetForm();
          manager.closeForm();
        }
      }
    }
  };

  const handleDelete = async (id: number) => {
    const location = manager.items.find(l => l.id === id);
    const hasChildren = manager.items.some(l => l.parentId === id);

    const confirmed = await confirm({
      title: "Delete Location",
      message: hasChildren
        ? `Delete "${location?.name}" and all its child locations? This action cannot be undone.`
        : `Delete "${location?.name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    await manager.handleDelete(id);
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    const selectedIds = bulkSelection.getSelectedIds();
    if (selectedIds.length === 0) return;

    const confirmed = await confirm({
      title: "Delete Locations",
      message: `Delete ${selectedIds.length} selected locations? This action cannot be undone.`,
      confirmLabel: "Delete All",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      await locationService.bulkDeleteLocations(tripId, selectedIds);
      toast.success(`Deleted ${selectedIds.length} locations`);
      bulkSelection.exitSelectionMode();
      await manager.loadItems();
      onUpdate?.();
    } catch (error) {
      console.error("Failed to bulk delete locations:", error);
      toast.error("Failed to delete some locations");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Bulk edit handler
  const handleBulkEdit = async (updates: Record<string, unknown>) => {
    const selectedIds = bulkSelection.getSelectedIds();
    if (selectedIds.length === 0) return;

    setIsBulkEditing(true);
    try {
      await locationService.bulkUpdateLocations(tripId, selectedIds, updates as { categoryId?: number; notes?: string });
      toast.success(`Updated ${selectedIds.length} locations`);
      setShowBulkEditModal(false);
      bulkSelection.exitSelectionMode();
      await manager.loadItems();
      onUpdate?.();
    } catch (error) {
      console.error("Failed to bulk update locations:", error);
      toast.error("Failed to update some locations");
    } finally {
      setIsBulkEditing(false);
    }
  };

  // Build bulk edit field options
  const bulkEditFields = useMemo(() => [
    {
      key: "categoryId",
      label: "Category",
      type: "select" as const,
      options: categories.map(cat => ({ value: String(cat.id), label: `${cat.icon || ''} ${cat.name}`.trim() })),
    },
    {
      key: "notes",
      label: "Notes",
      type: "textarea" as const,
      placeholder: "Add notes to all selected locations\u2026",
    },
  ], [categories]);

  const handleCloseForm = () => {
    resetForm();
    manager.closeForm();
  };

  // Get top-level locations (no parent)
  const topLevelLocations = manager.items.filter((loc) => !loc.parentId);

  // Get children for a parent location
  const getChildren = (parentId: number) => {
    return manager.items.filter((loc) => loc.parentId === parentId);
  };

  const renderLocation = (location: Location, isChild = false, index = 0) => {
    const children = getChildren(location.id);
    const isSelected = bulkSelection.isSelected(location.id);

    return (
      <div key={location.id} className={isChild ? "" : "space-y-2"}>
        <div
          data-entity-id={`location-${location.id}`}
          role={bulkSelection.selectionMode && !isChild ? "button" : undefined}
          tabIndex={bulkSelection.selectionMode && !isChild ? 0 : undefined}
          onClick={bulkSelection.selectionMode && !isChild ? (e) => {
            e.stopPropagation();
            bulkSelection.toggleItemSelection(location.id, index, e.shiftKey, topLevelLocations);
          } : undefined}
          onKeyDown={bulkSelection.selectionMode && !isChild ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bulkSelection.toggleItemSelection(location.id, index, false, topLevelLocations); } } : undefined}
          className={`border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow ${
            isChild
              ? "bg-gray-50 dark:bg-gray-700"
              : "bg-white dark:bg-gray-800"
          } ${bulkSelection.selectionMode && !isChild ? "cursor-pointer" : ""} ${isSelected && !isChild ? "ring-2 ring-primary-500 dark:ring-primary-400" : ""}`}
        >
          {/* Header row: Title + badge on mobile, with actions on larger screens */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              {/* Title row with hierarchical display */}
              <div className="flex items-start gap-2 flex-wrap">
                {/* Selection checkbox */}
                {bulkSelection.selectionMode && !isChild && (
                  <div className="flex items-center justify-center w-6 h-6 mr-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Selection handled by onClick to support shiftKey
                      onClick={(e) => {
                        e.stopPropagation();
                        bulkSelection.toggleItemSelection(location.id, index, e.shiftKey, topLevelLocations);
                      }}
                      aria-label="Select location"
                      className="w-5 h-5 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
                    />
                  </div>
                )}
                {isChild && (
                  <span className="text-gray-400 dark:text-gray-500 mt-0.5">
                    {String.fromCharCode(8627)}
                  </span>
                )}
                <div className={isChild ? "ml-0" : ""}>
                  <LocationDisplay
                    name={location.name}
                    address={location.address}
                    compact={isChild}
                    showFullAddress={!isChild}
                    className={isChild ? "text-base" : ""}
                  />
                </div>
                {!isChild && children.length > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded whitespace-nowrap flex-shrink-0">
                    {children.length} {children.length === 1 ? "place" : "places"}
                  </span>
                )}
              </div>
              {location.notes && (
                <>
                  <p
                    className={`text-gray-700 dark:text-gray-300 text-sm mt-2 line-clamp-2 sm:hidden ${
                      isChild ? "ml-6" : ""
                    }`}
                  >
                    {stripMarkdown(location.notes)}
                  </p>
                  <div
                    className={`text-gray-700 dark:text-gray-300 text-sm mt-2 hidden sm:block ${
                      isChild ? "ml-6" : ""
                    }`}
                  >
                    <MarkdownRenderer content={location.notes} compact />
                  </div>
                </>
              )}
              {location.category && (
                <span
                  className={`inline-block mt-2 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 rounded ${
                    isChild ? "ml-6" : ""
                  }`}
                >
                  {location.category.icon && `${location.category.icon} `}
                  {location.category.name}
                </span>
              )}
            </div>

            {/* Action buttons - own row on mobile, inline on larger screens */}
            <div className="flex gap-2 items-center flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-600">
              {/* Photo preview badge with popover */}
              {(() => {
                const linkSummary = getLinkSummary("LOCATION", location.id);
                const photoCount = linkSummary?.linkCounts?.PHOTO || 0;
                if (photoCount > 0) {
                  return (
                    <PhotoPreviewPopover
                      tripId={tripId}
                      entityType="LOCATION"
                      entityId={location.id}
                      photoCount={photoCount}
                      onViewAll={() => openLinkPanel(location.id)}
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {photoCount}
                      </span>
                    </PhotoPreviewPopover>
                  );
                }
                return null;
              })()}
              <LinkButton
                tripId={tripId}
                entityType="LOCATION"
                entityId={location.id}
                linkSummary={getLinkSummary("LOCATION", location.id)}
                onUpdate={invalidateLinkSummary}
                size="sm"
              />
              <button
                onClick={() => handleEdit(location)}
                className="px-2.5 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 whitespace-nowrap"
                aria-label={`Edit location ${location.name}`}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(location.id)}
                className="px-2.5 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 whitespace-nowrap"
                aria-label={`Delete location ${location.name}`}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Linked Entities */}
          <LinkedEntitiesDisplay
            tripId={tripId}
            entityType="LOCATION"
            entityId={location.id}
            compact
          />
        </div>

        {/* Render children - less indent on mobile */}
        {!isChild && children.length > 0 && (
          <div className="ml-4 sm:ml-8 space-y-2">
            {children.map((child) => renderLocation(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <ConfirmDialogComponent />
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Locations
        </h2>
        <div className="flex items-center gap-2">
          {topLevelLocations.length > 0 && !bulkSelection.selectionMode && (
            <button
              onClick={bulkSelection.enterSelectionMode}
              className="btn btn-secondary text-sm whitespace-nowrap"
            >
              Select
            </button>
          )}
          {!bulkSelection.selectionMode && (
            <button
              onClick={() => {
                resetForm();
                manager.toggleForm();
              }}
              className="btn btn-primary text-sm sm:text-base whitespace-nowrap"
            >
              <span className="sm:hidden">+ Add</span>
              <span className="hidden sm:inline">+ Add Location</span>
            </button>
          )}
        </div>
      </div>

      {/* Form Modal */}
      <FormModal
        isOpen={manager.showForm}
        onClose={handleCloseForm}
        title={manager.editingId ? "Edit Location" : "Add Location"}
        icon="📍"
        maxWidth="2xl"
        formId="location-form"
        footer={
          <div className="flex items-center justify-between w-full gap-4">
            <DraftIndicator
              isSaving={draft.isSaving}
              lastSavedAt={draft.lastSavedAt}
              show={draft.hasDraft && !manager.editingId}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCloseForm}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              {!manager.editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setKeepFormOpenAfterSave(true);
                    (document.getElementById('location-form') as HTMLFormElement)?.requestSubmit();
                  }}
                  className="btn btn-secondary text-sm whitespace-nowrap hidden sm:block"
                >
                  Save & Add Another
                </button>
              )}
              <button
                type="submit"
                form="location-form"
                className="btn btn-primary"
              >
                {manager.editingId ? "Update" : "Add"} Location
              </button>
            </div>
          </div>
        }
      >
        {/* Draft Restore Prompt */}
        <DraftRestorePrompt
          isOpen={showDraftPrompt && !manager.editingId}
          savedAt={draft.lastSavedAt}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
          entityType="location"
        />

        <form id="location-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Map Search Section */}
          <FormSection title="Search & Select Location" icon="🗺️">
            <LocationSearchMap
              onLocationSelect={handleLocationSelect}
              initialPosition={
                values.latitude && values.longitude
                  ? { lat: values.latitude, lng: values.longitude }
                  : undefined
              }
            />
          </FormSection>

          {/* Basic Info Section */}
          <FormSection title="Location Details" icon="📍">
            <div>
              <label
                htmlFor="location-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Location Name *
              </label>
              <input
                type="text"
                id="location-name"
                name="name"
                autoComplete="off"
                value={values.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="input"
                required
                placeholder="Eiffel Tower"
              />
            </div>

            {/* Parent Location - only show if this location doesn't have children */}
            {(() => {
              const editingLocationHasChildren = manager.editingId
                ? manager.items.some((loc) => loc.parentId === manager.editingId)
                : false;

              return (
                <div>
                  <label
                    htmlFor="location-parent"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Parent Location (City/Region)
                  </label>
                  {editingLocationHasChildren ? (
                    <>
                      <input
                        id="location-parent"
                        type="text"
                        className="input bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                        value="Cannot set parent - this location has children"
                        disabled
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Remove child locations first to make this a child of another location
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        id="location-parent"
                        name="parent"
                        autoComplete="off"
                        value={values.parentId || ""}
                        onChange={(e) =>
                          handleChange(
                            "parentId",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        className="input"
                      >
                        <option value="">None (Top-level location)</option>
                        {manager.items
                          .filter((loc) => loc.id !== manager.editingId && !loc.parentId)
                          .map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Group places by selecting a parent city or region
                      </p>
                    </>
                  )}
                </div>
              );
            })()}

            <div>
              <label
                htmlFor="location-address"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Address
              </label>
              <input
                type="text"
                id="location-address"
                name="address"
                autoComplete="off"
                value={values.address}
                onChange={(e) => handleChange("address", e.target.value)}
                className="input"
                placeholder="Paris, France"
              />
            </div>

            {categories.length > 0 && (
              <div>
                <label
                  htmlFor="location-category"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Category
                </label>
                <select
                  id="location-category"
                  name="category"
                  autoComplete="off"
                  value={values.categoryId || ""}
                  onChange={(e) =>
                    handleChange(
                      "categoryId",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  className="input"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon && `${cat.icon} `}
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <MarkdownEditor
              value={values.notes}
              onChange={(val) => handleChange("notes", val)}
              rows={2}
              placeholder="Additional notes\u2026"
              label="Notes"
              compact
            />
          </FormSection>
        </form>
      </FormModal>

      {/* Locations List */}
      <div className="space-y-4">
        {manager.loading ? (
          <ListItemSkeleton count={3} />
        ) : manager.items.length === 0 ? (
          <EmptyState
            icon={<EmptyIllustrations.NoLocations />}
            message="Pin Your Destinations"
            subMessage="Mark the places that matter - from iconic landmarks and hidden gems to cozy cafes and stunning viewpoints. Build your personal map of memories."
            actionLabel="Add Your First Location"
            onAction={() => {
              resetForm();
              manager.toggleForm();
            }}
          />
        ) : (
          topLevelLocations.map((location, index) => renderLocation(location, false, index))
        )}
      </div>

      {/* Locations Map */}
      {manager.items.length > 0 && (
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <TripLocationsMap locations={manager.items} />
        </div>
      )}

      {/* Link Panel for viewing all photos */}
      {showLinkPanel && linkingEntityId && (
        <LinkPanel
          tripId={tripId}
          entityType="LOCATION"
          entityId={linkingEntityId}
          onClose={closeLinkPanel}
          onUpdate={invalidateLinkSummary}
        />
      )}

      {/* Bulk Action Bar */}
      {bulkSelection.selectionMode && (
        <BulkActionBar
          entityType="location"
          selectedCount={bulkSelection.selectedCount}
          totalCount={topLevelLocations.length}
          onSelectAll={() => bulkSelection.selectAll(topLevelLocations)}
          onDeselectAll={bulkSelection.deselectAll}
          onExitSelectionMode={bulkSelection.exitSelectionMode}
          onBulkDelete={handleBulkDelete}
          onBulkEdit={() => setShowBulkEditModal(true)}
          isDeleting={isBulkDeleting}
          isEditing={isBulkEditing}
        />
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        entityType="location"
        selectedCount={bulkSelection.selectedCount}
        fields={bulkEditFields}
        onSubmit={handleBulkEdit}
        isSubmitting={isBulkEditing}
      />
    </div>
  );
}
