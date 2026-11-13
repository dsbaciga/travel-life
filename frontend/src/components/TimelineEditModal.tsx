import { useState, useEffect, useCallback } from "react";
import type { Activity } from "../types/activity";
import type {
  Transportation,
  TransportationType,
} from "../types/transportation";
import { isTransportationType } from "../types/transportation";
import type { Lodging, LodgingType } from "../types/lodging";
import { isLodgingType } from "../types/lodging";
import type { JournalEntry } from "../types/journalEntry";
import type { Location } from "../types/location";
import { createLocationStub } from "../utils/locationHelpers";
import type { ActivityCategory } from "../types/user";
import activityService from "../services/activity.service";
import transportationService from "../services/transportation.service";
import lodgingService from "../services/lodging.service";
import journalEntryService from "../services/journalEntry.service";
import entityLinkService from "../services/entityLink.service";
import { useInvalidateEntityLinks } from "../hooks/useInvalidateEntityLinks";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import { useTimeRangeDefaults } from "../hooks/useTimeRangeDefaults";
import {
  splitDateTimeLocal,
  joinDateTimeLocal,
  type DateTimeParts,
} from "../utils/dateTimeDefaults";
import userService from "../services/user.service";
import toast from "react-hot-toast";
import {
  convertISOToDateTimeLocal,
  convertDateTimeLocalToISO,
  extractDatePortion,
} from "../utils/timezone";
import FormModal from "./FormModal";
import TimezoneSelect from "./TimezoneSelect";
import CostCurrencyFields from "./CostCurrencyFields";
import BookingFields from "./BookingFields";
import LocationQuickAdd from "./LocationQuickAdd";

/**
 * Form state shapes.
 *
 * Declared explicitly so `useState` is given the type rather than inferring it
 * from the initial values — otherwise fields that start as `undefined` or at a
 * literal (`"flight"`) would infer as `undefined` / `"flight"` and need an
 * assertion on the initial value to widen them.
 *
 * Every field is a string because the inputs are uncontrolled text/select
 * values; conversion to numbers and dates happens on submit.
 */
interface ActivityFormState {
  name: string;
  description: string;
  category: string;
  locationId: number | undefined;
  parentId: number | undefined;
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
}

interface TransportationFormState {
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

interface LodgingFormState {
  type: LodgingType;
  name: string;
  locationId: number | undefined;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  timezone: string;
  confirmationNumber: string;
  bookingUrl: string;
  cost: string;
  currency: string;
  notes: string;
}

/**
 * `itemType` and `itemData` are paired as a discriminated union rather than
 * declared independently, so `itemType: "activity"` can only ever arrive with
 * an Activity. Switching on `props.itemType` then narrows `props.itemData` to
 * the matching type, which is why neither is destructured in the component
 * below — destructuring would sever the discriminant from the value.
 */
type TimelineEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  tripId: number;
  locations: Location[];
  tripTimezone?: string | null;
} & (
  | { itemType: "activity"; itemData: Activity }
  | { itemType: "transportation"; itemData: Transportation }
  | { itemType: "lodging"; itemData: Lodging }
  | { itemType: "journal"; itemData: JournalEntry }
);

export default function TimelineEditModal(props: TimelineEditModalProps) {
  // itemType/itemData stay on `props` so switching on the former narrows the
  // latter; the rest are plain values and read better destructured.
  const { isOpen, onClose, onSave, tripId, locations, tripTimezone } = props;
  const { itemType } = props;
  const [saving, setSaving] = useState(false);
  const [activityCategories, setActivityCategories] = useState<
    ActivityCategory[]
  >([]);
  const [showLocationQuickAdd, setShowLocationQuickAdd] = useState(false);
  const [localLocations, setLocalLocations] = useState<Location[]>(locations);
  // Track original location ID to detect changes (for entity linking)
  const [originalActivityLocationId, setOriginalActivityLocationId] = useState<
    number | null
  >(null);
  // True when the stay being edited already has an address saved on it.
  const [hadLodgingAddress, setHadLodgingAddress] = useState(false);
  const [originalLodgingLocationId, setOriginalLodgingLocationId] = useState<
    number | null
  >(null);
  const invalidateEntityLinks = useInvalidateEntityLinks();
  const resolveTz = useTimezoneResolver();

  // Each schedule pair suggests the missing half an hour away from the half just set,
  // without overwriting anything the user typed. Activities and transportation get
  // their own tracker since either can be the item under edit.
  const {
    deriveEnd: deriveActivityEnd,
    deriveStart: deriveActivityStart,
    setAutoFilled: setActivityAutoFilled,
  } = useTimeRangeDefaults();
  const {
    deriveEnd: deriveArrival,
    deriveStart: deriveDeparture,
    setAutoFilled: setTransportationAutoFilled,
  } = useTimeRangeDefaults();

  // Activity form state
  const [activityForm, setActivityForm] = useState<ActivityFormState>({
    name: "",
    description: "",
    category: "",
    locationId: undefined,
    parentId: undefined,
    allDay: false,
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    timezone: "",
    cost: "",
    currency: "USD",
    bookingUrl: "",
    bookingReference: "",
    notes: "",
  });

  // Transportation form state
  const [transportationForm, setTransportationForm] =
    useState<TransportationFormState>({
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
    });

  // Lodging form state
  const [lodgingForm, setLodgingForm] = useState<LodgingFormState>({
    type: "hotel",
    name: "",
    locationId: undefined,
    address: "",
    checkInDate: "",
    checkOutDate: "",
    timezone: "",
    confirmationNumber: "",
    bookingUrl: "",
    cost: "",
    currency: "USD",
    notes: "",
  });

  // Journal form state
  // Note: Linking to activities, lodging, transportation now uses the unified EntityLink system
  // Users should use the Link button (🔗) on the timeline after saving
  const [journalForm, setJournalForm] = useState({
    title: "",
    content: "",
    entryDate: "",
  });

  // Sync local locations with prop
  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  // The form initializers below are memoized and the effects that call them
  // are declared after their definitions, so the dependency arrays can name
  // them honestly instead of silencing exhaustive-deps.
  const loadUserCategories = useCallback(async () => {
    try {
      const user = await userService.getMe();
      setActivityCategories(user.activityCategories || []);
    } catch {
      console.error("Failed to load activity categories");
    }
  }, []);

  const initActivityForm = useCallback(
    async (activity: Activity) => {
      const effectiveTz = resolveTz(activity.timezone, tripTimezone);

      let startDate = "";
      let startTime = "";
      let endDate = "";
      let endTime = "";

      if (activity.allDay) {
        if (activity.startTime) {
          const startDateTime = convertISOToDateTimeLocal(
            activity.startTime,
            effectiveTz,
          );
          startDate = startDateTime.slice(0, 10);
        }
        if (activity.endTime) {
          const endDateTime = convertISOToDateTimeLocal(
            activity.endTime,
            effectiveTz,
          );
          endDate = endDateTime.slice(0, 10);
        }
      } else {
        if (activity.startTime) {
          const startDateTime = convertISOToDateTimeLocal(
            activity.startTime,
            effectiveTz,
          );
          startDate = startDateTime.slice(0, 10);
          startTime = startDateTime.slice(11);
        }
        if (activity.endTime) {
          const endDateTime = convertISOToDateTimeLocal(
            activity.endTime,
            effectiveTz,
          );
          endDate = endDateTime.slice(0, 10);
          endTime = endDateTime.slice(11);
        }
      }

      // Fetch linked location via entity linking system
      let linkedLocationId: number | undefined = undefined;
      try {
        const links = await entityLinkService.getLinksFrom(
          tripId,
          "ACTIVITY",
          activity.id,
          "LOCATION",
        );
        if (links.length > 0 && links[0].targetId) {
          linkedLocationId = links[0].targetId;
          setOriginalActivityLocationId(links[0].targetId);
        } else {
          setOriginalActivityLocationId(null);
        }
      } catch {
        // If fetching links fails, proceed without location
        setOriginalActivityLocationId(null);
      }

      // A saved activity's times are the user's; only a still-empty side gets filled in.
      setActivityAutoFilled({ start: false, end: false });

      setActivityForm({
        name: activity.name,
        description: activity.description || "",
        category: activity.category || "",
        locationId: linkedLocationId,
        parentId: activity.parentId || undefined,
        allDay: activity.allDay,
        startDate,
        startTime,
        endDate,
        endTime,
        timezone: activity.timezone || "",
        cost: activity.cost?.toString() || "",
        currency: activity.currency || "USD",
        bookingUrl: activity.bookingUrl || "",
        bookingReference: activity.bookingReference || "",
        notes: activity.notes || "",
      });
    },
    [tripId, tripTimezone, resolveTz, setActivityAutoFilled],
  );

  const initTransportationForm = useCallback(
    (transportation: Transportation) => {
      const effectiveStartTz =
        resolveTz(transportation.startTimezone, tripTimezone);
      const effectiveEndTz =
        resolveTz(transportation.endTimezone, tripTimezone);

      // A saved leg's times are the user's; only a still-empty side gets filled in.
      setTransportationAutoFilled({ start: false, end: false });

      setTransportationForm({
        type: transportation.type,
        fromLocationId: transportation.fromLocationId || undefined,
        toLocationId: transportation.toLocationId || undefined,
        fromLocationName: transportation.fromLocationName || "",
        toLocationName: transportation.toLocationName || "",
        departureTime: transportation.departureTime
          ? convertISOToDateTimeLocal(
              transportation.departureTime,
              effectiveStartTz,
            )
          : "",
        arrivalTime: transportation.arrivalTime
          ? convertISOToDateTimeLocal(
              transportation.arrivalTime,
              effectiveEndTz,
            )
          : "",
        startTimezone: transportation.startTimezone || "",
        endTimezone: transportation.endTimezone || "",
        carrier: transportation.carrier || "",
        vehicleNumber: transportation.vehicleNumber || "",
        confirmationNumber: transportation.confirmationNumber || "",
        cost: transportation.cost?.toString() || "",
        currency: transportation.currency || "USD",
        notes: transportation.notes || "",
      });
    },
    [tripTimezone, resolveTz, setTransportationAutoFilled],
  );

  const initLodgingForm = useCallback(
    async (lodging: Lodging) => {
      const effectiveTz = resolveTz(lodging.timezone, tripTimezone);

      // Fetch linked location via entity linking system
      let linkedLocationId: number | undefined = undefined;
      try {
        const links = await entityLinkService.getLinksFrom(
          tripId,
          "LODGING",
          lodging.id,
          "LOCATION",
        );
        if (links.length > 0 && links[0].targetId) {
          linkedLocationId = links[0].targetId;
          setOriginalLodgingLocationId(links[0].targetId);
        } else {
          setOriginalLodgingLocationId(null);
        }
      } catch {
        // If fetching links fails, proceed without location
        setOriginalLodgingLocationId(null);
      }

      setHadLodgingAddress(!!lodging.address);
      setLodgingForm({
        type: lodging.type,
        name: lodging.name,
        locationId: linkedLocationId,
        address: lodging.address || "",
        checkInDate: lodging.checkInDate
          ? convertISOToDateTimeLocal(lodging.checkInDate, effectiveTz)
          : "",
        checkOutDate: lodging.checkOutDate
          ? convertISOToDateTimeLocal(lodging.checkOutDate, effectiveTz)
          : "",
        timezone: lodging.timezone || "",
        confirmationNumber: lodging.confirmationNumber || "",
        bookingUrl: lodging.bookingUrl || "",
        cost: lodging.cost?.toString() || "",
        currency: lodging.currency || "USD",
        notes: lodging.notes || "",
      });
    },
    [tripId, tripTimezone, resolveTz],
  );

  // Start and end each offer the other a default an hour away, but only while that
  // other side is still empty or holds a value this modal suggested.
  const applyActivityStartChange = useCallback(
    (next: DateTimeParts) => {
      setActivityForm((prev) => {
        const derived = deriveActivityEnd(next, {
          date: prev.endDate,
          time: prev.endTime,
        });
        return {
          ...prev,
          startDate: next.date,
          startTime: next.time,
          ...(derived ? { endDate: derived.date, endTime: derived.time } : {}),
        };
      });
    },
    [deriveActivityEnd],
  );

  const applyActivityEndChange = useCallback(
    (next: DateTimeParts) => {
      setActivityForm((prev) => {
        const derived = deriveActivityStart(next, {
          date: prev.startDate,
          time: prev.startTime,
        });
        return {
          ...prev,
          endDate: next.date,
          endTime: next.time,
          ...(derived ? { startDate: derived.date, startTime: derived.time } : {}),
        };
      });
    },
    [deriveActivityStart],
  );

  const applyDepartureChange = useCallback(
    (value: string) => {
      setTransportationForm((prev) => {
        const derived = deriveArrival(
          splitDateTimeLocal(value),
          splitDateTimeLocal(prev.arrivalTime),
        );
        const arrivalTime = derived ? joinDateTimeLocal(derived) : "";
        return {
          ...prev,
          departureTime: value,
          ...(arrivalTime ? { arrivalTime } : {}),
        };
      });
    },
    [deriveArrival],
  );

  const applyArrivalChange = useCallback(
    (value: string) => {
      setTransportationForm((prev) => {
        const derived = deriveDeparture(
          splitDateTimeLocal(value),
          splitDateTimeLocal(prev.departureTime),
        );
        const departureTime = derived ? joinDateTimeLocal(derived) : "";
        return {
          ...prev,
          arrivalTime: value,
          ...(departureTime ? { departureTime } : {}),
        };
      });
    },
    [deriveDeparture],
  );

  const initJournalForm = useCallback((entry: JournalEntry) => {
    setJournalForm({
      title: entry.title || "",
      content: entry.content,
      // A journal entry's date is a calendar day (`@db.Date`), so keep it as
      // YYYY-MM-DD rather than routing it through a UTC datetime.
      entryDate: entry.date ? extractDatePortion(entry.date) : "",
    });
  }, []);

  // Load user categories for activities
  useEffect(() => {
    if (itemType === "activity") {
      loadUserCategories();
    }
  }, [itemType, loadUserCategories]);

  // Initialize form based on item type and data
  useEffect(() => {
    if (!isOpen || !props.itemData) return;

    switch (props.itemType) {
      case "activity":
        initActivityForm(props.itemData);
        break;
      case "transportation":
        initTransportationForm(props.itemData);
        break;
      case "lodging":
        initLodgingForm(props.itemData);
        break;
      case "journal":
        initJournalForm(props.itemData);
        break;
    }
  }, [
    isOpen,
    props.itemType,
    props.itemData,
    initActivityForm,
    initTransportationForm,
    initLodgingForm,
    initJournalForm,
  ]);

  const handleLocationCreated = (locationId: number, locationName: string) => {
    const newLocation = createLocationStub(locationId, locationName, tripId);
    setLocalLocations([...localLocations, newLocation]);

    if (itemType === "activity") {
      setActivityForm((prev) => ({ ...prev, locationId }));
    } else if (itemType === "lodging") {
      setLodgingForm((prev) => ({ ...prev, locationId }));
    }
    setShowLocationQuickAdd(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      switch (itemType) {
        case "activity":
          await submitActivity();
          break;
        case "transportation":
          await submitTransportation();
          break;
        case "lodging":
          await submitLodging();
          break;
        case "journal":
          await submitJournal();
          break;
      }
      toast.success(`${getItemTypeLabel()} updated successfully`);
      onSave();
      onClose();
    } catch (error) {
      console.error("Failed to update:", error);
      toast.error(`Failed to update ${getItemTypeLabel().toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const submitActivity = async () => {
    if (!activityForm.name.trim()) {
      throw new Error("Name is required");
    }

    const effectiveTz = resolveTz(activityForm.timezone, tripTimezone);
    let startTimeISO: string | null = null;
    let endTimeISO: string | null = null;

    if (activityForm.allDay) {
      if (activityForm.startDate) {
        const dateTimeLocal = `${activityForm.startDate}T00:00`;
        startTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
      }
      if (activityForm.endDate) {
        const dateTimeLocal = `${activityForm.endDate}T23:59`;
        endTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
      }
    } else {
      if (activityForm.startDate && activityForm.startTime) {
        const dateTimeLocal = `${activityForm.startDate}T${activityForm.startTime}`;
        startTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
      }
      if (activityForm.endDate && activityForm.endTime) {
        const dateTimeLocal = `${activityForm.endDate}T${activityForm.endTime}`;
        endTimeISO = convertDateTimeLocalToISO(dateTimeLocal, effectiveTz);
      }
    }

    // Update activity data (without locationId - using entity links)
    const updateData = {
      name: activityForm.name,
      description: activityForm.description || null,
      category: activityForm.category || null,
      parentId: activityForm.parentId || null,
      allDay: activityForm.allDay,
      startTime: startTimeISO,
      endTime: endTimeISO,
      timezone: activityForm.timezone || null,
      cost: activityForm.cost ? parseFloat(activityForm.cost) : null,
      currency: activityForm.currency || null,
      bookingUrl: activityForm.bookingUrl || null,
      bookingReference: activityForm.bookingReference || null,
      notes: activityForm.notes || null,
    };

    await activityService.updateActivity(props.itemData.id, updateData);

    // Handle location link changes via entity linking
    const newLocationId = activityForm.locationId || null;
    const locationChanged = newLocationId !== originalActivityLocationId;

    if (locationChanged) {
      try {
        // Remove old link if there was one
        if (originalActivityLocationId) {
          await entityLinkService.deleteLink(tripId, {
            sourceType: "ACTIVITY",
            sourceId: props.itemData.id,
            targetType: "LOCATION",
            targetId: originalActivityLocationId,
          });
        }
        // Create new link if there's a new location
        if (newLocationId) {
          await entityLinkService.createLink(tripId, {
            sourceType: "ACTIVITY",
            sourceId: props.itemData.id,
            targetType: "LOCATION",
            targetId: newLocationId,
          });
        }
        invalidateEntityLinks(tripId);
      } catch (error) {
        console.error("Failed to update location link:", error);
        toast.error("Activity saved but failed to update location link");
      }
    }
  };

  const submitTransportation = async () => {
    const effectiveStartTz =
      resolveTz(transportationForm.startTimezone, tripTimezone);
    const effectiveEndTz =
      resolveTz(transportationForm.endTimezone, tripTimezone);

    const departureTimeISO = transportationForm.departureTime
      ? convertDateTimeLocalToISO(
          transportationForm.departureTime,
          effectiveStartTz,
        )
      : null;
    const arrivalTimeISO = transportationForm.arrivalTime
      ? convertDateTimeLocalToISO(
          transportationForm.arrivalTime,
          effectiveEndTz,
        )
      : null;

    const updateData = {
      type: transportationForm.type,
      fromLocationId: transportationForm.fromLocationId || null,
      toLocationId: transportationForm.toLocationId || null,
      fromLocationName: transportationForm.fromLocationName || null,
      toLocationName: transportationForm.toLocationName || null,
      departureTime: departureTimeISO,
      arrivalTime: arrivalTimeISO,
      startTimezone: transportationForm.startTimezone || null,
      endTimezone: transportationForm.endTimezone || null,
      carrier: transportationForm.carrier || null,
      vehicleNumber: transportationForm.vehicleNumber || null,
      confirmationNumber: transportationForm.confirmationNumber || null,
      cost: transportationForm.cost
        ? parseFloat(transportationForm.cost)
        : null,
      currency: transportationForm.currency || null,
      notes: transportationForm.notes || null,
    };

    await transportationService.updateTransportation(
      props.itemData.id,
      updateData,
    );
  };

  const submitLodging = async () => {
    if (!lodgingForm.name.trim()) {
      throw new Error("Name is required");
    }
    if (!lodgingForm.checkInDate) {
      throw new Error("Check-in date is required");
    }
    if (!lodgingForm.checkOutDate) {
      throw new Error("Check-out date is required");
    }

    const effectiveTz = resolveTz(lodgingForm.timezone, tripTimezone);
    const checkInDateISO = convertDateTimeLocalToISO(
      lodgingForm.checkInDate,
      effectiveTz,
    );
    const checkOutDateISO = convertDateTimeLocalToISO(
      lodgingForm.checkOutDate,
      effectiveTz,
    );

    // Update lodging data (without locationId - using entity links)
    const updateData = {
      type: lodgingForm.type,
      name: lodgingForm.name,
      address: lodgingForm.address || null,
      checkInDate: checkInDateISO,
      checkOutDate: checkOutDateISO,
      timezone: lodgingForm.timezone || null,
      confirmationNumber: lodgingForm.confirmationNumber || null,
      bookingUrl: lodgingForm.bookingUrl || null,
      cost: lodgingForm.cost ? parseFloat(lodgingForm.cost) : null,
      currency: lodgingForm.currency || null,
      notes: lodgingForm.notes || null,
    };

    await lodgingService.updateLodging(props.itemData.id, updateData);

    // Handle location link changes via entity linking
    const newLocationId = lodgingForm.locationId || null;
    const locationChanged = newLocationId !== originalLodgingLocationId;

    if (locationChanged) {
      try {
        // Remove old link if there was one
        if (originalLodgingLocationId) {
          await entityLinkService.deleteLink(tripId, {
            sourceType: "LODGING",
            sourceId: props.itemData.id,
            targetType: "LOCATION",
            targetId: originalLodgingLocationId,
          });
        }
        // Create new link if there's a new location
        if (newLocationId) {
          await entityLinkService.createLink(tripId, {
            sourceType: "LODGING",
            sourceId: props.itemData.id,
            targetType: "LOCATION",
            targetId: newLocationId,
          });
        }
        invalidateEntityLinks(tripId);
      } catch (error) {
        console.error("Failed to update location link:", error);
        toast.error("Lodging saved but failed to update location link");
      }
    }
  };

  const submitJournal = async () => {
    if (!journalForm.title.trim() || !journalForm.content.trim()) {
      throw new Error("Title and content are required");
    }

    // Note: Linking to other entities now uses the unified EntityLink system
    // Users should use the Link button (🔗) on the timeline after saving
    const updateData = {
      title: journalForm.title,
      content: journalForm.content,
      entryDate: journalForm.entryDate || null,
    };

    await journalEntryService.updateJournalEntry(props.itemData.id, updateData);
  };

  const getItemTypeLabel = () => {
    switch (itemType) {
      case "activity":
        return "Activity";
      case "transportation":
        return "Transportation";
      case "lodging":
        return "Lodging";
      case "journal":
        return "Journal Entry";
    }
  };

  const getItemTypeIcon = () => {
    switch (itemType) {
      case "activity":
        return "🎯";
      case "transportation":
        return "🚀";
      case "lodging":
        return "🏨";
      case "journal":
        return "📔";
    }
  };

  const renderActivityForm = () => (
    <>
      {/* Name and Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Name *
          </label>
          <input
            type="text"
            value={activityForm.name}
            onChange={(e) =>
              setActivityForm((prev) => ({ ...prev, name: e.target.value }))
            }
            className="input"
            required
            placeholder="Activity name"
          />
        </div>

        <div>
          <label
            htmlFor="activity-category"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Category
          </label>
          <select
            id="activity-category"
            value={activityForm.category}
            onChange={(e) =>
              setActivityForm((prev) => ({ ...prev, category: e.target.value }))
            }
            className="input"
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

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Description
        </label>
        <textarea
          value={activityForm.description}
          onChange={(e) =>
            setActivityForm((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
          className="input"
          rows={2}
          placeholder="Activity description"
        />
      </div>

      {/* Location */}
      <div>
        <label
          htmlFor="activity-location"
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          Location
        </label>
        {showLocationQuickAdd ? (
          <LocationQuickAdd
            tripId={tripId}
            onLocationCreated={handleLocationCreated}
            onCancel={() => setShowLocationQuickAdd(false)}
          />
        ) : (
          <div className="flex gap-2">
            <select
              id="activity-location"
              value={activityForm.locationId || ""}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  locationId: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                }))
              }
              className="input flex-1"
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
            >
              + New
            </button>
          </div>
        )}
      </div>

      {/* All Day Toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allDay"
          checked={activityForm.allDay}
          onChange={(e) =>
            setActivityForm((prev) => ({ ...prev, allDay: e.target.checked }))
          }
          className="rounded"
        />
        <label
          htmlFor="allDay"
          className="text-sm font-medium text-gray-700 dark:text-dusk-300"
        >
          All-day activity
        </label>
      </div>

      {/* Date/Time Fields */}
      {activityForm.allDay ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="activity-start-date-allday"
              className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
            >
              Start Date
            </label>
            <input
              id="activity-start-date-allday"
              type="date"
              value={activityForm.startDate}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                  endDate:
                    e.target.value && !prev.endDate
                      ? e.target.value
                      : prev.endDate,
                }))
              }
              className="input"
            />
          </div>
          <div>
            <label
              htmlFor="activity-end-date-allday"
              className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
            >
              End Date
            </label>
            <input
              id="activity-end-date-allday"
              type="date"
              value={activityForm.endDate}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                  startDate:
                    e.target.value && !prev.startDate
                      ? e.target.value
                      : prev.startDate,
                }))
              }
              className="input"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
              Start Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                aria-label="Start date"
                value={activityForm.startDate}
                onChange={(e) =>
                  applyActivityStartChange({
                    date: e.target.value,
                    time: activityForm.startTime,
                  })
                }
                className="input flex-1"
              />
              <input
                type="time"
                aria-label="Start time"
                value={activityForm.startTime}
                onChange={(e) =>
                  applyActivityStartChange({
                    date: activityForm.startDate,
                    time: e.target.value,
                  })
                }
                className="input flex-1"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
              End Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                aria-label="End date"
                value={activityForm.endDate}
                onChange={(e) =>
                  applyActivityEndChange({
                    date: e.target.value,
                    time: activityForm.endTime,
                  })
                }
                className="input flex-1"
              />
              <input
                type="time"
                aria-label="End time"
                value={activityForm.endTime}
                onChange={(e) =>
                  applyActivityEndChange({
                    date: activityForm.endDate,
                    time: e.target.value,
                  })
                }
                className="input flex-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Timezone */}
      <TimezoneSelect
        value={activityForm.timezone}
        onChange={(value) =>
          setActivityForm((prev) => ({ ...prev, timezone: value }))
        }
        label="Timezone"
      />

      {/* Booking Fields */}
      <BookingFields
        confirmationNumber={activityForm.bookingReference}
        bookingUrl={activityForm.bookingUrl}
        onConfirmationNumberChange={(value) =>
          setActivityForm((prev) => ({ ...prev, bookingReference: value }))
        }
        onBookingUrlChange={(value) =>
          setActivityForm((prev) => ({ ...prev, bookingUrl: value }))
        }
        confirmationLabel="Booking Reference"
      />

      {/* Cost */}
      <CostCurrencyFields
        cost={activityForm.cost}
        currency={activityForm.currency}
        onCostChange={(value) =>
          setActivityForm((prev) => ({ ...prev, cost: value }))
        }
        onCurrencyChange={(value) =>
          setActivityForm((prev) => ({ ...prev, currency: value }))
        }
      />

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Notes
        </label>
        <textarea
          value={activityForm.notes}
          onChange={(e) =>
            setActivityForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="input"
          rows={3}
          placeholder="Additional notes..."
        />
      </div>
    </>
  );

  const renderTransportationForm = () => (
    <>
      {/* Type */}
      <div>
        <label
          htmlFor="transportation-type"
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          Type *
        </label>
        <select
          id="transportation-type"
          value={transportationForm.type}
          onChange={(e) => {
            // A <select> hands back a plain string; narrow it rather than
            // asserting, so an option renamed out from under this stays typed.
            if (!isTransportationType(e.target.value)) return;
            const type = e.target.value;
            setTransportationForm((prev) => ({ ...prev, type }));
          }}
          className="input"
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

      {/* From/To Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="transportation-from-location"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            From Location
          </label>
          <select
            id="transportation-from-location"
            value={transportationForm.fromLocationId || ""}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                fromLocationId: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              }))
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
          <input
            type="text"
            value={transportationForm.fromLocationName}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                fromLocationName: e.target.value,
              }))
            }
            className="input mt-2"
            placeholder="Or enter name (e.g., JFK Airport)"
          />
        </div>
        <div>
          <label
            htmlFor="transportation-to-location"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            To Location
          </label>
          <select
            id="transportation-to-location"
            value={transportationForm.toLocationId || ""}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                toLocationId: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              }))
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
          <input
            type="text"
            value={transportationForm.toLocationName}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                toLocationName: e.target.value,
              }))
            }
            className="input mt-2"
            placeholder="Or enter name (e.g., LAX Airport)"
          />
        </div>
      </div>

      {/* Departure/Arrival Times */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="transportation-departure-time"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Departure Time
          </label>
          <input
            id="transportation-departure-time"
            type="datetime-local"
            value={transportationForm.departureTime}
            onChange={(e) => applyDepartureChange(e.target.value)}
            className="input"
          />
          <TimezoneSelect
            value={transportationForm.startTimezone}
            onChange={(value) =>
              setTransportationForm((prev) => ({
                ...prev,
                startTimezone: value,
              }))
            }
            label="Departure Timezone"
          />
        </div>
        <div>
          <label
            htmlFor="transportation-arrival-time"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Arrival Time
          </label>
          <input
            id="transportation-arrival-time"
            type="datetime-local"
            value={transportationForm.arrivalTime}
            onChange={(e) => applyArrivalChange(e.target.value)}
            className="input"
          />
          <TimezoneSelect
            value={transportationForm.endTimezone}
            onChange={(value) =>
              setTransportationForm((prev) => ({ ...prev, endTimezone: value }))
            }
            label="Arrival Timezone"
          />
        </div>
      </div>

      {/* Carrier and Vehicle Number */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Carrier
          </label>
          <input
            type="text"
            value={transportationForm.carrier}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                carrier: e.target.value,
              }))
            }
            className="input"
            placeholder="e.g., United Airlines"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Vehicle/Flight Number
          </label>
          <input
            type="text"
            value={transportationForm.vehicleNumber}
            onChange={(e) =>
              setTransportationForm((prev) => ({
                ...prev,
                vehicleNumber: e.target.value,
              }))
            }
            className="input"
            placeholder="e.g., UA123"
          />
        </div>
      </div>

      {/* Booking Fields */}
      <BookingFields
        confirmationNumber={transportationForm.confirmationNumber}
        bookingUrl=""
        onConfirmationNumberChange={(value) =>
          setTransportationForm((prev) => ({
            ...prev,
            confirmationNumber: value,
          }))
        }
        onBookingUrlChange={() => {}}
        confirmationLabel="Confirmation Number"
        hideBookingUrl={true}
      />

      {/* Cost */}
      <CostCurrencyFields
        cost={transportationForm.cost}
        currency={transportationForm.currency}
        onCostChange={(value) =>
          setTransportationForm((prev) => ({ ...prev, cost: value }))
        }
        onCurrencyChange={(value) =>
          setTransportationForm((prev) => ({ ...prev, currency: value }))
        }
      />

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Notes
        </label>
        <textarea
          value={transportationForm.notes}
          onChange={(e) =>
            setTransportationForm((prev) => ({
              ...prev,
              notes: e.target.value,
            }))
          }
          className="input"
          rows={3}
          placeholder="Additional notes..."
        />
      </div>
    </>
  );

  const renderLodgingForm = () => (
    <>
      {/* Type and Name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Name *
          </label>
          <input
            type="text"
            value={lodgingForm.name}
            onChange={(e) =>
              setLodgingForm((prev) => ({ ...prev, name: e.target.value }))
            }
            className="input"
            required
            placeholder="Hotel name"
          />
        </div>
        <div>
          <label
            htmlFor="lodging-type"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Type *
          </label>
          <select
            id="lodging-type"
            value={lodgingForm.type}
            onChange={(e) => {
              if (!isLodgingType(e.target.value)) return;
              const type = e.target.value;
              setLodgingForm((prev) => ({ ...prev, type }));
            }}
            className="input"
          >
            <option value="hotel">🏨 Hotel</option>
            <option value="hostel">🏠 Hostel</option>
            <option value="vacation_rental">🏡 Vacation Rental</option>
            <option value="camping">⛺ Camping</option>
            <option value="resort">🏖️ Resort</option>
            <option value="other">🛏️ Other</option>
          </select>
        </div>
      </div>

      {/* Location */}
      <div>
        <label
          htmlFor="lodging-location"
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          Location
        </label>
        {showLocationQuickAdd ? (
          <LocationQuickAdd
            tripId={tripId}
            onLocationCreated={handleLocationCreated}
            onCancel={() => setShowLocationQuickAdd(false)}
          />
        ) : (
          <div className="flex gap-2">
            <select
              id="lodging-location"
              value={lodgingForm.locationId || ""}
              onChange={(e) =>
                setLodgingForm((prev) => ({
                  ...prev,
                  locationId: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                }))
              }
              className="input flex-1"
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
            >
              + New
            </button>
          </div>
        )}
      </div>

      {/* Address is no longer collected here; the linked Place carries it.
          An address saved on an older stay is still shown. */}
      {hadLodgingAddress && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Address
          </label>
          <input
            type="text"
            value={lodgingForm.address}
            onChange={(e) =>
              setLodgingForm((prev) => ({ ...prev, address: e.target.value }))
            }
            className="input"
          />
          <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
            Kept from before. New stays take their address from the linked Place.
          </p>
        </div>
      )}

      {/* Check-in/Check-out */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="lodging-checkin"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Check-in *
          </label>
          <input
            id="lodging-checkin"
            type="datetime-local"
            value={lodgingForm.checkInDate}
            onChange={(e) =>
              setLodgingForm((prev) => ({
                ...prev,
                checkInDate: e.target.value,
                checkOutDate:
                  e.target.value && !prev.checkOutDate
                    ? e.target.value
                    : prev.checkOutDate,
              }))
            }
            className="input"
            required
          />
        </div>
        <div>
          <label
            htmlFor="lodging-checkout"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
          >
            Check-out *
          </label>
          <input
            id="lodging-checkout"
            type="datetime-local"
            value={lodgingForm.checkOutDate}
            onChange={(e) =>
              setLodgingForm((prev) => ({
                ...prev,
                checkOutDate: e.target.value,
                checkInDate:
                  e.target.value && !prev.checkInDate
                    ? e.target.value
                    : prev.checkInDate,
              }))
            }
            className="input"
            required
          />
        </div>
      </div>

      {/* Timezone */}
      <TimezoneSelect
        value={lodgingForm.timezone}
        onChange={(value) =>
          setLodgingForm((prev) => ({ ...prev, timezone: value }))
        }
        label="Timezone"
      />

      {/* Booking Fields */}
      <BookingFields
        confirmationNumber={lodgingForm.confirmationNumber}
        bookingUrl={lodgingForm.bookingUrl}
        onConfirmationNumberChange={(value) =>
          setLodgingForm((prev) => ({ ...prev, confirmationNumber: value }))
        }
        onBookingUrlChange={(value) =>
          setLodgingForm((prev) => ({ ...prev, bookingUrl: value }))
        }
        confirmationLabel="Confirmation Number"
      />

      {/* Cost */}
      <CostCurrencyFields
        cost={lodgingForm.cost}
        currency={lodgingForm.currency}
        onCostChange={(value) =>
          setLodgingForm((prev) => ({ ...prev, cost: value }))
        }
        onCurrencyChange={(value) =>
          setLodgingForm((prev) => ({ ...prev, currency: value }))
        }
      />

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Notes
        </label>
        <textarea
          value={lodgingForm.notes}
          onChange={(e) =>
            setLodgingForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="input"
          rows={3}
          placeholder="Additional notes..."
        />
      </div>
    </>
  );

  const renderJournalForm = () => (
    <>
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Title *
        </label>
        <input
          type="text"
          value={journalForm.title}
          onChange={(e) =>
            setJournalForm((prev) => ({ ...prev, title: e.target.value }))
          }
          className="input"
          placeholder="Day 1 in Paris"
          required
        />
      </div>

      {/* Entry Date */}
      <div>
        <label
          htmlFor="journal-entry-date"
          className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
        >
          Entry Date
        </label>
        <input
          id="journal-entry-date"
          type="date"
          value={journalForm.entryDate}
          onChange={(e) =>
            setJournalForm((prev) => ({ ...prev, entryDate: e.target.value }))
          }
          className="input"
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          Content *
        </label>
        <textarea
          value={journalForm.content}
          onChange={(e) =>
            setJournalForm((prev) => ({ ...prev, content: e.target.value }))
          }
          rows={8}
          className="input font-mono text-sm"
          placeholder="Write your journal entry here..."
          required
        />
        <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
          {journalForm.content.length} characters
        </p>
      </div>

      {/* Linking Info */}
      <div className="border-t border-gray-200 dark:border-dusk-700 pt-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Tip:</strong> After saving, use the Link button (🔗) on the
            timeline to connect this journal entry to locations, activities,
            lodging, transportation, photos, or albums.
          </p>
        </div>
      </div>
    </>
  );

  const renderForm = () => {
    switch (itemType) {
      case "activity":
        return renderActivityForm();
      case "transportation":
        return renderTransportationForm();
      case "lodging":
        return renderLodgingForm();
      case "journal":
        return renderJournalForm();
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${getItemTypeLabel()}`}
      icon={getItemTypeIcon()}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="timeline-edit-form"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      }
    >
      <form
        id="timeline-edit-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {renderForm()}
      </form>
    </FormModal>
  );
}
