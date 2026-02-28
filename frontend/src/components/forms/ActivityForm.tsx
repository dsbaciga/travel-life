import { useState, useEffect, useCallback } from "react";
import type { Activity } from "../../types/activity";
import type { Location } from "../../types/location";
import type { ActivityCategory } from "../../types/user";
import { useFormFields } from "../../hooks/useFormFields";
import { useAutoSaveDraft } from "../../hooks/useAutoSaveDraft";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import FormSection, { CollapsibleSection } from "../FormSection";
import DraftRestorePrompt from "../DraftRestorePrompt";
import TimezoneSelect from "../TimezoneSelect";
import CostCurrencyFields from "../CostCurrencyFields";
import BookingFields from "../BookingFields";
import LocationQuickAdd from "../LocationQuickAdd";
import {
  convertISOToDateTimeLocal,
  convertDateTimeLocalToISO,
} from "../../utils/timezone";
import { getLastUsedCurrency, saveLastUsedCurrency } from "../../utils/currencyStorage";
import DietaryTagSelector from "../DietaryTagSelector";
import MarkdownEditor from "../MarkdownEditor";

export interface ActivityFormFields {
  name: string;
  description: string;
  category: string;
  locationId: number | undefined;
  parentId: number | undefined;
  unscheduled: boolean;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  cost: string;
  currency: string;
  bookingUrl: string;
  bookingReference: string;
  notes: string;
  dietaryTags: string[];
}

export interface ActivityFormData {
  name: string;
  description: string | null;
  category: string | null;
  locationId: number | null;
  parentId: number | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  cost: number | null;
  currency: string | null;
  bookingUrl: string | null;
  bookingReference: string | null;
  notes: string | null;
  dietaryTags: string[] | null;
}

interface ActivityFormProps {
  formId: string;
  tripId: number;
  locations: Location[];
  activityCategories: ActivityCategory[];
  tripTimezone?: string | null;
  tripStartDate?: string | null;
  existingActivities?: Activity[];
  editingActivity?: Activity | null;
  editingLocationId?: number | null;
  onSubmit: (data: ActivityFormData, locationId: number | null) => Promise<void>;
  onLocationCreated?: (locationId: number, locationName: string) => void;
  defaultUnscheduled?: boolean;
  showMoreOptionsDefault?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const getInitialFormState = (
  tripStartDate?: string | null,
  defaultUnscheduled?: boolean
): ActivityFormFields => {
  const defaultDate = !defaultUnscheduled && tripStartDate ? tripStartDate.slice(0, 10) : "";
  return {
    name: "",
    description: "",
    category: "",
    locationId: undefined,
    parentId: undefined,
    unscheduled: defaultUnscheduled ?? false,
    allDay: false,
    startDate: defaultDate,
    startTime: "",
    endDate: defaultDate,
    endTime: "",
    timezone: "",
    cost: "",
    currency: getLastUsedCurrency(),
    bookingUrl: "",
    bookingReference: "",
    notes: "",
    dietaryTags: [],
  };
};

export default function ActivityForm({
  formId,
  tripId,
  locations,
  activityCategories,
  tripTimezone,
  tripStartDate,
  existingActivities = [],
  editingActivity,
  editingLocationId,
  onSubmit,
  onLocationCreated,
  defaultUnscheduled = false,
  showMoreOptionsDefault = false,
  onDirtyChange,
}: ActivityFormProps) {
  const [showLocationQuickAdd, setShowLocationQuickAdd] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(showMoreOptionsDefault);
  const [localLocations, setLocalLocations] = useState<Location[]>(locations);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  const initialFormState = getInitialFormState(tripStartDate, defaultUnscheduled);
  const { values, handleChange, reset, setAllFields } = useFormFields<ActivityFormFields>(
    initialFormState
  );

  // Track unsaved changes for browser close/refresh warning
  const { captureInitialValues, isDirty: isFormDirty, markSaved } = useUnsavedChangesWarning(values, true);

  // Notify parent of dirty state changes (for modal close confirmation)
  useEffect(() => {
    onDirtyChange?.(isFormDirty);
  }, [isFormDirty, onDirtyChange]);

  // Auto-save draft for form data
  const isEditMode = !!editingActivity;
  const draftKey = isEditMode && editingActivity ? editingActivity.id : tripId;
  const draft = useAutoSaveDraft(values, {
    entityType: 'activity',
    id: draftKey,
    isEditMode,
    tripId,
    defaultValues: initialFormState,
    enabled: true,
  });

  // Check for existing draft when form opens in create mode
  // Use initialDraftExists to only show prompt for drafts from previous sessions
  useEffect(() => {
    if (!isEditMode && draft.initialDraftExists) {
      setShowDraftPrompt(true);
    }
  }, [isEditMode, draft.initialDraftExists]);

  // Handle draft restore
  const handleRestoreDraft = useCallback(() => {
    const restoredData = draft.restoreDraft();
    if (restoredData) {
      setAllFields(restoredData);
      // Show more options if draft has data in optional fields
      if (restoredData.description || restoredData.locationId || restoredData.cost ||
          restoredData.bookingUrl || restoredData.bookingReference || restoredData.notes ||
          (restoredData.dietaryTags && restoredData.dietaryTags.length > 0)) {
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

  // Sync localLocations with locations prop
  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  // Populate form when editing
  useEffect(() => {
    if (editingActivity) {
      setShowMoreOptions(true);
      handleChange("name", editingActivity.name);
      handleChange("description", editingActivity.description || "");
      handleChange("category", editingActivity.category || "");
      handleChange("parentId", editingActivity.parentId || undefined);
      handleChange("unscheduled", !editingActivity.startTime);
      handleChange("allDay", editingActivity.allDay);
      handleChange("timezone", editingActivity.timezone || "");
      handleChange("cost", editingActivity.cost?.toString() || "");
      handleChange("currency", editingActivity.currency || "USD");
      handleChange("bookingUrl", editingActivity.bookingUrl || "");
      handleChange("bookingReference", editingActivity.bookingReference || "");
      handleChange("notes", editingActivity.notes || "");
      handleChange("dietaryTags", editingActivity.dietaryTags || []);

      // Set location from prop (fetched via entity link)
      if (editingLocationId) {
        handleChange("locationId", editingLocationId);
      } else {
        handleChange("locationId", undefined);
      }

      // Determine effective timezone
      const effectiveTz = editingActivity.timezone || tripTimezone || "UTC";

      // Handle date/time fields based on allDay flag
      if (editingActivity.allDay) {
        if (editingActivity.startTime) {
          const startDateTime = convertISOToDateTimeLocal(
            editingActivity.startTime,
            effectiveTz
          );
          handleChange("startDate", startDateTime.slice(0, 10));
        } else {
          handleChange("startDate", "");
        }
        if (editingActivity.endTime) {
          const endDateTime = convertISOToDateTimeLocal(
            editingActivity.endTime,
            effectiveTz
          );
          handleChange("endDate", endDateTime.slice(0, 10));
        } else {
          handleChange("endDate", "");
        }
        handleChange("startTime", "");
        handleChange("endTime", "");
      } else {
        if (editingActivity.startTime) {
          const startDateTime = convertISOToDateTimeLocal(
            editingActivity.startTime,
            effectiveTz
          );
          handleChange("startDate", startDateTime.slice(0, 10));
          handleChange("startTime", startDateTime.slice(11));
        } else {
          handleChange("startDate", "");
          handleChange("startTime", "");
        }
        if (editingActivity.endTime) {
          const endDateTime = convertISOToDateTimeLocal(
            editingActivity.endTime,
            effectiveTz
          );
          handleChange("endDate", endDateTime.slice(0, 10));
          handleChange("endTime", endDateTime.slice(11));
        } else {
          handleChange("endDate", "");
          handleChange("endTime", "");
        }
      }
    } else {
      // Reset form for new activity
      reset();
      if (defaultUnscheduled) {
        handleChange("unscheduled", true);
      }
    }
    // Note: handleChange and reset are stable functions from useFormFields hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingActivity, editingLocationId, tripTimezone, defaultUnscheduled]);

  // Capture initial values for dirty tracking after form populates.
  // Uses a microtask to ensure all handleChange calls from the populate effect have settled.
  useEffect(() => {
    const timer = setTimeout(() => {
      captureInitialValues(values);
    }, 0);
    return () => clearTimeout(timer);
    // Only re-capture when the editing activity changes, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingActivity, captureInitialValues]);

  // Auto-fill: End Time = Start Time + 1 Hour (only when creating)
  useEffect(() => {
    if (!editingActivity && !values.allDay && !values.unscheduled && values.startDate && values.startTime) {
      if (!values.endTime || !values.endDate) {
        const [hours, minutes] = values.startTime.split(":").map(Number);
        const newHours = (hours + 1) % 24;
        const endTime = `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

        let endDate = values.startDate;
        if (newHours < hours) {
          const date = new Date(values.startDate);
          date.setDate(date.getDate() + 1);
          endDate = date.toISOString().slice(0, 10);
        }

        if (!values.endTime) handleChange("endTime", endTime);
        if (!values.endDate) handleChange("endDate", endDate);
      }
    }
    // Note: handleChange is a stable function from useFormFields hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.startDate, values.startTime, values.allDay, values.unscheduled, editingActivity]);

  const handleLocationCreated = (locationId: number, locationName: string) => {
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
    handleChange("locationId", locationId);
    setShowLocationQuickAdd(false);
    onLocationCreated?.(locationId, locationName);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!values.name.trim()) {
      return; // Let HTML5 validation handle this
    }

    setIsSubmitting(true);
    try {
      const effectiveTz = values.timezone || tripTimezone || "UTC";

      let startTimeISO: string | null = null;
      let endTimeISO: string | null = null;

      if (!values.unscheduled) {
        if (values.allDay) {
          if (values.startDate) {
            const dateTimeLocal = `${values.startDate}T00:00`;
            startTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
          }
          if (values.endDate) {
            const dateTimeLocal = `${values.endDate}T23:59`;
            endTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
          }
        } else {
          if (values.startDate) {
            const startTime = values.startTime || "12:00";
            const dateTimeLocal = `${values.startDate}T${startTime}`;
            startTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
          }
          if (values.endDate) {
            const endTime = values.endTime || "12:00";
            const dateTimeLocal = `${values.endDate}T${endTime}`;
            endTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
          }
        }
      }

      const formData: ActivityFormData = {
        name: values.name,
        description: values.description || null,
        category: values.category || null,
        locationId: null, // Handled separately via entity links
        parentId: values.parentId || null,
        allDay: values.allDay,
        startTime: startTimeISO,
        endTime: endTimeISO,
        timezone: values.timezone || null,
        cost: values.cost ? parseFloat(values.cost) : null,
        currency: values.currency || null,
        bookingUrl: values.bookingUrl || null,
        bookingReference: values.bookingReference || null,
        notes: values.notes || null,
        dietaryTags: values.dietaryTags.length > 0 ? values.dietaryTags : null,
      };

      // Save currency for next time
      if (values.currency) {
        saveLastUsedCurrency(values.currency);
      }

      await onSubmit(formData, values.locationId || null);

      // Mark form as saved to suppress unsaved changes warning
      markSaved();

      // Clear draft on successful submit
      draft.clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter top-level activities for parent selection
  const topLevelActivities = existingActivities.filter(
    (a) => !a.parentId && a.id !== editingActivity?.id
  );

  return (
    <form id={formId} onSubmit={handleFormSubmit} className="space-y-6">
      {/* Draft Restore Prompt */}
      <DraftRestorePrompt
        isOpen={showDraftPrompt && !isEditMode}
        savedAt={draft.lastSavedAt}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
        entityType="activity"
      />

      {/* SECTION 1: Basic Info */}
      <FormSection title="Basic Info" icon="🎯">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${formId}-name`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Name *
            </label>
            <input
              type="text"
              id={`${formId}-name`}
              name="name"
              autoComplete="off"
              value={values.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input"
              required
              disabled={isSubmitting}
              placeholder="Activity name\u2026"
            />
          </div>

          <div>
            <label
              htmlFor={`${formId}-category`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Category
            </label>
            <select
              id={`${formId}-category`}
              name="category"
              autoComplete="off"
              value={values.category}
              onChange={(e) => handleChange("category", e.target.value)}
              className="input"
              disabled={isSubmitting}
            >
              <option value="">-- Select Category --</option>
              {activityCategories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.emoji} {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormSection>

      {/* SECTION: Dietary Options - shown prominently when category is Dining */}
      {values.category.toLowerCase() === "dining" && (
        <FormSection title="Dietary Options" icon="🍽️">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Select dietary accommodations available at this restaurant.
          </p>
          <DietaryTagSelector
            selectedTags={values.dietaryTags}
            onChange={(tags) => handleChange("dietaryTags", tags)}
            showLabels={true}
            compact
          />
        </FormSection>
      )}

      {/* SECTION 2: Schedule */}
      <FormSection title="Schedule" icon="🕐">
        {/* Unscheduled Toggle */}
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <input
            type="checkbox"
            id={`${formId}-unscheduled`}
            name="unscheduled"
            checked={values.unscheduled}
            onChange={(e) => {
              handleChange("unscheduled", e.target.checked);
              if (e.target.checked) {
                handleChange("startDate", "");
                handleChange("startTime", "");
                handleChange("endDate", "");
                handleChange("endTime", "");
              }
            }}
            className="rounded"
            disabled={isSubmitting}
          />
          <label
            htmlFor={`${formId}-unscheduled`}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Keep unscheduled (no date/time)
          </label>
        </div>

        {/* Date/Time Fields - only shown when not unscheduled */}
        {!values.unscheduled && (
          <>
            {/* All Day Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`${formId}-allDay`}
                name="all-day"
                checked={values.allDay}
                onChange={(e) => handleChange("allDay", e.target.checked)}
                className="rounded"
                disabled={isSubmitting}
              />
              <label
                htmlFor={`${formId}-allDay`}
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                All-day activity
              </label>
            </div>

            {/* Date/Time Fields */}
            {values.allDay ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={`${formId}-start-date`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    id={`${formId}-start-date`}
                    name="start-date"
                    autoComplete="off"
                    value={values.startDate}
                    onChange={(e) => handleChange("startDate", e.target.value)}
                    className="input"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-end-date`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    End Date
                  </label>
                  <input
                    type="date"
                    id={`${formId}-end-date`}
                    name="end-date"
                    autoComplete="off"
                    value={values.endDate}
                    onChange={(e) => handleChange("endDate", e.target.value)}
                    className="input"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor={`${formId}-start-date-time`}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Start Time
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        id={`${formId}-start-date-time`}
                        name="start-date"
                        autoComplete="off"
                        value={values.startDate}
                        onChange={(e) => handleChange("startDate", e.target.value)}
                        className="input flex-1"
                        disabled={isSubmitting}
                      />
                      <input
                        type="time"
                        id={`${formId}-start-time`}
                        name="start-time"
                        autoComplete="off"
                        aria-label="Start time"
                        value={values.startTime}
                        onChange={(e) => handleChange("startTime", e.target.value)}
                        className="input flex-1"
                        placeholder="12:00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`${formId}-end-date-time`}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      End Time
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        id={`${formId}-end-date-time`}
                        name="end-date"
                        autoComplete="off"
                        value={values.endDate}
                        onChange={(e) => handleChange("endDate", e.target.value)}
                        className="input flex-1"
                        disabled={isSubmitting}
                      />
                      <input
                        type="time"
                        id={`${formId}-end-time`}
                        name="end-time"
                        autoComplete="off"
                        aria-label="End time"
                        value={values.endTime}
                        onChange={(e) => handleChange("endTime", e.target.value)}
                        className="input flex-1"
                        placeholder="12:00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                  Time defaults to 12:00 PM if not specified
                </p>
              </>
            )}

            <TimezoneSelect
              value={values.timezone}
              onChange={(value) => handleChange("timezone", value)}
              label="Timezone"
            />
          </>
        )}
      </FormSection>

      {/* COLLAPSIBLE: More Options */}
      <CollapsibleSection
        title="More Options"
        icon="⚙️"
        isExpanded={showMoreOptions}
        onToggle={() => setShowMoreOptions(!showMoreOptions)}
        badge="description, location, cost"
      >
        {/* Description */}
        <MarkdownEditor
          value={values.description}
          onChange={(val) => handleChange("description", val)}
          rows={2}
          placeholder="Activity description"
          disabled={isSubmitting}
          label="Description"
          compact
        />

        {/* Location Section */}
        <FormSection title="Location" icon="📍">
          {showLocationQuickAdd ? (
            <LocationQuickAdd
              tripId={tripId}
              onLocationCreated={handleLocationCreated}
              onCancel={() => setShowLocationQuickAdd(false)}
            />
          ) : (
            <div className="flex gap-2">
              <select
                id={`${formId}-location`}
                name="location"
                autoComplete="off"
                value={values.locationId || ""}
                onChange={(e) =>
                  handleChange(
                    "locationId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input flex-1"
                disabled={isSubmitting}
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
                onClick={() => setShowLocationQuickAdd(true)}
                className="btn btn-secondary whitespace-nowrap"
                disabled={isSubmitting}
              >
                + New
              </button>
            </div>
          )}
        </FormSection>

        {/* Organization */}
        {topLevelActivities.length > 0 && (
          <FormSection title="Organization" icon="📂">
            <div>
              <label
                htmlFor={`${formId}-parent`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Parent Activity
              </label>
              <select
                id={`${formId}-parent`}
                name="parent"
                autoComplete="off"
                value={values.parentId || ""}
                onChange={(e) =>
                  handleChange(
                    "parentId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input"
                disabled={isSubmitting}
              >
                <option value="">-- No Parent (Top Level) --</option>
                {topLevelActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Group this activity under another activity
              </p>
            </div>
          </FormSection>
        )}

        {/* Booking Section */}
        <FormSection title="Booking Details" icon="🎫">
          <BookingFields
            confirmationNumber={values.bookingReference}
            bookingUrl={values.bookingUrl}
            onConfirmationNumberChange={(value) =>
              handleChange("bookingReference", value)
            }
            onBookingUrlChange={(value) => handleChange("bookingUrl", value)}
            confirmationLabel="Booking Reference"
          />
        </FormSection>

        {/* Cost Section */}
        <FormSection title="Cost" icon="💰">
          <CostCurrencyFields
            cost={values.cost}
            currency={values.currency}
            onCostChange={(value) => handleChange("cost", value)}
            onCurrencyChange={(value) => handleChange("currency", value)}
          />
        </FormSection>

        {/* Dietary Options - in More Options for non-dining activities */}
        {values.category.toLowerCase() !== "dining" && (
          <FormSection title="Dietary Options" icon="🍽️">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              If this activity involves food, select available dietary accommodations.
            </p>
            <DietaryTagSelector
              selectedTags={values.dietaryTags}
              onChange={(tags) => handleChange("dietaryTags", tags)}
              showLabels={true}
              compact
            />
          </FormSection>
        )}

        {/* Notes */}
        <MarkdownEditor
          value={values.notes}
          onChange={(val) => handleChange("notes", val)}
          rows={3}
          placeholder="Additional notes\u2026"
          disabled={isSubmitting}
          label="Notes"
          compact
        />
      </CollapsibleSection>
    </form>
  );
}
