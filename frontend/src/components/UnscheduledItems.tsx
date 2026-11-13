import { useState, useEffect, useCallback } from "react";
import type { Activity } from "../types/activity";
import type { Transportation } from "../types/transportation";
import { isTransportationType } from "../types/transportation";
import type { Lodging } from "../types/lodging";
import { isLodgingType } from "../types/lodging";
import type { Location } from "../types/location";
import type { ActivityCategory } from "../types/user";
import activityService from "../services/activity.service";
import transportationService from "../services/transportation.service";
import lodgingService from "../services/lodging.service";
import entityLinkService from "../services/entityLink.service";
import { useInvalidateEntityLinks } from "../hooks/useInvalidateEntityLinks";
import userService from "../services/user.service";
import toast from "react-hot-toast";
import { useFormFields } from "../hooks/useFormFields";
import { useTimeRangeDefaults } from "../hooks/useTimeRangeDefaults";
import type { DateTimeParts } from "../utils/dateTimeDefaults";
import EmptyState from "./EmptyState";
import TimezoneSelect from "./TimezoneSelect";
import LinkedEntitiesDisplay from "./LinkedEntitiesDisplay";
import CostCurrencyFields from "./CostCurrencyFields";
import BookingFields from "./BookingFields";
import FormModal from "./FormModal";
import FormSection from "./FormSection";
import ActivityForm, { type ActivityFormData } from "./forms/ActivityForm";

interface UnscheduledItemsProps {
  tripId: number;
  locations: Location[];
  tripTimezone?: string | null;
  tripStartDate?: string | null;
  onUpdate?: () => void;
}

type EntityType = "activity" | "transportation" | "lodging";

interface TransportationFormFields {
  type: string;
  fromLocationId: number | undefined;
  toLocationId: number | undefined;
  fromLocationName: string;
  toLocationName: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
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

interface LodgingFormFields {
  type: string;
  name: string;
  locationId: number | undefined;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  timezone: string;
  confirmationNumber: string;
  cost: string;
  currency: string;
  bookingUrl: string;
  notes: string;
}

const initialTransportationFormState: TransportationFormFields = {
  type: "flight",
  fromLocationId: undefined,
  toLocationId: undefined,
  fromLocationName: "",
  toLocationName: "",
  departureDate: "",
  departureTime: "",
  arrivalDate: "",
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

const initialLodgingFormState: LodgingFormFields = {
  type: "hotel",
  name: "",
  locationId: undefined,
  address: "",
  checkInDate: "",
  checkOutDate: "",
  timezone: "",
  confirmationNumber: "",
  cost: "",
  currency: "USD",
  bookingUrl: "",
  notes: "",
};

export default function UnscheduledItems({
  tripId,
  locations,
  tripTimezone,
  tripStartDate,
  onUpdate,
}: UnscheduledItemsProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]); // For parent selection
  const [transportation, setTransportation] = useState<Transportation[]>([]);
  const [lodging, setLodging] = useState<Lodging[]>([]);
  const [activityCategories, setActivityCategories] = useState<ActivityCategory[]>([]);
  const [activeSection, setActiveSection] = useState<EntityType>("activity");
  const invalidateEntityLinks = useInvalidateEntityLinks();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<EntityType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Track original lodging location ID when editing to detect changes (for entity linking)
  // True when the stay being edited already has an address saved on it.
  const [hadLodgingAddress, setHadLodgingAddress] = useState(false);
  const [originalLodgingLocationId, setOriginalLodgingLocationId] = useState<number | null>(null);

  // Activity-specific state for shared form
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editingActivityLocationId, setEditingActivityLocationId] = useState<number | null>(null);
  const [originalActivityLocationId, setOriginalActivityLocationId] = useState<number | null>(null);
  const [activityFormKey, setActivityFormKey] = useState(0);

  const transportationForm = useFormFields<TransportationFormFields>(
    initialTransportationFormState
  );
  const lodgingForm = useFormFields<LodgingFormFields>(
    initialLodgingFormState
  );

  // Suggests the missing half of the departure/arrival pair (one hour apart) without
  // overwriting anything the user typed. Activities get this from ActivityForm.
  const {
    deriveEnd: deriveArrival,
    deriveStart: deriveDeparture,
    setAutoFilled: setTransportationAutoFilled,
  } = useTimeRangeDefaults();

  const loadUserCategories = useCallback(async () => {
    try {
      const user = await userService.getMe();
      setActivityCategories(user.activityCategories ?? []);
    } catch {
      console.error("Failed to load activity categories");
    }
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [activitiesData, transportationData, lodgingData] =
        await Promise.all([
          activityService.getActivitiesByTrip(tripId),
          transportationService.getTransportationByTrip(tripId),
          lodgingService.getLodgingByTrip(tripId),
        ]);

      // Store all activities for parent selection
      setAllActivities(activitiesData);

      // Filter for unscheduled activities (no start time and not all day)
      const unscheduled = activitiesData.filter(
        (a) => !a.startTime && !a.allDay
      );
      setActivities(unscheduled);

      // Filter for unscheduled transportation (no departure time)
      const unscheduledTransport = transportationData.filter(
        (t) => !t.departureTime
      );
      setTransportation(unscheduledTransport);

      // Filter for unscheduled lodging (no check-in date)
      const unscheduledLodging = lodgingData.filter((l) => !l.checkInDate);
      setLodging(unscheduledLodging);
    } catch {
      toast.error("Failed to load data");
    }
  }, [tripId]);

  useEffect(() => {
    loadAllData();
    loadUserCategories();
  }, [loadAllData, loadUserCategories]);

  const resetForm = () => {
    transportationForm.reset();
    lodgingForm.reset();
    // A blank form has nothing suggested yet, so neither side is ours to overwrite.
    setTransportationAutoFilled({ start: false, end: false });
    setEditingId(null);
    setEditingType(null);
    setIsCreating(false);
    setShowAddMenu(false);
    setShowFormModal(false);
    setEditingActivity(null);
    setEditingActivityLocationId(null);
    setOriginalActivityLocationId(null);
    setActivityFormKey((k) => k + 1);
  };

  // Departure and arrival each offer the other a default an hour away, but only while
  // that other side is still empty or holds a value this form suggested.
  const applyDepartureChange = (next: DateTimeParts) => {
    transportationForm.handleChange("departureDate", next.date);
    transportationForm.handleChange("departureTime", next.time);

    const derived = deriveArrival(next, {
      date: transportationForm.values.arrivalDate,
      time: transportationForm.values.arrivalTime,
    });
    if (derived) {
      transportationForm.handleChange("arrivalDate", derived.date);
      transportationForm.handleChange("arrivalTime", derived.time);
    }
  };

  const applyArrivalChange = (next: DateTimeParts) => {
    transportationForm.handleChange("arrivalDate", next.date);
    transportationForm.handleChange("arrivalTime", next.time);

    const derived = deriveDeparture(next, {
      date: transportationForm.values.departureDate,
      time: transportationForm.values.departureTime,
    });
    if (derived) {
      transportationForm.handleChange("departureDate", derived.date);
      transportationForm.handleChange("departureTime", derived.time);
    }
  };

  // Start creating a new entity of the specified type
  const handleStartCreate = (type: EntityType) => {
    resetForm();
    setIsCreating(true);
    setEditingType(type);
    setActiveSection(type);
    setShowAddMenu(false);
    setShowFormModal(true);
  };

  const handleEditActivity = async (activity: Activity) => {
    // Fetch linked location via entity linking system
    let locationId: number | null = null;
    try {
      const links = await entityLinkService.getLinksFrom(tripId, 'ACTIVITY', activity.id, 'LOCATION');
      if (links.length > 0 && links[0].targetId) {
        locationId = links[0].targetId;
      }
    } catch {
      // If fetching links fails, proceed without location
    }

    setEditingId(activity.id);
    setEditingType("activity");
    setActiveSection("activity");
    setEditingActivity(activity);
    setEditingActivityLocationId(locationId);
    setOriginalActivityLocationId(locationId);
    setShowFormModal(true);
  };

  const handleActivityFormSubmit = async (data: ActivityFormData, newLocationId: number | null) => {
    setIsSubmitting(true);
    try {
      if (isCreating) {
        // Create the activity
        const createdActivity = await activityService.createActivity({
          tripId,
          name: data.name,
          description: data.description || undefined,
          category: data.category || undefined,
          parentId: data.parentId,
          allDay: data.allDay,
          startTime: data.startTime || undefined,
          endTime: data.endTime || undefined,
          timezone: data.timezone || undefined,
          cost: data.cost || undefined,
          currency: data.currency || undefined,
          bookingUrl: data.bookingUrl || undefined,
          bookingReference: data.bookingReference || undefined,
          notes: data.notes || undefined,
        });
        toast.success("Activity created");

        // Create location link if a location was selected
        if (newLocationId) {
          try {
            await entityLinkService.createLink(tripId, {
              sourceType: 'ACTIVITY',
              sourceId: createdActivity.id,
              targetType: 'LOCATION',
              targetId: newLocationId,
            });
          } catch (linkError) {
            console.error('Failed to create location link:', linkError);
            toast.error('Activity saved but failed to link location');
          }
        }
      } else if (editingId) {
        // Update the activity
        await activityService.updateActivity(editingId, {
          name: data.name,
          description: data.description,
          category: data.category,
          parentId: data.parentId,
          allDay: data.allDay,
          startTime: data.startTime,
          endTime: data.endTime,
          timezone: data.timezone,
          cost: data.cost,
          currency: data.currency,
          bookingUrl: data.bookingUrl,
          bookingReference: data.bookingReference,
          notes: data.notes,
        });
        toast.success("Activity updated");

        // Handle location link changes via entity linking
        const locationChanged = newLocationId !== originalActivityLocationId;
        if (locationChanged) {
          try {
            if (originalActivityLocationId) {
              await entityLinkService.deleteLink(tripId, {
                sourceType: 'ACTIVITY',
                sourceId: editingId,
                targetType: 'LOCATION',
                targetId: originalActivityLocationId,
              });
            }
            if (newLocationId) {
              await entityLinkService.createLink(tripId, {
                sourceType: 'ACTIVITY',
                sourceId: editingId,
                targetType: 'LOCATION',
                targetId: newLocationId,
              });
            }
          } catch (error) {
            console.error('Failed to update location link:', error);
            toast.error('Activity saved but failed to update location link');
          }
        }
      }

      resetForm();
      // The linked location renders this activity in its own Linked Items list.
      invalidateEntityLinks(tripId);
      loadAllData();
      onUpdate?.();
    } catch {
      toast.error("Failed to save activity");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteActivity = async (activityId: number) => {
    if (!window.confirm('Delete this activity? This action cannot be undone.')) {
      return;
    }
    try {
      await activityService.deleteActivity(activityId);
      toast.success('Activity deleted');
      loadAllData();
      onUpdate?.();
    } catch {
      toast.error('Failed to delete activity');
    }
  };

  const handleEditTransportation = (transport: Transportation) => {
    setEditingId(transport.id);
    setEditingType("transportation");
    setActiveSection("transportation");
    // A saved leg's times are the user's; only a still-empty side gets filled in.
    setTransportationAutoFilled({ start: false, end: false });
    transportationForm.handleChange("type", transport.type);
    transportationForm.handleChange(
      "fromLocationId",
      transport.fromLocationId || undefined
    );
    transportationForm.handleChange(
      "toLocationId",
      transport.toLocationId || undefined
    );
    transportationForm.handleChange(
      "fromLocationName",
      transport.fromLocationName || ""
    );
    transportationForm.handleChange(
      "toLocationName",
      transport.toLocationName || ""
    );
    transportationForm.handleChange(
      "startTimezone",
      transport.startTimezone || ""
    );
    transportationForm.handleChange(
      "endTimezone",
      transport.endTimezone || ""
    );
    transportationForm.handleChange("carrier", transport.carrier || "");
    transportationForm.handleChange(
      "vehicleNumber",
      transport.vehicleNumber || ""
    );
    transportationForm.handleChange(
      "confirmationNumber",
      transport.confirmationNumber || ""
    );
    transportationForm.handleChange("cost", transport.cost?.toString() || "");
    transportationForm.handleChange("currency", transport.currency || "USD");
    transportationForm.handleChange("notes", transport.notes || "");

    // Handle date/time fields
    if (transport.departureTime) {
      const dt = new Date(transport.departureTime);
      transportationForm.handleChange(
        "departureDate",
        dt.toISOString().slice(0, 10)
      );
      transportationForm.handleChange(
        "departureTime",
        dt.toISOString().slice(11, 16)
      );
    }
    if (transport.arrivalTime) {
      const dt = new Date(transport.arrivalTime);
      transportationForm.handleChange(
        "arrivalDate",
        dt.toISOString().slice(0, 10)
      );
      transportationForm.handleChange(
        "arrivalTime",
        dt.toISOString().slice(11, 16)
      );
    }

    setShowFormModal(true);
  };

  const handleEditLodging = async (lodgingItem: Lodging) => {
    setEditingId(lodgingItem.id);
    setEditingType("lodging");
    setActiveSection("lodging");
    lodgingForm.handleChange("type", lodgingItem.type);
    lodgingForm.handleChange("name", lodgingItem.name);

    // Fetch linked location via entity linking system
    try {
      const links = await entityLinkService.getLinksFrom(tripId, 'LODGING', lodgingItem.id, 'LOCATION');
      if (links.length > 0 && links[0].targetId) {
        lodgingForm.handleChange("locationId", links[0].targetId);
        setOriginalLodgingLocationId(links[0].targetId);
      } else {
        lodgingForm.handleChange("locationId", undefined);
        setOriginalLodgingLocationId(null);
      }
    } catch {
      // If fetching links fails, proceed without location
      lodgingForm.handleChange("locationId", undefined);
      setOriginalLodgingLocationId(null);
    }

    lodgingForm.handleChange("address", lodgingItem.address || "");
    setHadLodgingAddress(!!lodgingItem.address);
    lodgingForm.handleChange("timezone", lodgingItem.timezone || "");
    lodgingForm.handleChange(
      "confirmationNumber",
      lodgingItem.confirmationNumber || ""
    );
    lodgingForm.handleChange("cost", lodgingItem.cost?.toString() || "");
    lodgingForm.handleChange("currency", lodgingItem.currency || "USD");
    lodgingForm.handleChange("bookingUrl", lodgingItem.bookingUrl || "");
    lodgingForm.handleChange("notes", lodgingItem.notes || "");

    if (lodgingItem.checkInDate) {
      lodgingForm.handleChange(
        "checkInDate",
        new Date(lodgingItem.checkInDate).toISOString().slice(0, 10)
      );
    }
    if (lodgingItem.checkOutDate) {
      lodgingForm.handleChange(
        "checkOutDate",
        new Date(lodgingItem.checkOutDate).toISOString().slice(0, 10)
      );
    }

    setShowFormModal(true);
  };

  const handleSubmitTransportation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isCreating && !editingId) return;

    const transportationType = transportationForm.values.type;
    if (!isTransportationType(transportationType)) {
      toast.error("Please select a valid transportation type");
      return;
    }

    setIsSubmitting(true);
    try {
      let departureTimeISO: string | null = null;
      let arrivalTimeISO: string | null = null;

      if (
        transportationForm.values.departureDate &&
        transportationForm.values.departureTime
      ) {
        departureTimeISO = `${transportationForm.values.departureDate}T${transportationForm.values.departureTime}:00`;
      }
      if (
        transportationForm.values.arrivalDate &&
        transportationForm.values.arrivalTime
      ) {
        arrivalTimeISO = `${transportationForm.values.arrivalDate}T${transportationForm.values.arrivalTime}:00`;
      }

      // The `|| null` on the text fields is deliberate: the form holds "" for an
      // empty input, and the API stores an absent value as null rather than an
      // empty string. `??` would not do this, since "" is neither null nor
      // undefined. The numeric ids use `??` so that a legitimate 0 would survive.
      const updateData = {
        type: transportationType,
        fromLocationId: transportationForm.values.fromLocationId ?? null,
        toLocationId: transportationForm.values.toLocationId ?? null,
        fromLocationName: transportationForm.values.fromLocationName || null,
        toLocationName: transportationForm.values.toLocationName || null,
        departureTime: departureTimeISO,
        arrivalTime: arrivalTimeISO,
        startTimezone: transportationForm.values.startTimezone || null,
        endTimezone: transportationForm.values.endTimezone || null,
        carrier: transportationForm.values.carrier || null,
        vehicleNumber: transportationForm.values.vehicleNumber || null,
        confirmationNumber:
          transportationForm.values.confirmationNumber || null,
        cost: transportationForm.values.cost
          ? parseFloat(transportationForm.values.cost)
          : null,
        currency: transportationForm.values.currency || null,
        notes: transportationForm.values.notes || null,
      };

      if (isCreating) {
        await transportationService.createTransportation({ ...updateData, tripId });
        toast.success("Transportation created");
      } else if (editingId !== null) {
        await transportationService.updateTransportation(editingId, updateData);
        toast.success("Transportation updated");
      }

      resetForm();
      loadAllData();
      onUpdate?.();
    } catch {
      toast.error("Failed to save transportation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitLodging = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lodgingForm.values.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!isCreating && !editingId) return;

    const lodgingType = lodgingForm.values.type;
    if (!isLodgingType(lodgingType)) {
      toast.error("Please select a valid lodging type");
      return;
    }

    setIsSubmitting(true);
    try {
      // Lodging data without locationId (using entity links instead)
      // `|| null` on the text fields is deliberate — see the note in
      // handleSubmitTransportation: "" from an empty input must become null.
      const updateData = {
        type: lodgingType,
        name: lodgingForm.values.name,
        address: lodgingForm.values.address || null,
        checkInDate: lodgingForm.values.checkInDate || null,
        checkOutDate: lodgingForm.values.checkOutDate || null,
        timezone: lodgingForm.values.timezone || null,
        confirmationNumber: lodgingForm.values.confirmationNumber || null,
        cost: lodgingForm.values.cost
          ? parseFloat(lodgingForm.values.cost)
          : null,
        currency: lodgingForm.values.currency || null,
        bookingUrl: lodgingForm.values.bookingUrl || null,
        notes: lodgingForm.values.notes || null,
      };

      const newLocationId = lodgingForm.values.locationId ?? null;

      if (isCreating) {
        // createLodgingSchema declares its optional fields `.optional()` without
        // `.nullable()`, so an explicit null is rejected — omit empty fields
        // instead. Update keeps the nulls, where they mean "clear this field".
        const createdLodging = await lodgingService.createLodging({
          tripId,
          type: updateData.type,
          name: updateData.name,
          address: updateData.address ?? undefined,
          checkInDate: updateData.checkInDate ?? undefined,
          checkOutDate: updateData.checkOutDate ?? undefined,
          timezone: updateData.timezone ?? undefined,
          confirmationNumber: updateData.confirmationNumber ?? undefined,
          cost: updateData.cost ?? undefined,
          currency: updateData.currency ?? undefined,
          bookingUrl: updateData.bookingUrl ?? undefined,
          notes: updateData.notes ?? undefined,
        });
        toast.success("Lodging created");

        // Then create location link if a location was selected
        if (newLocationId) {
          try {
            await entityLinkService.createLink(tripId, {
              sourceType: 'LODGING',
              sourceId: createdLodging.id,
              targetType: 'LOCATION',
              targetId: newLocationId,
            });
          } catch (linkError) {
            console.error('Failed to create location link:', linkError);
            toast.error('Lodging created but failed to link location');
          }
        }
      } else if (editingId !== null) {
        // Update existing lodging
        await lodgingService.updateLodging(editingId, updateData);
        toast.success("Lodging updated");

        // Handle location link changes via entity linking
        const locationChanged = newLocationId !== originalLodgingLocationId;

        if (locationChanged) {
          try {
            // Remove old link if there was one
            if (originalLodgingLocationId) {
              await entityLinkService.deleteLink(tripId, {
                sourceType: 'LODGING',
                sourceId: editingId,
                targetType: 'LOCATION',
                targetId: originalLodgingLocationId,
              });
            }
            // Create new link if there's a new location
            if (newLocationId) {
              await entityLinkService.createLink(tripId, {
                sourceType: 'LODGING',
                sourceId: editingId,
                targetType: 'LOCATION',
                targetId: newLocationId,
              });
            }
          } catch (linkError) {
            console.error('Failed to update location link:', linkError);
            toast.error('Lodging saved but failed to update location link');
          }
        }
      }

      resetForm();
      invalidateEntityLinks(tripId);
      loadAllData();
      onUpdate?.();
    } catch {
      toast.error("Failed to save lodging");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCount = activities.length + transportation.length + lodging.length;

  const transportationTypeLabels: Record<string, string> = {
    flight: "Flight",
    train: "Train",
    bus: "Bus",
    car: "Car",
    ferry: "Ferry",
    bicycle: "Bicycle",
    walk: "Walk",
    other: "Other",
  };

  const lodgingTypeLabels: Record<string, string> = {
    hotel: "Hotel",
    hostel: "Hostel",
    airbnb: "Airbnb",
    vacation_rental: "Vacation Rental",
    camping: "Camping",
    resort: "Resort",
    motel: "Motel",
    bed_and_breakfast: "Bed & Breakfast",
    apartment: "Apartment",
    friends_family: "Friends/Family",
    other: "Other",
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Unscheduled Items
        </h2>

        {/* Add Button */}
        <button
          type="button"
          onClick={() => setShowAddMenu(true)}
          className="btn btn-primary"
        >
          + Add Item
        </button>
      </div>

      {/* Entity Type Chooser Modal */}
      {showAddMenu && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[80] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dusk-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Add New Item
              </h3>
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-dusk-400 dark:hover:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
                Choose the type of item to add:
              </p>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleStartCreate("activity")}
                  className="w-full p-4 text-left rounded-lg border border-gray-200 dark:border-dusk-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">Activity</div>
                      <div className="text-sm text-gray-500 dark:text-dusk-400">Things to do, places to visit</div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleStartCreate("transportation")}
                  className="w-full p-4 text-left rounded-lg border border-gray-200 dark:border-dusk-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✈️</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">Transportation</div>
                      <div className="text-sm text-gray-500 dark:text-dusk-400">Flights, trains, cars, etc.</div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleStartCreate("lodging")}
                  className="w-full p-4 text-left rounded-lg border border-gray-200 dark:border-dusk-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏨</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">Lodging</div>
                      <div className="text-sm text-gray-500 dark:text-dusk-400">Hotels, Airbnb, camping</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-dusk-700">
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                className="w-full btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-600 dark:text-dusk-400">
        Items without scheduled dates/times. Add dates to move them to their
        respective tabs.
      </p>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-dusk-700">
        <button
          onClick={() => setActiveSection("activity")}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeSection === "activity"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-dusk-400 hover:text-gray-900 dark:hover:text-dusk-200"
          }`}
        >
          Activities ({activities.length})
        </button>
        <button
          onClick={() => setActiveSection("transportation")}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeSection === "transportation"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-dusk-400 hover:text-gray-900 dark:hover:text-dusk-200"
          }`}
        >
          Transportation ({transportation.length})
        </button>
        <button
          onClick={() => setActiveSection("lodging")}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeSection === "lodging"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-dusk-400 hover:text-gray-900 dark:hover:text-dusk-200"
          }`}
        >
          Lodging ({lodging.length})
        </button>
      </div>

      {/* Activity Form Modal - Uses shared ActivityForm component */}
      <FormModal
        isOpen={showFormModal && editingType === "activity"}
        onClose={resetForm}
        title={isCreating ? "Add Activity" : "Edit Activity"}
        icon="🎯"
        formId="unscheduled-activity-form"
        footer={
          <>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="unscheduled-activity-form"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : isCreating ? "Add Activity" : "Update Activity"}
            </button>
          </>
        }
      >
        <ActivityForm
          key={activityFormKey}
          formId="unscheduled-activity-form"
          tripId={tripId}
          locations={locations}
          activityCategories={activityCategories}
          tripTimezone={tripTimezone}
          tripStartDate={tripStartDate}
          existingActivities={allActivities}
          editingActivity={editingActivity}
          editingLocationId={editingActivityLocationId}
          onSubmit={handleActivityFormSubmit}
          defaultUnscheduled={true}
          showMoreOptionsDefault={!!editingActivity}
        />
      </FormModal>

      {/* Transportation Form Modal */}
      <FormModal
        isOpen={showFormModal && editingType === "transportation"}
        onClose={resetForm}
        title={isCreating ? "Add Transportation" : "Edit Transportation"}
        icon="✈️"
        formId="transportation-form"
        footer={
          <>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="transportation-form"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : isCreating ? "Add Transportation" : "Update Transportation"}
            </button>
          </>
        }
      >
        <form id="transportation-form" onSubmit={handleSubmitTransportation} className="space-y-6">
          <FormSection title="Type">
            <select
              id="unscheduled-transport-type"
              value={transportationForm.values.type}
              onChange={(e) =>
                transportationForm.handleChange("type", e.target.value)
              }
              className="input"
            >
              {Object.entries(transportationTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormSection>

          <FormSection title="Route">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="unscheduled-transport-from"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  From Location
                </label>
                <select
                  id="unscheduled-transport-from"
                  value={transportationForm.values.fromLocationId || ""}
                  onChange={(e) =>
                    transportationForm.handleChange(
                      "fromLocationId",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  className="input"
                >
                  <option value="">-- Select or enter below --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter location name"
                  aria-label="From location name"
                  value={transportationForm.values.fromLocationName}
                  onChange={(e) =>
                    transportationForm.handleChange(
                      "fromLocationName",
                      e.target.value
                    )
                  }
                  className="input mt-2"
                />
              </div>
              <div>
                <label
                  htmlFor="unscheduled-transport-to"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  To Location
                </label>
                <select
                  id="unscheduled-transport-to"
                  value={transportationForm.values.toLocationId || ""}
                  onChange={(e) =>
                    transportationForm.handleChange(
                      "toLocationId",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  className="input"
                >
                  <option value="">-- Select or enter below --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter location name"
                  aria-label="To location name"
                  value={transportationForm.values.toLocationName}
                  onChange={(e) =>
                    transportationForm.handleChange(
                      "toLocationName",
                      e.target.value
                    )
                  }
                  className="input mt-2"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Schedule">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
                  Departure Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    aria-label="Departure date"
                    value={transportationForm.values.departureDate}
                    onChange={(e) =>
                      applyDepartureChange({
                        date: e.target.value,
                        time: transportationForm.values.departureTime,
                      })
                    }
                    className="input flex-1"
                  />
                  <input
                    type="time"
                    aria-label="Departure time"
                    value={transportationForm.values.departureTime}
                    onChange={(e) =>
                      applyDepartureChange({
                        date: transportationForm.values.departureDate,
                        time: e.target.value,
                      })
                    }
                    className="input flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
                  Arrival Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    aria-label="Arrival date"
                    value={transportationForm.values.arrivalDate}
                    onChange={(e) =>
                      applyArrivalChange({
                        date: e.target.value,
                        time: transportationForm.values.arrivalTime,
                      })
                    }
                    className="input flex-1"
                  />
                  <input
                    type="time"
                    aria-label="Arrival time"
                    value={transportationForm.values.arrivalTime}
                    onChange={(e) =>
                      applyArrivalChange({
                        date: transportationForm.values.arrivalDate,
                        time: e.target.value,
                      })
                    }
                    className="input flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TimezoneSelect
                value={transportationForm.values.startTimezone}
                onChange={(value) =>
                  transportationForm.handleChange("startTimezone", value)
                }
                label="Departure Timezone"
              />
              <TimezoneSelect
                value={transportationForm.values.endTimezone}
                onChange={(value) =>
                  transportationForm.handleChange("endTimezone", value)
                }
                label="Arrival Timezone"
              />
            </div>
          </FormSection>

          <FormSection title="Carrier Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="unscheduled-transport-carrier"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Carrier
                </label>
                <input
                  type="text"
                  id="unscheduled-transport-carrier"
                  value={transportationForm.values.carrier}
                  onChange={(e) =>
                    transportationForm.handleChange("carrier", e.target.value)
                  }
                  className="input"
                  placeholder="e.g., United Airlines"
                />
              </div>
              <div>
                <label
                  htmlFor="unscheduled-transport-vehicle"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Flight/Train/Bus Number
                </label>
                <input
                  type="text"
                  id="unscheduled-transport-vehicle"
                  value={transportationForm.values.vehicleNumber}
                  onChange={(e) =>
                    transportationForm.handleChange(
                      "vehicleNumber",
                      e.target.value
                    )
                  }
                  className="input"
                  placeholder="e.g., UA123"
                />
              </div>
            </div>

            <BookingFields
              confirmationNumber={transportationForm.values.confirmationNumber}
              bookingUrl=""
              onConfirmationNumberChange={(value) =>
                transportationForm.handleChange("confirmationNumber", value)
              }
              onBookingUrlChange={() => {}}
              confirmationLabel="Confirmation Number"
              hideBookingUrl={true}
            />

            <CostCurrencyFields
              cost={transportationForm.values.cost}
              currency={transportationForm.values.currency}
              onCostChange={(value) =>
                transportationForm.handleChange("cost", value)
              }
              onCurrencyChange={(value) =>
                transportationForm.handleChange("currency", value)
              }
            />
          </FormSection>

          <FormSection title="Notes">
            <textarea
              id="unscheduled-transport-notes"
              value={transportationForm.values.notes}
              onChange={(e) =>
                transportationForm.handleChange("notes", e.target.value)
              }
              className="input"
              rows={3}
              placeholder="Additional notes..."
            />
          </FormSection>
        </form>
      </FormModal>

      {/* Lodging Form Modal */}
      <FormModal
        isOpen={showFormModal && editingType === "lodging"}
        onClose={resetForm}
        title={isCreating ? "Add Lodging" : "Edit Lodging"}
        icon="🏨"
        formId="lodging-form"
        footer={
          <>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="lodging-form"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : isCreating ? "Add Lodging" : "Update Lodging"}
            </button>
          </>
        }
      >
        <form id="lodging-form" onSubmit={handleSubmitLodging} className="space-y-6">
          <FormSection title="Basic Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="unscheduled-lodging-name"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Name *
                </label>
                <input
                  type="text"
                  id="unscheduled-lodging-name"
                  value={lodgingForm.values.name}
                  onChange={(e) =>
                    lodgingForm.handleChange("name", e.target.value)
                  }
                  className="input"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="unscheduled-lodging-type"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Type
                </label>
                <select
                  id="unscheduled-lodging-type"
                  value={lodgingForm.values.type}
                  onChange={(e) =>
                    lodgingForm.handleChange("type", e.target.value)
                  }
                  className="input"
                >
                  {Object.entries(lodgingTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="unscheduled-lodging-location"
                className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
              >
                Location
              </label>
              <select
                id="unscheduled-lodging-location"
                value={lodgingForm.values.locationId || ""}
                onChange={(e) =>
                  lodgingForm.handleChange(
                    "locationId",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input"
              >
                <option value="">-- Select Location --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Address is no longer collected here; the linked Place carries
                it. An address saved on an older stay is still shown. */}
            {hadLodgingAddress && (
              <div>
                <label
                  htmlFor="unscheduled-lodging-address"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Address
                </label>
                <input
                  type="text"
                  id="unscheduled-lodging-address"
                  value={lodgingForm.values.address}
                  onChange={(e) =>
                    lodgingForm.handleChange("address", e.target.value)
                  }
                  className="input"
                />
                <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                  Kept from before. New stays take their address from the linked Place.
                </p>
              </div>
            )}
          </FormSection>

          <FormSection title="Schedule">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="unscheduled-lodging-checkin"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Check-in Date
                </label>
                <input
                  type="date"
                  id="unscheduled-lodging-checkin"
                  value={lodgingForm.values.checkInDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    lodgingForm.handleChange("checkInDate", value);
                    if (value && !lodgingForm.values.checkOutDate) {
                      lodgingForm.handleChange("checkOutDate", value);
                    }
                  }}
                  className="input"
                />
              </div>
              <div>
                <label
                  htmlFor="unscheduled-lodging-checkout"
                  className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
                >
                  Check-out Date
                </label>
                <input
                  type="date"
                  id="unscheduled-lodging-checkout"
                  value={lodgingForm.values.checkOutDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    lodgingForm.handleChange("checkOutDate", value);
                    if (value && !lodgingForm.values.checkInDate) {
                      lodgingForm.handleChange("checkInDate", value);
                    }
                  }}
                  className="input"
                />
              </div>
            </div>

            <TimezoneSelect
              value={lodgingForm.values.timezone}
              onChange={(value) => lodgingForm.handleChange("timezone", value)}
              label="Timezone"
            />
          </FormSection>

          <FormSection title="Booking & Cost">
            <BookingFields
              confirmationNumber={lodgingForm.values.confirmationNumber}
              bookingUrl={lodgingForm.values.bookingUrl}
              onConfirmationNumberChange={(value) =>
                lodgingForm.handleChange("confirmationNumber", value)
              }
              onBookingUrlChange={(value) =>
                lodgingForm.handleChange("bookingUrl", value)
              }
              confirmationLabel="Confirmation Number"
            />

            <CostCurrencyFields
              cost={lodgingForm.values.cost}
              currency={lodgingForm.values.currency}
              onCostChange={(value) => lodgingForm.handleChange("cost", value)}
              onCurrencyChange={(value) =>
                lodgingForm.handleChange("currency", value)
              }
            />
          </FormSection>

          <FormSection title="Notes">
            <textarea
              id="unscheduled-lodging-notes"
              value={lodgingForm.values.notes}
              onChange={(e) =>
                lodgingForm.handleChange("notes", e.target.value)
              }
              className="input"
              rows={3}
              placeholder="Additional notes..."
            />
          </FormSection>
        </form>
      </FormModal>

      {/* Items List */}
      <div className="space-y-4">
        {totalCount === 0 ? (
          <EmptyState
            icon="📝"
            message="No unscheduled items"
            subMessage="Items without dates/times will appear here"
          />
        ) : (
          <>
            {/* Activities Section */}
            {activeSection === "activity" &&
              (activities.length === 0 ? (
                <EmptyState
                  icon="🎯"
                  message="No unscheduled activities"
                  subMessage="Activities without dates/times will appear here"
                />
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {activity.category && (
                            <span className="text-xl">
                              {activityCategories.find(
                                (c) => c.name === activity.category
                              )?.emoji || "📍"}
                            </span>
                          )}
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {activity.name}
                          </h3>
                          {activity.category && (
                            <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                              {activity.category}
                            </span>
                          )}
                        </div>

                        {activity.description && (
                          <p className="text-gray-600 dark:text-dusk-400 mb-2">
                            {activity.description}
                          </p>
                        )}

                        <div className="space-y-2 text-sm text-gray-700 dark:text-dusk-300">
                          {activity.bookingReference && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Reference:</span>
                              <span>{activity.bookingReference}</span>
                            </div>
                          )}

                          {activity.bookingUrl && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Booking:</span>
                              <a
                                href={activity.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                              >
                                View Booking
                              </a>
                            </div>
                          )}

                          {activity.cost && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Cost:</span>
                              <span>
                                {activity.currency} {activity.cost}
                              </span>
                            </div>
                          )}

                          {activity.notes && (
                            <div className="mt-2">
                              <span className="font-medium">Notes:</span>
                              <p className="text-gray-600 dark:text-dusk-400 mt-1">
                                {activity.notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Linked entities display */}
                        <LinkedEntitiesDisplay
                          tripId={tripId}
                          entityType="ACTIVITY"
                          entityId={activity.id}
                          compact
                        />
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditActivity(activity)}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
                          title="Edit activity"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteActivity(activity.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                          title="Delete activity"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ))}

            {/* Transportation Section */}
            {activeSection === "transportation" &&
              (transportation.length === 0 ? (
                <EmptyState
                  icon="✈️"
                  message="No unscheduled transportation"
                  subMessage="Transportation without departure times will appear here"
                />
              ) : (
                transportation.map((transport) => (
                  <div
                    key={transport.id}
                    className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {transportationTypeLabels[transport.type] ||
                              transport.type}
                          </h3>
                          <span className="text-sm px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                            {transport.type}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm text-gray-700 dark:text-dusk-300">
                          {(transport.fromLocationName ||
                            transport.fromLocation) && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">From:</span>
                              <span>
                                {transport.fromLocationName ||
                                  transport.fromLocation?.name}
                              </span>
                            </div>
                          )}

                          {(transport.toLocationName || transport.toLocation) && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">To:</span>
                              <span>
                                {transport.toLocationName ||
                                  transport.toLocation?.name}
                              </span>
                            </div>
                          )}

                          {transport.carrier && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Carrier:</span>
                              <span>{transport.carrier}</span>
                            </div>
                          )}

                          {transport.vehicleNumber && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Number:</span>
                              <span>{transport.vehicleNumber}</span>
                            </div>
                          )}

                          {transport.confirmationNumber && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Confirmation:</span>
                              <span>{transport.confirmationNumber}</span>
                            </div>
                          )}

                          {transport.cost && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Cost:</span>
                              <span>
                                {transport.currency} {transport.cost}
                              </span>
                            </div>
                          )}

                          {transport.notes && (
                            <div className="mt-2">
                              <span className="font-medium">Notes:</span>
                              <p className="text-gray-600 dark:text-dusk-400 mt-1">
                                {transport.notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Linked entities display */}
                        <LinkedEntitiesDisplay
                          tripId={tripId}
                          entityType="TRANSPORTATION"
                          entityId={transport.id}
                          compact
                        />
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditTransportation(transport)}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
                          title="Edit transportation"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ))}

            {/* Lodging Section */}
            {activeSection === "lodging" &&
              (lodging.length === 0 ? (
                <EmptyState
                  icon="🏨"
                  message="No unscheduled lodging"
                  subMessage="Lodging without check-in dates will appear here"
                />
              ) : (
                lodging.map((lodgingItem) => (
                  <div
                    key={lodgingItem.id}
                    className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {lodgingItem.name}
                          </h3>
                          <span className="text-sm px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                            {lodgingTypeLabels[lodgingItem.type] ||
                              lodgingItem.type}
                          </span>
                        </div>

                        {/* Note: Location is now shown via EntityLink system */}
                        <div className="space-y-2 text-sm text-gray-700 dark:text-dusk-300">
                          {lodgingItem.address && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Address:</span>
                              <span>{lodgingItem.address}</span>
                            </div>
                          )}

                          {lodgingItem.confirmationNumber && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Confirmation:</span>
                              <span>{lodgingItem.confirmationNumber}</span>
                            </div>
                          )}

                          {lodgingItem.bookingUrl && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Booking:</span>
                              <a
                                href={lodgingItem.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                              >
                                View Booking
                              </a>
                            </div>
                          )}

                          {lodgingItem.cost && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Cost:</span>
                              <span>
                                {lodgingItem.currency} {lodgingItem.cost}
                              </span>
                            </div>
                          )}

                          {lodgingItem.notes && (
                            <div className="mt-2">
                              <span className="font-medium">Notes:</span>
                              <p className="text-gray-600 dark:text-dusk-400 mt-1">
                                {lodgingItem.notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Linked entities display */}
                        <LinkedEntitiesDisplay
                          tripId={tripId}
                          entityType="LODGING"
                          entityId={lodgingItem.id}
                          compact
                        />
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditLodging(lodgingItem)}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
                          title="Edit lodging"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ))}
          </>
        )}
      </div>
    </div>
  );
}
