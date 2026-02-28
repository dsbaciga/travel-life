import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import type {
  Transportation,
  TransportationType,
  CreateTransportationInput,
  UpdateTransportationInput,
} from "../types/transportation";
import type { Location } from "../types/location";
import type { EntityType, EntityLinkSummary } from "../types/entityLink";
import transportationService from "../services/transportation.service";
import LinkButton from "./LinkButton";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import FormModal from "./FormModal";
import FormSection, { CollapsibleSection } from "./FormSection";
import DraftIndicator from "./DraftIndicator";
import DraftRestorePrompt from "./DraftRestorePrompt";
import { formatDateTimeInTimezone, convertISOToDateTimeLocal, convertDateTimeLocalToISO } from "../utils/timezone";
import { useFormFields } from "../hooks/useFormFields";
import { useFormReset } from "../hooks/useFormReset";
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useEditFromUrlParam } from "../hooks/useEditFromUrlParam";
import { useAutoSaveDraft } from "../hooks/useAutoSaveDraft";
import { useBulkSelection } from "../hooks/useBulkSelection";
import EmptyState, { EmptyIllustrations } from "./EmptyState";
import TimezoneSelect from "./TimezoneSelect";
import CostCurrencyFields from "./CostCurrencyFields";
import BookingFields from "./BookingFields";
import FlightRouteMap from "./FlightRouteMap";
import TransportationStats from "./TransportationStats";
import LocationQuickAdd from "./LocationQuickAdd";
import BulkActionBar from "./BulkActionBar";
import BulkEditModal from "./BulkEditModal";
import { getLastUsedCurrency, saveLastUsedCurrency } from "../utils/currencyStorage";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
import MarkdownRenderer from "./MarkdownRenderer";
import MarkdownEditor from "./MarkdownEditor";
import { stripMarkdown } from "../utils/stripMarkdown";

/**
 * TransportationManager handles CRUD operations for trip transportation segments.
 * Supports flights, trains, buses, cars, ferries, bicycles, and walking routes.
 *
 * Features:
 * - Dual timezone support for departure/arrival times
 * - Route visualization with FlightRouteMap component
 * - Connection chaining (auto-fills next departure from previous arrival)
 * - Status badges (Upcoming, In Progress, Completed)
 * - Sorting by date or type
 * - Filtering by scheduled/unscheduled
 * - Entity linking to photos, locations, etc.
 * - Quick-add location creation
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip
 * @param props.locations - Array of trip locations for from/to selection
 * @param props.tripTimezone - Default timezone for the trip (used when no specific timezone set)
 * @param props.tripStartDate - Trip start date for default form values
 * @param props.onUpdate - Callback triggered after CRUD operations to refresh parent data
 *
 * @example
 * ```tsx
 * <TransportationManager
 *   tripId={123}
 *   locations={tripLocations}
 *   tripTimezone="Europe/Paris"
 *   tripStartDate="2024-06-01"
 *   onUpdate={() => refetchTrip()}
 * />
 * ```
 */
interface TransportationManagerProps {
  tripId: number;
  locations: Location[];
  tripTimezone?: string | null;
  tripStartDate?: string | null;
  onUpdate?: () => void;
}

interface TransportationFormFields {
  type: TransportationType;
  fromLocationId: number | undefined;
  toLocationId: number | undefined;
  fromLocationName: string;
  toLocationName: string;
  departureTime: string;
  arrivalTime: string;
  startTimezone: string;
  endTimezone: string;
  carrier: string;
  vehicleNumber: string;
  confirmationNumber: string;
  cost: string;
  currency: string;
  notes: string;
}

const initialFormState: TransportationFormFields = {
  type: "flight",
  fromLocationId: undefined,
  toLocationId: undefined,
  fromLocationName: "",
  toLocationName: "",
  departureTime: "",
  arrivalTime: "",
  startTimezone: "",
  endTimezone: "",
  carrier: "",
  vehicleNumber: "",
  confirmationNumber: "",
  cost: "",
  currency: "USD",
  notes: "",
};

type FilterTab = "all" | "upcoming" | "historical";
type SortBy = "date" | "type";

interface TransportationItemProps {
  transportation: Transportation;
  tripId: number;
  getTypeIcon: (type: TransportationType) => string;
  getStatusBadge: (transportation: Transportation) => React.ReactNode;
  getLocationDisplay: (
    location: { name: string } | null | undefined,
    locationName: string | null | undefined,
    locationId: number | null | undefined,
    transportType: string
  ) => string;
  formatDateTime: (dateTime: string | null, timezone?: string | null) => string;
  formatDuration: (minutes: number) => string;
  formatDistance: (kilometers: number | null | undefined) => string;
  getLinkSummary: (entityType: EntityType, entityId: number) => EntityLinkSummary | undefined;
  invalidateLinkSummary: () => void;
  onEdit: (transportation: Transportation) => void;
  onDelete: (id: number) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: number, index: number, shiftKey: boolean) => void;
  index?: number;
}

function TransportationItem({
  transportation,
  tripId,
  getTypeIcon,
  getStatusBadge,
  getLocationDisplay,
  formatDateTime,
  formatDuration,
  formatDistance,
  getLinkSummary,
  invalidateLinkSummary,
  onEdit,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelection,
  index = 0,
}: TransportationItemProps) {
  return (
    <div
      data-entity-id={`transportation-${transportation.id}`}
      role={selectionMode ? "button" : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      onKeyDown={selectionMode ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelection?.(transportation.id, index, false); } } : undefined}
      onClick={selectionMode ? (e) => {
        e.stopPropagation();
        onToggleSelection?.(transportation.id, index, e.shiftKey);
      } : undefined}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-3 sm:p-6 hover:shadow-md transition-shadow ${selectionMode ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-primary-500 dark:ring-primary-400" : ""}`}
    >
      {/* Route Map - Show for all transportation with route data */}
      {transportation.route && (
        <div className="mb-3 sm:mb-4 -mx-3 sm:mx-0 -mt-3 sm:mt-0">
          <FlightRouteMap
            route={transportation.route}
            height="200px"
            transportationType={transportation.type as "flight" | "train" | "bus" | "car" | "ferry" | "bicycle" | "walk" | "other"}
          />
        </div>
      )}

      {/* Header with icon, type, carrier, and status */}
      <div className="flex items-start gap-2 mb-3 flex-wrap">
        {/* Selection checkbox */}
        {selectionMode && (
          <div className="flex items-center justify-center w-6 h-6 mr-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // Selection handled by onClick to support shiftKey
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection?.(transportation.id, index, e.shiftKey);
              }}
              aria-label="Select transportation"
              className="w-5 h-5 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
            />
          </div>
        )}
        <span className="text-xl sm:text-2xl">
          {getTypeIcon(transportation.type)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {transportation.type}
            </h3>
            {transportation.carrier && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                - {transportation.carrier}
              </span>
            )}
            {transportation.vehicleNumber && (
              <span className="text-xs text-gray-500 dark:text-gray-500">
                #{transportation.vehicleNumber}
              </span>
            )}
          </div>
          <div className="mt-1">
            {getStatusBadge(transportation)}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5 sm:space-y-2 text-sm text-gray-700 dark:text-gray-300">
        {/* Route */}
        <div className="flex flex-wrap gap-x-2">
          <span className="font-medium">Route:</span>
          <span>
            {getLocationDisplay(
              transportation.fromLocation,
              transportation.fromLocationName,
              transportation.fromLocationId,
              transportation.type
            )}{" "}
            →{" "}
            {getLocationDisplay(
              transportation.toLocation,
              transportation.toLocationName,
              transportation.toLocationId,
              transportation.type
            )}
          </span>
        </div>

        {/* Departure */}
        {transportation.departureTime && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Departure:</span>
            <span>
              {formatDateTime(
                transportation.departureTime,
                transportation.startTimezone
              )}
            </span>
          </div>
        )}

        {/* Arrival */}
        {transportation.arrivalTime && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Arrival:</span>
            <span>
              {formatDateTime(
                transportation.arrivalTime,
                transportation.endTimezone
              )}
            </span>
          </div>
        )}

        {/* Duration */}
        {transportation.durationMinutes && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Duration:</span>
            <span>{formatDuration(transportation.durationMinutes)}</span>
          </div>
        )}

        {/* Distance */}
        {transportation.calculatedDistance && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Distance:</span>
            <span>{formatDistance(transportation.calculatedDistance)}</span>
          </div>
        )}

        {/* Flight Tracking Info */}
        {transportation.flightTracking && (
          <>
            {transportation.flightTracking.gate && (
              <div className="flex flex-wrap gap-x-2">
                <span className="font-medium">Gate:</span>
                <span>{transportation.flightTracking.gate}</span>
              </div>
            )}
            {transportation.flightTracking.terminal && (
              <div className="flex flex-wrap gap-x-2">
                <span className="font-medium">Terminal:</span>
                <span>{transportation.flightTracking.terminal}</span>
              </div>
            )}
            {transportation.flightTracking.baggageClaim && (
              <div className="flex flex-wrap gap-x-2">
                <span className="font-medium">Baggage:</span>
                <span>{transportation.flightTracking.baggageClaim}</span>
              </div>
            )}
          </>
        )}

        {/* Confirmation Number */}
        {transportation.confirmationNumber && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Confirmation:</span>
            <span>{transportation.confirmationNumber}</span>
          </div>
        )}

        {/* Cost */}
        {transportation.cost && (
          <div className="flex flex-wrap gap-x-2">
            <span className="font-medium">Cost:</span>
            <span>
              {transportation.currency} {transportation.cost}
            </span>
          </div>
        )}

        {/* Notes */}
        {transportation.notes && (
          <div className="mt-2">
            <span className="font-medium">Notes:</span>
            <p className="text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 sm:hidden">
              {stripMarkdown(transportation.notes)}
            </p>
            <div className="text-gray-600 dark:text-gray-400 mt-1 hidden sm:block">
              <MarkdownRenderer content={transportation.notes} compact />
            </div>
          </div>
        )}
      </div>

      {/* Linked Entities */}
      <LinkedEntitiesDisplay
        tripId={tripId}
        entityType="TRANSPORTATION"
        entityId={transportation.id}
        compact
      />

      {/* Actions - bottom row */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <LinkButton
          tripId={tripId}
          entityType="TRANSPORTATION"
          entityId={transportation.id}
          linkSummary={getLinkSummary('TRANSPORTATION', transportation.id)}
          onUpdate={invalidateLinkSummary}
          size="sm"
        />
        <div className="flex-1" />
        <button
          onClick={() => onEdit(transportation)}
          className="px-2.5 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 whitespace-nowrap"
          aria-label={`Edit ${transportation.type} transportation`}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(transportation.id)}
          className="px-2.5 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 whitespace-nowrap"
          aria-label={`Delete ${transportation.type} transportation`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function TransportationManager({
  tripId,
  locations,
  tripTimezone,
  tripStartDate,
  onUpdate,
}: TransportationManagerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");

  // Compute initial form state with trip start date as default
  const getInitialFormState = useMemo((): TransportationFormFields => {
    // Format as datetime-local (YYYY-MM-DDTHH:mm) - default to 09:00
    const defaultDateTime = tripStartDate
      ? `${tripStartDate.slice(0, 10)}T09:00`
      : "";
    return {
      ...initialFormState,
      departureTime: defaultDateTime,
      arrivalTime: defaultDateTime,
      currency: getLastUsedCurrency(), // Remember last-used currency
    };
  }, [tripStartDate]);

  // Service adapter for useManagerCRUD hook (memoized to prevent infinite loops)
  const transportationServiceAdapter = useMemo(() => ({
    getByTrip: transportationService.getTransportationByTrip,
    create: transportationService.createTransportation,
    update: transportationService.updateTransportation,
    delete: transportationService.deleteTransportation,
  }), []);

  // Initialize CRUD hook
  const manager = useManagerCRUD<Transportation, CreateTransportationInput, UpdateTransportationInput>(transportationServiceAdapter, tripId, {
    itemName: "transportation",
    onUpdate,
  });

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(tripId);

  const { values, handleChange, reset, setAllFields } =
    useFormFields<TransportationFormFields>(getInitialFormState);

  // Track unsaved changes for browser close/refresh warning
  const { captureInitialValues, isDirty: isFormDirty, markSaved } = useUnsavedChangesWarning(values, manager.showForm);

  // Create wrappers for useFormReset hook
  // TODO: Replace with useManagerFormWrapper hook
  const setShowForm = useCallback((show: boolean) => {
    if (show) {
      if (!manager.showForm) manager.toggleForm();
    } else {
      manager.closeForm();
    }
  }, [manager]);

  // Use useFormReset for consistent form state management
  const { resetForm: baseResetForm, openCreateForm: baseOpenCreateForm } = useFormReset({
    initialState: getInitialFormState,
    setFormData: setAllFields,
    setEditingId: manager.setEditingId,
    setShowForm,
  });

  const [showFromLocationQuickAdd, setShowFromLocationQuickAdd] = useState(false);
  const [showToLocationQuickAdd, setShowToLocationQuickAdd] = useState(false);
  const [localLocations, setLocalLocations] = useState<Location[]>(locations);
  const [keepFormOpenAfterSave, setKeepFormOpenAfterSave] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  // Bulk selection state
  const bulkSelection = useBulkSelection<Transportation>();
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);

  // Auto-save draft for form data
  const draftKey = manager.editingId ? manager.editingId : tripId;
  const draft = useAutoSaveDraft(values, {
    entityType: 'transportation',
    id: draftKey,
    isEditMode: !!manager.editingId,
    tripId,
    defaultValues: getInitialFormState,
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
      // Show more options if draft has data in optional fields
      if (restoredData.carrier || restoredData.vehicleNumber || restoredData.confirmationNumber ||
          restoredData.cost || restoredData.notes || restoredData.fromLocationName || restoredData.toLocationName) {
        setShowMoreOptions(true);
      }
    }
    setShowDraftPrompt(false);
  }, [draft, setAllFields]);

  // Handle draft discard
  const handleDiscardDraft = useCallback(() => {
    draft.clearDraft();
    setShowDraftPrompt(false);
  }, [draft]);

  // Capture initial form values for dirty tracking when form opens or switches mode.
  // Uses a microtask delay so handleChange calls from populate effects have settled.
  const prevFormOpenRef = useRef(false);
  const prevEditingIdRef = useRef<number | null>(null);
  useEffect(() => {
    const justOpened = manager.showForm && !prevFormOpenRef.current;
    const editingChanged = manager.editingId !== prevEditingIdRef.current;
    prevFormOpenRef.current = manager.showForm;
    prevEditingIdRef.current = manager.editingId;

    if (manager.showForm && (justOpened || editingChanged)) {
      const timer = setTimeout(() => captureInitialValues(values), 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager.showForm, manager.editingId, captureInitialValues]);

  // handleEdit must be defined before handleEditFromUrl since it's used as a dependency
  const handleEdit = useCallback((transportation: Transportation) => {
    setShowMoreOptions(true); // Always show all options when editing
    handleChange("type", transportation.type);
    handleChange("fromLocationId", transportation.fromLocationId || undefined);
    handleChange("toLocationId", transportation.toLocationId || undefined);
    handleChange("fromLocationName", transportation.fromLocationName || "");
    handleChange("toLocationName", transportation.toLocationName || "");

    // Convert stored UTC times to local times in their respective timezones
    const effectiveStartTz = transportation.startTimezone || tripTimezone || 'UTC';
    const effectiveEndTz = transportation.endTimezone || tripTimezone || 'UTC';

    handleChange(
      "departureTime",
      transportation.departureTime
        ? convertISOToDateTimeLocal(transportation.departureTime, effectiveStartTz)
        : ""
    );
    handleChange(
      "arrivalTime",
      transportation.arrivalTime
        ? convertISOToDateTimeLocal(transportation.arrivalTime, effectiveEndTz)
        : ""
    );
    handleChange("startTimezone", transportation.startTimezone || "");
    handleChange("endTimezone", transportation.endTimezone || "");
    handleChange("carrier", transportation.carrier || "");
    handleChange("vehicleNumber", transportation.vehicleNumber || "");
    handleChange("confirmationNumber", transportation.confirmationNumber || "");
    handleChange("cost", transportation.cost?.toString() || "");
    handleChange("currency", transportation.currency || "USD");
    handleChange("notes", transportation.notes || "");
    manager.openEditForm(transportation.id);
  }, [handleChange, tripTimezone, manager]);

  // Stable callback for URL-based edit navigation
  const handleEditFromUrl = useCallback((transportation: Transportation) => {
    handleEdit(transportation);
  }, [handleEdit]);

  // Handle URL-based edit navigation (e.g., from EntityDetailModal)
  useEditFromUrlParam(manager.items, handleEditFromUrl, {
    loading: manager.loading,
  });

  // Smart timezone inference: auto-populate timezones when locations are selected
  useEffect(() => {
    if (values.fromLocationId && !values.startTimezone && tripTimezone) {
      handleChange("startTimezone", tripTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.fromLocationId, tripTimezone]);

  useEffect(() => {
    if (values.toLocationId && !values.endTimezone && tripTimezone) {
      handleChange("endTimezone", tripTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.toLocationId, tripTimezone]);

  // Sync localLocations with locations prop
  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  // Auto-fill: Transportation Connection Chaining - next from location = previous to location
  useEffect(() => {
    // Only when creating (not editing) and form just opened
    if (!manager.editingId && manager.showForm && values.departureTime === getInitialFormState.departureTime) {
      // Find the most recent transportation (by arrival time)
      const sortedTransportation = [...manager.items]
        .filter(t => t.arrivalTime)
        .sort((a, b) => new Date(b.arrivalTime!).getTime() - new Date(a.arrivalTime!).getTime());

      if (sortedTransportation.length > 0) {
        const lastTransport = sortedTransportation[0];

        // Auto-fill from location with previous to location
        if (lastTransport.toLocationId && !values.fromLocationId) {
          handleChange('fromLocationId', lastTransport.toLocationId);
        } else if (lastTransport.toLocationName && !values.fromLocationName) {
          handleChange('fromLocationName', lastTransport.toLocationName);
        }

        // Auto-fill departure time = arrival time + 2 hours (layover buffer)
        if (lastTransport.arrivalTime) {
          const effectiveTz = lastTransport.endTimezone || tripTimezone || 'UTC';
          const arrivalDateTime = convertISOToDateTimeLocal(lastTransport.arrivalTime, effectiveTz);

          // Add 2 hours for connection/layover
          const arrivalDate = new Date(arrivalDateTime);
          arrivalDate.setHours(arrivalDate.getHours() + 2);

          // Format as datetime-local
          const departureDateTime = arrivalDate.toISOString().slice(0, 16).replace('T', 'T');
          handleChange('departureTime', departureDateTime);

          // Inherit start timezone
          if (lastTransport.endTimezone && !values.startTimezone) {
            handleChange('startTimezone', lastTransport.endTimezone);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager.showForm, manager.editingId]);

  // Sort function
  const sortItems = useCallback((items: Transportation[]) => {
    if (sortBy === "type") {
      return [...items].sort((a, b) => {
        if (a.type === b.type) {
          // Secondary sort by departure time
          const dateA = a.departureTime ? new Date(a.departureTime).getTime() : Infinity;
          const dateB = b.departureTime ? new Date(b.departureTime).getTime() : Infinity;
          return dateA - dateB;
        }
        return a.type.localeCompare(b.type);
      });
    }
    // Default: sort by departure time
    return [...items].sort((a, b) => {
      const dateA = a.departureTime ? new Date(a.departureTime).getTime() : Infinity;
      const dateB = b.departureTime ? new Date(b.departureTime).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [sortBy]);

  // Split into scheduled (has departure time) and unscheduled
  const scheduledItems = useMemo(() => {
    return manager.items.filter((t) => t.departureTime);
  }, [manager.items]);

  const unscheduledItems = useMemo(() => {
    return manager.items.filter((t) => !t.departureTime);
  }, [manager.items]);

  // Filter scheduled transportation based on active tab
  const filteredScheduledItems = useMemo(() => {
    if (activeTab === "all") return sortItems(scheduledItems);
    if (activeTab === "upcoming") {
      return sortItems(scheduledItems.filter((t) => t.isUpcoming));
    }
    if (activeTab === "historical") {
      return sortItems(scheduledItems.filter((t) => !t.isUpcoming));
    }
    return sortItems(scheduledItems);
  }, [scheduledItems, activeTab, sortItems]);

  // Sorted unscheduled items
  const sortedUnscheduledItems = useMemo(() => {
    return sortItems(unscheduledItems);
  }, [unscheduledItems, sortItems]);

  // Calculate counts for tab badges (only scheduled items)
  const counts = useMemo(() => {
    const upcoming = scheduledItems.filter((t) => t.isUpcoming).length;
    const historical = scheduledItems.filter((t) => !t.isUpcoming).length;
    return { all: scheduledItems.length, upcoming, historical };
  }, [scheduledItems]);

  // Extended reset that also clears additional local state
  const resetForm = useCallback(() => {
    baseResetForm();
    setKeepFormOpenAfterSave(false);
    setShowMoreOptions(false);
    setShowDraftPrompt(false);
    draft.clearDraft();
  }, [baseResetForm, draft]);

  // Open create form with clean state
  const openCreateForm = useCallback(() => {
    baseOpenCreateForm();
    setKeepFormOpenAfterSave(false);
    setShowMoreOptions(false);
  }, [baseOpenCreateForm]);

  const handleFromLocationCreated = (locationId: number, locationName: string) => {
    // Add the new location to local state
    const newLocation: Location = {
      id: locationId,
      name: locationName,
      tripId,
      parentId: null,
      address: null,
      latitude: null,
      longitude: null,
      categoryId: null,
      visitDatetime: null,
      visitDurationMinutes: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLocalLocations([...localLocations, newLocation]);
    handleChange("fromLocationId", locationId);
    setShowFromLocationQuickAdd(false);
  };

  const handleToLocationCreated = (locationId: number, locationName: string) => {
    // Add the new location to local state
    const newLocation: Location = {
      id: locationId,
      name: locationName,
      tripId,
      parentId: null,
      address: null,
      latitude: null,
      longitude: null,
      categoryId: null,
      visitDatetime: null,
      visitDurationMinutes: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLocalLocations([...localLocations, newLocation]);
    handleChange("toLocationId", locationId);
    setShowToLocationQuickAdd(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Convert datetime-local values to ISO strings using the specified timezones
    const effectiveStartTz = values.startTimezone || tripTimezone || 'UTC';
    const effectiveEndTz = values.endTimezone || tripTimezone || 'UTC';

    const departureTimeISO = values.departureTime
      ? convertDateTimeLocalToISO(values.departureTime, effectiveStartTz)
      : null;
    const arrivalTimeISO = values.arrivalTime
      ? convertDateTimeLocalToISO(values.arrivalTime, effectiveEndTz)
      : null;

    if (manager.editingId) {
      // For updates, send null to clear empty fields
      const updateData = {
        type: values.type,
        fromLocationId: values.fromLocationId || null,
        toLocationId: values.toLocationId || null,
        fromLocationName: values.fromLocationName || null,
        toLocationName: values.toLocationName || null,
        departureTime: departureTimeISO,
        arrivalTime: arrivalTimeISO,
        startTimezone: values.startTimezone || null,
        endTimezone: values.endTimezone || null,
        carrier: values.carrier || null,
        vehicleNumber: values.vehicleNumber || null,
        confirmationNumber: values.confirmationNumber || null,
        cost: values.cost ? parseFloat(values.cost) : null,
        currency: values.currency || null,
        notes: values.notes || null,
      };
      const success = await manager.handleUpdate(manager.editingId, updateData);
      if (success) {
        markSaved();
        resetForm();
        manager.closeForm();
      }
    } else {
      // For creates, use undefined to omit optional fields
      const createData = {
        tripId,
        type: values.type,
        fromLocationId: values.fromLocationId,
        toLocationId: values.toLocationId,
        fromLocationName: values.fromLocationName || undefined,
        toLocationName: values.toLocationName || undefined,
        departureTime: departureTimeISO || undefined,
        arrivalTime: arrivalTimeISO || undefined,
        startTimezone: values.startTimezone || undefined,
        endTimezone: values.endTimezone || undefined,
        carrier: values.carrier || undefined,
        vehicleNumber: values.vehicleNumber || undefined,
        confirmationNumber: values.confirmationNumber || undefined,
        cost: values.cost ? parseFloat(values.cost) : undefined,
        currency: values.currency || undefined,
        notes: values.notes || undefined,
      };
      const success = await manager.handleCreate(createData);
      if (success) {
        markSaved();
        // Save currency for next time
        if (values.currency) {
          saveLastUsedCurrency(values.currency);
        }

        if (keepFormOpenAfterSave) {
          // Reset form but keep modal open for quick successive entries
          reset();
          setKeepFormOpenAfterSave(false);
          // Focus first input for quick data entry
          setTimeout(() => {
            const firstInput = document.querySelector<HTMLSelectElement>('#transportation-type');
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
    const confirmed = await confirm({
      title: "Delete Transportation",
      message: "Delete this transportation? This action cannot be undone.",
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
      title: "Delete Transportation",
      message: `Delete ${selectedIds.length} selected transportation items? This action cannot be undone.`,
      confirmLabel: "Delete All",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      await transportationService.bulkDeleteTransportation(tripId, selectedIds);
      toast.success(`Deleted ${selectedIds.length} transportation items`);
      bulkSelection.exitSelectionMode();
      await manager.loadItems();
      onUpdate?.();
    } catch (error) {
      console.error("Failed to bulk delete transportation:", error);
      toast.error("Failed to delete some transportation items");
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
      await transportationService.bulkUpdateTransportation(tripId, selectedIds, updates as { type?: string; carrier?: string; notes?: string });
      toast.success(`Updated ${selectedIds.length} transportation items`);
      setShowBulkEditModal(false);
      bulkSelection.exitSelectionMode();
      await manager.loadItems();
      onUpdate?.();
    } catch (error) {
      console.error("Failed to bulk update transportation:", error);
      toast.error("Failed to update some transportation items");
    } finally {
      setIsBulkEditing(false);
    }
  };

  // Build bulk edit field options
  const bulkEditFields = useMemo(() => [
    {
      key: "type",
      label: "Type",
      type: "select" as const,
      options: [
        { value: "flight", label: "Flight" },
        { value: "train", label: "Train" },
        { value: "bus", label: "Bus" },
        { value: "car", label: "Car" },
        { value: "ferry", label: "Ferry" },
        { value: "bicycle", label: "Bicycle" },
        { value: "walk", label: "Walk" },
        { value: "other", label: "Other" },
      ],
    },
    {
      key: "carrier",
      label: "Carrier/Company",
      type: "text" as const,
      placeholder: "e.g., United Airlines",
    },
    {
      key: "notes",
      label: "Notes",
      type: "textarea" as const,
      placeholder: "Add notes to all selected transportation\u2026",
    },
  ], []);

  const getTypeIcon = (type: TransportationType) => {
    switch (type) {
      case "flight":
        return "✈️";
      case "train":
        return "🚆";
      case "bus":
        return "🚌";
      case "car":
        return "🚗";
      case "ferry":
        return "⛴️";
      case "bicycle":
        return "🚴";
      case "walk":
        return "🚶";
      default:
        return "🚀";
    }
  };

  const formatDateTime = (
    dateTime: string | null,
    timezone?: string | null
  ) => {
    return formatDateTimeInTimezone(dateTime, timezone, tripTimezone, {
      includeTimezone: true,
      format: "medium",
    });
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  };

  const formatDistance = (kilometers: number | null | undefined): string => {
    if (kilometers == null || typeof kilometers !== 'number' || isNaN(kilometers)) {
      return 'Unknown distance';
    }
    const miles = kilometers * 0.621371;
    return `${kilometers.toFixed(1)} km (${miles.toFixed(1)} mi)`;
  };

  // Helper to get location display name - for flights, only show the name without full address
  const getLocationDisplay = (
    location: { name: string } | null | undefined,
    locationName: string | null | undefined,
    locationId: number | null | undefined,
    transportType: string
  ): string => {
    if (location?.name) {
      return location.name;
    }
    if (locationName) {
      // For flights, extract just the first part (name) from text field
      // This handles cases where users entered full addresses like "JFK Airport, Queens, NY"
      if (transportType === 'flight') {
        return locationName.split(',')[0].trim();
      }
      return locationName;
    }
    if (locationId) {
      return `Location #${locationId} (deleted?)`;
    }
    return "Unknown";
  };

  const getStatusBadge = (transportation: Transportation) => {
    if (transportation.isInProgress) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          In Progress
        </span>
      );
    }
    if (transportation.isUpcoming) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          Upcoming
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
        Completed
      </span>
    );
  };

  // Wrap close handler with unsaved changes confirmation
  const handleCloseForm = useCallback(() => {
    if (isFormDirty && !window.confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
    resetForm();
  }, [isFormDirty, resetForm]);

  return (
    <div className="space-y-6">
      <ConfirmDialogComponent />
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          Transportation
        </h2>
        <div className="flex items-center gap-2">
          {manager.items.length > 0 && !bulkSelection.selectionMode && (
            <button
              onClick={bulkSelection.enterSelectionMode}
              className="btn btn-secondary text-sm whitespace-nowrap"
            >
              Select
            </button>
          )}
          {!bulkSelection.selectionMode && (
            <button
              onClick={openCreateForm}
              className="btn btn-primary text-sm sm:text-base whitespace-nowrap"
            >
              <span className="sm:hidden">+ Add</span>
              <span className="hidden sm:inline">+ Add Transportation</span>
            </button>
          )}
        </div>
      </div>

      {/* Statistics */}
      {manager.items.length > 0 && (
        <TransportationStats transportation={manager.items} />
      )}

      {/* Filter Tabs */}
      {manager.items.length > 0 && (
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700" role="tablist" aria-label="Transportation filters">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === "all"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
            role="tab"
            {...{ 'aria-selected': activeTab === "all" }}
            aria-label={`Show all transportation (${counts.all})`}
          >
            All {counts.all > 0 && `(${counts.all})`}
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === "upcoming"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
            role="tab"
            {...{ 'aria-selected': activeTab === "upcoming" }}
            aria-label={`Show upcoming transportation (${counts.upcoming})`}
          >
            Upcoming {counts.upcoming > 0 && `(${counts.upcoming})`}
          </button>
          <button
            onClick={() => setActiveTab("historical")}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === "historical"
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
            role="tab"
            {...{ 'aria-selected': activeTab === "historical" }}
            aria-label={`Show historical transportation (${counts.historical})`}
          >
            Historical {counts.historical > 0 && `(${counts.historical})`}
          </button>
        </div>
      )}

      {/* Sort Control */}
      {manager.items.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="transportation-sort" className="text-sm text-gray-600 dark:text-gray-400">
            Sort by:
          </label>
          <select
            id="transportation-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="input py-1 px-2 text-sm w-auto"
          >
            <option value="date">Departure Date</option>
            <option value="type">Type</option>
          </select>
        </div>
      )}

      {/* Form Modal */}
      <FormModal
        isOpen={manager.showForm}
        onClose={handleCloseForm}
        title={manager.editingId ? "Edit Transportation" : "Add Transportation"}
        icon="🚀"
        formId="transportation-form"
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
                    (document.getElementById('transportation-form') as HTMLFormElement)?.requestSubmit();
                  }}
                  className="btn btn-secondary text-sm whitespace-nowrap hidden sm:block"
                >
                  Save & Add Another
                </button>
              )}
              <button
                type="submit"
                form="transportation-form"
                className="btn btn-primary"
              >
                {manager.editingId ? "Update" : "Add"} Transportation
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
          entityType="transportation"
        />

        <form id="transportation-form" onSubmit={handleSubmit} className="space-y-6">
          {/* SECTION 1: Type Selection */}
          <FormSection title="Type" icon="🚀">
            <div className="space-y-1">
              <label
                htmlFor="transportation-type"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Transportation Type
              </label>
              <select
                id="transportation-type"
                name="type"
                autoComplete="off"
                value={values.type}
                onChange={(e) =>
                  handleChange("type", e.target.value as TransportationType)
                }
                className="input"
                required
              >
              <option value="flight">✈️ Flight</option>
              <option value="train">🚆 Train</option>
              <option value="bus">🚌 Bus</option>
              <option value="car">🚗 Car</option>
              <option value="ferry">⛴️ Ferry</option>
              <option value="bicycle">🚴 Bicycle</option>
              <option value="walk">🚶 Walk</option>
              <option value="other">🚀 Other</option>
            </select>
            </div>
          </FormSection>

          {/* SECTION 2: Route (From/To Locations) */}
          <FormSection title="Route" icon="📍" description="Select your departure and arrival locations">
            {/* From Location */}
            <div>
              <label
                htmlFor="transportation-from-location"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                From
              </label>
              <select
                id="transportation-from-location"
                name="from-location"
                autoComplete="off"
                value={values.fromLocationId || ""}
                onChange={(e) =>
                  handleChange(
                    "fromLocationId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input"
              >
                <option value="">-- Select Location --</option>
                {localLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowFromLocationQuickAdd(!showFromLocationQuickAdd)}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showFromLocationQuickAdd ? "Cancel" : "+ Add New Location"}
              </button>
              {showFromLocationQuickAdd && (
                <div className="mt-2">
                  <LocationQuickAdd
                    tripId={tripId}
                    onLocationCreated={handleFromLocationCreated}
                    onCancel={() => setShowFromLocationQuickAdd(false)}
                  />
                </div>
              )}
            </div>

            {/* To Location */}
            <div>
              <label
                htmlFor="transportation-to-location"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                To
              </label>
              <select
                id="transportation-to-location"
                name="to-location"
                autoComplete="off"
                value={values.toLocationId || ""}
                onChange={(e) =>
                  handleChange(
                    "toLocationId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input"
              >
                <option value="">-- Select Location --</option>
                {localLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowToLocationQuickAdd(!showToLocationQuickAdd)}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showToLocationQuickAdd ? "Cancel" : "+ Add New Location"}
              </button>
              {showToLocationQuickAdd && (
                <div className="mt-2">
                  <LocationQuickAdd
                    tripId={tripId}
                    onLocationCreated={handleToLocationCreated}
                    onCancel={() => setShowToLocationQuickAdd(false)}
                  />
                </div>
              )}
            </div>
          </FormSection>

          {/* SECTION 3: Schedule (Departure/Arrival Times) */}
          <FormSection title="Schedule" icon="🕐" description="Optional - leave blank if times are unknown">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="transportation-departure-time"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Departure
                </label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    id="transportation-departure-time"
                    name="departure-time"
                    autoComplete="off"
                    value={values.departureTime}
                    onChange={(e) =>
                      handleChange("departureTime", e.target.value)
                    }
                    className="input flex-1"
                  />
                  {values.departureTime && (
                    <button
                      type="button"
                      onClick={() => handleChange("departureTime", "")}
                      className="px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Clear departure time"
                      aria-label="Clear departure time"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <TimezoneSelect
                value={values.startTimezone}
                onChange={(value) => handleChange("startTimezone", value)}
                label="Timezone"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="transportation-arrival-time"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Arrival
                </label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    id="transportation-arrival-time"
                    name="arrival-time"
                    autoComplete="off"
                    value={values.arrivalTime}
                    onChange={(e) => handleChange("arrivalTime", e.target.value)}
                    className="input flex-1"
                  />
                  {values.arrivalTime && (
                    <button
                      type="button"
                      onClick={() => handleChange("arrivalTime", "")}
                      className="px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Clear arrival time"
                      aria-label="Clear arrival time"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <TimezoneSelect
                value={values.endTimezone}
                onChange={(value) => handleChange("endTimezone", value)}
                label="Timezone"
              />
            </div>
          </FormSection>

          {/* COLLAPSIBLE: More Options (Carrier, Vehicle, Booking, Cost, Notes) */}
          <CollapsibleSection
            title="More Options"
            icon="⚙️"
            isExpanded={showMoreOptions}
            onToggle={() => setShowMoreOptions(!showMoreOptions)}
            badge="carrier, cost, notes"
          >
            {/* Carrier and Vehicle Number */}
            <FormSection title="Transport Details" icon="🎫">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="transportation-carrier"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Carrier/Company
                  </label>
                  <input
                    type="text"
                    id="transportation-carrier"
                    name="carrier"
                    autoComplete="off"
                    value={values.carrier}
                    onChange={(e) => handleChange("carrier", e.target.value)}
                    className="input"
                    placeholder="e.g., United Airlines"
                  />
                </div>

                <div>
                  <label
                    htmlFor="transportation-vehicle-number"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Flight/Train/Vehicle #
                  </label>
                  <input
                    type="text"
                    id="transportation-vehicle-number"
                    name="vehicle-number"
                    autoComplete="off"
                    value={values.vehicleNumber}
                    onChange={(e) => handleChange("vehicleNumber", e.target.value)}
                    className="input"
                    placeholder="e.g., UA 123"
                  />
                </div>
              </div>

              {/* Confirmation Number */}
              <BookingFields
                confirmationNumber={values.confirmationNumber}
                bookingUrl=""
                onConfirmationNumberChange={(value) =>
                  handleChange("confirmationNumber", value)
                }
                onBookingUrlChange={() => {}}
                confirmationLabel="Confirmation Number"
                hideBookingUrl={true}
              />
            </FormSection>

            {/* Custom Location Text (Advanced) */}
            <FormSection title="Custom Locations" icon="✏️" description="Use only if location not in list (distances won't be calculated)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="transportation-from-custom"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    From (custom text)
                  </label>
                  <input
                    type="text"
                    id="transportation-from-custom"
                    name="from-custom"
                    autoComplete="off"
                    value={values.fromLocationName}
                    onChange={(e) =>
                      handleChange("fromLocationName", e.target.value)
                    }
                    className="input"
                    placeholder="e.g., JFK Airport"
                  />
                </div>

                <div>
                  <label
                    htmlFor="transportation-to-custom"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    To (custom text)
                  </label>
                  <input
                    type="text"
                    id="transportation-to-custom"
                    name="to-custom"
                    autoComplete="off"
                    value={values.toLocationName}
                    onChange={(e) =>
                      handleChange("toLocationName", e.target.value)
                    }
                    className="input"
                    placeholder="e.g., LAX Airport"
                  />
                </div>
              </div>
            </FormSection>

            {/* Cost */}
            <FormSection title="Cost" icon="💰">
              <CostCurrencyFields
                cost={values.cost}
                currency={values.currency}
                onCostChange={(value) => handleChange("cost", value)}
                onCurrencyChange={(value) => handleChange("currency", value)}
              />
            </FormSection>

            {/* Notes */}
            <MarkdownEditor
              value={values.notes}
              onChange={(val) => handleChange("notes", val)}
              rows={3}
              placeholder="Additional notes\u2026"
              label="Notes"
              compact
            />
          </CollapsibleSection>
        </form>
        </FormModal>

      {/* Transportation List */}
      {manager.items.length === 0 ? (
        <EmptyState
          icon={<EmptyIllustrations.NoTransportation />}
          message="Plan Your Journey"
          subMessage="How will you get there? Add flights, trains, road trips, and more. Track departure times, booking confirmations, and never miss a connection."
          actionLabel="Add Transportation"
          onAction={openCreateForm}
        />
      ) : (
        <>
          {/* Scheduled Transportation */}
          {scheduledItems.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <span>📅</span> Scheduled Transportation
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({filteredScheduledItems.length})
                </span>
              </h3>
              {filteredScheduledItems.length === 0 ? (
                <EmptyState.Compact
                  icon="🔍"
                  message={`No ${activeTab} transportation`}
                />
              ) : (
                <div className="space-y-4">
                  {filteredScheduledItems.map((transportation, index) => (
                    <TransportationItem
                      key={transportation.id}
                      transportation={transportation}
                      tripId={tripId}
                      getTypeIcon={getTypeIcon}
                      getStatusBadge={getStatusBadge}
                      getLocationDisplay={getLocationDisplay}
                      formatDateTime={formatDateTime}
                      formatDuration={formatDuration}
                      formatDistance={formatDistance}
                      getLinkSummary={getLinkSummary}
                      invalidateLinkSummary={invalidateLinkSummary}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      selectionMode={bulkSelection.selectionMode}
                      isSelected={bulkSelection.isSelected(transportation.id)}
                      onToggleSelection={(id, idx, shiftKey) => bulkSelection.toggleItemSelection(id, idx, shiftKey, manager.items)}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unscheduled Transportation */}
          {sortedUnscheduledItems.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <span>📋</span> Unscheduled Transportation
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({sortedUnscheduledItems.length})
                </span>
              </h3>
              <div className="space-y-4">
                {sortedUnscheduledItems.map((transportation, index) => (
                  <TransportationItem
                    key={transportation.id}
                    transportation={transportation}
                    tripId={tripId}
                    getTypeIcon={getTypeIcon}
                    getStatusBadge={getStatusBadge}
                    getLocationDisplay={getLocationDisplay}
                    formatDateTime={formatDateTime}
                    formatDuration={formatDuration}
                    formatDistance={formatDistance}
                    getLinkSummary={getLinkSummary}
                    invalidateLinkSummary={invalidateLinkSummary}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    selectionMode={bulkSelection.selectionMode}
                    isSelected={bulkSelection.isSelected(transportation.id)}
                    onToggleSelection={(id, idx, shiftKey) => bulkSelection.toggleItemSelection(id, idx, shiftKey, manager.items)}
                    index={filteredScheduledItems.length + index}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {bulkSelection.selectionMode && (
        <BulkActionBar
          entityType="transportation"
          selectedCount={bulkSelection.selectedCount}
          totalCount={manager.items.length}
          onSelectAll={() => bulkSelection.selectAll(manager.items)}
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
        entityType="transportation"
        selectedCount={bulkSelection.selectedCount}
        fields={bulkEditFields}
        onSubmit={handleBulkEdit}
        isSubmitting={isBulkEditing}
      />
    </div>
  );
}
