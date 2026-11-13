import { useState, useEffect, useCallback, forwardRef } from "react";
import type { Activity } from "../../types/activity";
import type { Location } from "../../types/location";
import { createLocationStub } from "../../utils/locationHelpers";
import type { ActivityCategory } from "../../types/user";
import { useFormFields } from "../../hooks/useFormFields";
import { useFieldErrors } from "../../hooks/useFieldErrors";
import { useAutoSaveDraft } from "../../hooks/useAutoSaveDraft";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import FormSection, { CollapsibleSection } from "../FormSection";
import DraftRestorePrompt from "../DraftRestorePrompt";
import TimezoneSelect from "../TimezoneSelect";
import CostCurrencyFields from "../CostCurrencyFields";
import BookingFields from "../BookingFields";
import LocationQuickAdd from "../LocationQuickAdd";
import AlsoCreatePlaceOption from "./AlsoCreatePlaceOption";
import { useLinkedCreate } from "../../hooks/useLinkedCreate";
import {
  convertISOToDateTimeLocal,
  convertDateTimeLocalToISO,
} from "../../utils/timezone";
import { useTimezoneResolver } from "../../hooks/useTimezoneResolver";
import { useTimeRangeDefaults } from "../../hooks/useTimeRangeDefaults";
import type { DateTimeParts } from "../../utils/dateTimeDefaults";
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

const ActivityForm = forwardRef<HTMLFormElement, ActivityFormProps>(function ActivityForm({
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
}: ActivityFormProps, ref) {
  const resolveTz = useTimezoneResolver();
  const [showLocationQuickAdd, setShowLocationQuickAdd] = useState(false);
  // Create mode only: also create a Place with the activity's name and link it.
  const [alsoCreatePlace, setAlsoCreatePlace] = useState(false);
  const { createPlaceNamed } = useLinkedCreate(tripId);
  const [showMoreOptions, setShowMoreOptions] = useState(showMoreOptionsDefault);
  const [localLocations, setLocalLocations] = useState<Location[]>(locations);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  const initialFormState = getInitialFormState(tripStartDate, defaultUnscheduled);
  const { values, handleChange, reset, setAllFields } = useFormFields<ActivityFormFields>(
    initialFormState
  );

  const fieldErrors = useFieldErrors({
    name: { validate: (v) => v.trim() ? null : 'Activity name is required' },
  });
  const { resetErrors } = fieldErrors;

  // Suggests the missing half of the start/end pair (one hour apart) without
  // overwriting anything the user typed.
  const { deriveEnd, deriveStart, setAutoFilled } = useTimeRangeDefaults();

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
      // Restored times are the user's own work, not suggestions to overwrite.
      setAutoFilled({ start: false, end: false });
      // Show more options if draft has data in optional fields
      if (restoredData.description || restoredData.locationId || restoredData.cost ||
          restoredData.bookingUrl || restoredData.bookingReference || restoredData.notes ||
          (restoredData.dietaryTags && restoredData.dietaryTags.length > 0)) {
        setShowMoreOptions(true);
      }
    }
    setShowDraftPrompt(false);
  }, [draft, setAllFields, setAutoFilled]);

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
      // A saved activity's times are the user's; only a still-empty side gets filled in.
      setAutoFilled({ start: false, end: false });
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
      const effectiveTz = resolveTz(editingActivity.timezone, tripTimezone);

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
      // Reset form for new activity. Both dates start seeded from the trip start date,
      // which the user did not choose - treat them as replaceable suggestions.
      reset();
      resetErrors();
      setAutoFilled({ start: true, end: true });
      if (defaultUnscheduled) {
        handleChange("unscheduled", true);
      }
    }
  }, [editingActivity, editingLocationId, tripTimezone, resolveTz, defaultUnscheduled, handleChange, reset, resetErrors, setAutoFilled]);

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

  // Auto-fill: End Time = Start Time + 1 Hour, and Start Time = End Time - 1 Hour.
  // Driven from the change handlers rather than an effect so a clear stays cleared:
  // an effect watching the start would immediately refill an end the user just emptied.
  const applyStartChange = useCallback(
    (next: DateTimeParts) => {
      handleChange("startDate", next.date);
      handleChange("startTime", next.time);

      const derived = deriveEnd(next, { date: values.endDate, time: values.endTime });
      if (derived) {
        handleChange("endDate", derived.date);
        handleChange("endTime", derived.time);
      }
    },
    [handleChange, deriveEnd, values.endDate, values.endTime]
  );

  const applyEndChange = useCallback(
    (next: DateTimeParts) => {
      handleChange("endDate", next.date);
      handleChange("endTime", next.time);

      const derived = deriveStart(next, { date: values.startDate, time: values.startTime });
      if (derived) {
        handleChange("startDate", derived.date);
        handleChange("startTime", derived.time);
      }
    },
    [handleChange, deriveStart, values.startDate, values.startTime]
  );

  const handleLocationCreated = (locationId: number, locationName: string) => {
    const newLocation = createLocationStub(locationId, locationName, tripId);
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
      const effectiveTz = resolveTz(values.timezone, tripTimezone);

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

      // A place picked from the list wins over creating a new one.
      let locationId = values.locationId || null;
      if (alsoCreatePlace && !isEditMode && !locationId) {
        const place = await createPlaceNamed(values.name);
        if (place) {
          locationId = place.id;
          // Select it in the form too, so a retry after a failed save links
          // this place instead of creating a second one.
          handleLocationCreated(place.id, place.name);
          setAlsoCreatePlace(false);
        }
      }

      await onSubmit(formData, locationId);

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
    <form id={formId} ref={ref} onSubmit={handleFormSubmit} className="space-y-6">
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
              className="block text-sm font-medium text-charcoal dark:text-warm-gray mb-1"
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
              onBlur={(e) => fieldErrors.handleBlur("name", e.target.value)}
              className={`input ${fieldErrors.inputErrorClass("name")}`}
              aria-invalid={fieldErrors.touched.name && !!fieldErrors.errors.name}
              aria-describedby={fieldErrors.errors.name ? "activity-name-error" : undefined}
              required
              disabled={isSubmitting}
              placeholder="Activity name…"
            />
            {fieldErrors.touched.name && fieldErrors.errors.name && (
              <p id="activity-name-error" className="text-red-600 dark:text-red-400 text-xs mt-1">
                {fieldErrors.errors.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${formId}-category`}
              className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
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
          <p className="text-sm text-gray-600 dark:text-dusk-400 mb-3">
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
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-dusk-700/50 rounded-lg">
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
            className="text-sm font-medium text-gray-700 dark:text-dusk-300"
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
                className="text-sm font-medium text-gray-700 dark:text-dusk-300"
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
                    className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    id={`${formId}-start-date`}
                    name="start-date"
                    autoComplete="off"
                    value={values.startDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleChange("startDate", value);
                      if (value && !values.endDate) {
                        handleChange("endDate", value);
                      }
                    }}
                    className="input"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-end-date`}
                    className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                  >
                    End Date
                  </label>
                  <input
                    type="date"
                    id={`${formId}-end-date`}
                    name="end-date"
                    autoComplete="off"
                    value={values.endDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleChange("endDate", value);
                      if (value && !values.startDate) {
                        handleChange("startDate", value);
                      }
                    }}
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
                      className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
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
                        onChange={(e) =>
                          applyStartChange({ date: e.target.value, time: values.startTime })
                        }
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
                        onChange={(e) =>
                          applyStartChange({ date: values.startDate, time: e.target.value })
                        }
                        className="input flex-1"
                        placeholder="12:00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`${formId}-end-date-time`}
                      className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
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
                        onChange={(e) =>
                          applyEndChange({ date: e.target.value, time: values.endTime })
                        }
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
                        onChange={(e) =>
                          applyEndChange({ date: values.endDate, time: e.target.value })
                        }
                        className="input flex-1"
                        placeholder="12:00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-dusk-400 -mt-2">
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

      {/* Place: linked through the entity link system */}
      <FormSection title="Place" icon="📍">
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
              <option value="">No place linked</option>
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

        {!isEditMode && !values.locationId && !showLocationQuickAdd && (
          <AlsoCreatePlaceOption
            id={`${formId}-also-create-place`}
            name={values.name}
            checked={alsoCreatePlace}
            onChange={setAlsoCreatePlace}
            disabled={isSubmitting}
          />
        )}
      </FormSection>

      {/* COLLAPSIBLE: More Options */}
      <CollapsibleSection
        title="More Options"
        icon="⚙️"
        isExpanded={showMoreOptions}
        onToggle={() => setShowMoreOptions(!showMoreOptions)}
        badge="description, booking, cost"
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

        {/* Organization */}
        {topLevelActivities.length > 0 && (
          <FormSection title="Organization" icon="📂">
            <div>
              <label
                htmlFor={`${formId}-parent`}
                className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
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
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
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
            <p className="text-sm text-gray-600 dark:text-dusk-400 mb-3">
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
          placeholder="Additional notes…"
          disabled={isSubmitting}
          label="Notes"
          compact
        />
      </CollapsibleSection>
    </form>
  );
});

export default ActivityForm;
