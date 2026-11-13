import { useState, useEffect } from "react";
import { Link } from "react-router";
import companionService from "../services/companion.service";
import tripService from "../services/trip.service";
import immichService from "../services/immich.service";
import type { Companion } from "../types/companion";
import type { Trip } from "../types/trip";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import CompanionAvatar from "../components/CompanionAvatar";
import ImmichBrowser from "../components/ImmichBrowser";
import type { ImmichAsset } from "../types/immich";

// Import shared utilities
import { getTripStatusColor } from "../utils/statusColors";
import { formatDate } from "../utils/dateFormat";

// Import reusable components
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState, { EmptyIllustrations } from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { TrashIcon, ChevronRightIcon, PlusIcon } from "../components/icons";
import DietaryTagSelector from "../components/DietaryTagSelector";
import DietaryBadges from "../components/DietaryBadges";

interface CompanionWithTrips extends Companion {
  tripAssignments?: Array<{
    trip: {
      id: number;
      title: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
    };
  }>;
}

let immichConfiguredCache: boolean | null = null;

export default function CompanionsPage() {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [editingCompanion, setEditingCompanion] = useState<Companion | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showTripsModal, setShowTripsModal] = useState(false);
  const [selectedCompanionTrips, setSelectedCompanionTrips] =
    useState<CompanionWithTrips | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [showAddToTripModal, setShowAddToTripModal] = useState(false);
  const [selectedCompanionForTrip, setSelectedCompanionForTrip] =
    useState<Companion | null>(null);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loadingAllTrips, setLoadingAllTrips] = useState(false);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [showImmichBrowser, setShowImmichBrowser] = useState(false);
  const [immichTargetCompanion, setImmichTargetCompanion] = useState<Companion | null>(null);
  const [immichConfigured, setImmichConfigured] = useState(false);

  // Check if Immich is configured (cached per session to avoid repeated API calls)
  useEffect(() => {
    if (immichConfiguredCache !== null) {
      setImmichConfigured(immichConfiguredCache);
      return;
    }
    const checkImmich = async () => {
      try {
        await immichService.getAssets({ take: 1 });
        immichConfiguredCache = true;
        setImmichConfigured(true);
      } catch {
        immichConfiguredCache = false;
        setImmichConfigured(false);
      }
    };
    checkImmich();
  }, []);

  useEffect(() => {
    loadCompanions();
  }, []);

  const loadCompanions = async () => {
    try {
      setLoading(true);
      const allCompanions = await companionService.getCompanionsByUser();
      setCompanions(allCompanions);
    } catch {
      toast.error("Failed to load companions");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await companionService.createCompanion({
        name,
        email: email || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
        dietaryPreferences: dietaryPreferences.length > 0 ? dietaryPreferences : undefined,
      });
      toast.success("Companion created");
      resetForm();
      await loadCompanions();
    } catch {
      toast.error("Failed to create companion");
    }
  };

  const handleUpdateCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompanion) return;

    try {
      await companionService.updateCompanion(editingCompanion.id, {
        name,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
        dietaryPreferences,
      });
      toast.success("Companion updated");
      resetForm();
      loadCompanions();
    } catch {
      toast.error("Failed to update companion");
    }
  };

  const handleDeleteCompanion = async (companionId: number) => {
    const confirmed = await confirm({
      title: "Delete Companion",
      message: "Delete this companion? They will be removed from all trips.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await companionService.deleteCompanion(companionId);
      toast.success("Companion deleted");
      loadCompanions();
    } catch {
      toast.error("Failed to delete companion");
    }
  };

  const startEdit = (companion: Companion) => {
    setEditingCompanion(companion);
    setName(companion.name);
    setEmail(companion.email || "");
    setPhone(companion.phone || "");
    setNotes(companion.notes || "");
    setDietaryPreferences(companion.dietaryPreferences || []);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCompanion(null);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setDietaryPreferences([]);
  };

  const handleShowTrips = async (companionId: number) => {
    try {
      setLoadingTrips(true);
      setShowTripsModal(true);
      const companionWithTrips = (await companionService.getCompanionById(
        companionId
      )) as CompanionWithTrips;
      setSelectedCompanionTrips(companionWithTrips);
    } catch {
      toast.error("Failed to load trips");
      setShowTripsModal(false);
    } finally {
      setLoadingTrips(false);
    }
  };

  const closeTripsModal = () => {
    setShowTripsModal(false);
    setSelectedCompanionTrips(null);
  };

  const handleOpenAddToTrip = async (companion: Companion) => {
    try {
      setLoadingAllTrips(true);
      setShowAddToTripModal(true);
      setSelectedCompanionForTrip(companion);

      // Fetch all trips and companion details to filter out already assigned trips
      const [tripsData, companionWithTrips] = await Promise.all([
        tripService.getTrips({ limit: 1000 }),
        companionService.getCompanionById(
          companion.id
        ) as Promise<CompanionWithTrips>,
      ]);

      // Filter out trips the companion is already assigned to
      const assignedTripIds = new Set(
        companionWithTrips.tripAssignments?.map(
          (assignment) => assignment.trip.id
        ) || []
      );
      const availableTrips = tripsData.trips.filter(
        (trip) => !assignedTripIds.has(trip.id)
      );

      setAllTrips(availableTrips);
    } catch {
      toast.error("Failed to load trips");
      setShowAddToTripModal(false);
    } finally {
      setLoadingAllTrips(false);
    }
  };

  const handleAddToTrip = async (tripId: number) => {
    if (!selectedCompanionForTrip) return;

    try {
      await companionService.linkCompanionToTrip(
        tripId,
        selectedCompanionForTrip.id
      );
      toast.success("Companion added to trip");
      setShowAddToTripModal(false);
      setSelectedCompanionForTrip(null);
      setAllTrips([]);
      // Refresh companions to update counts
      loadCompanions();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (error.response?.data?.message?.includes("already linked")) {
        toast.error("Companion already added to this trip");
      } else {
        toast.error("Failed to add companion to trip");
      }
    }
  };

  const closeAddToTripModal = () => {
    setShowAddToTripModal(false);
    setSelectedCompanionForTrip(null);
    setAllTrips([]);
  };

  const handleOpenImmichBrowser = (companion: Companion) => {
    setImmichTargetCompanion(companion);
    setShowImmichBrowser(true);
  };

  const handleImmichSelect = async (assets: ImmichAsset[]) => {
    if (!immichTargetCompanion || assets.length === 0) return;

    try {
      const updated = await companionService.setImmichAvatar(
        immichTargetCompanion.id,
        assets[0].id
      );
      toast.success("Avatar updated from Immich");
      // Update companion in list
      setCompanions((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, avatarUrl: updated.avatarUrl } : c))
      );
    } catch {
      toast.error("Failed to set avatar");
    }

    setShowImmichBrowser(false);
    setImmichTargetCompanion(null);
  };

  const handleAvatarUpdate = (updated: Companion) => {
    setCompanions((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, avatarUrl: updated.avatarUrl } : c))
    );
  };

  const handleRemoveFromTrip = async (
    tripId: number,
    companionId: number,
    e: React.MouseEvent
  ) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation(); // Stop event bubbling

    const confirmed = await confirm({
      title: "Remove from Trip",
      message: "Remove this companion from the trip?",
      confirmLabel: "Remove",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      await companionService.unlinkCompanionFromTrip(tripId, companionId);
      toast.success("Companion removed from trip");

      // Refresh the companion's trips in the modal
      if (selectedCompanionTrips) {
        const updatedCompanion = (await companionService.getCompanionById(
          companionId
        )) as CompanionWithTrips;
        setSelectedCompanionTrips(updatedCompanion);
      }

      // Refresh companions list to update counts
      loadCompanions();
    } catch {
      toast.error("Failed to remove companion from trip");
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <LoadingSpinner.FullPage message="Loading companions..." />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-8">
      <ConfirmDialogComponent />
      
      <PageHeader
        title="Travel Companions"
        subtitle="Manage your travel companions and add them to trips"
        action={{
          label: showForm ? "Cancel" : "+ Add Companion",
          onClick: () => setShowForm(!showForm),
        }}
      />

      {/* Create/Edit Companion Form */}
      {showForm && (
        <form
          onSubmit={
            editingCompanion ? handleUpdateCompanion : handleCreateCompanion
          }
          className="mb-6 p-6 bg-gray-50 dark:bg-dusk-800 rounded-lg border border-gray-200 dark:border-dusk-700"
        >
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {editingCompanion ? "Edit Companion" : "Add New Companion"}
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="companion-name" className="label">Name *</label>
              <input
                id="companion-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="John Doe"
                maxLength={100}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="companion-email" className="label">Email</label>
                <input
                  id="companion-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label htmlFor="companion-phone" className="label">Phone</label>
                <input
                  id="companion-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  placeholder="+1 (555) 123-4567"
                  maxLength={20}
                />
              </div>
            </div>
            <div>
              <label htmlFor="companion-notes" className="label">Notes</label>
              <textarea
                id="companion-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={3}
                placeholder="Additional information about this companion..."
                maxLength={1000}
              />
            </div>
            <div>
              <label htmlFor="companion-dietary" className="label">Dietary Preferences</label>
              <p className="text-xs text-gray-500 dark:text-dusk-400 mb-2">
                Track dietary restrictions to easily find suitable restaurants when traveling together.
              </p>
              <DietaryTagSelector
                id="companion-dietary"
                selectedTags={dietaryPreferences}
                onChange={setDietaryPreferences}
                compact
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                {editingCompanion ? "Update Companion" : "Create Companion"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Companions List */}
      <div>
        {companions.length === 0 ? (
          <EmptyState
            icon={<EmptyIllustrations.NoCompanions />}
            message="Share the Journey"
            subMessage="Great adventures are even better when shared. Add your travel companions to keep track of who you're exploring the world with - from family and friends to new connections made along the way."
            actionLabel="Add Your First Companion"
            onAction={() => setShowForm(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Sort companions to show "Myself" first */}
            {[...companions]
              .sort((a, b) => {
                if (a.isMyself && !b.isMyself) return -1;
                if (!a.isMyself && b.isMyself) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((companion) => {
                const isExpanded = expandedId === companion.id;
                return (
                  <div
                    key={companion.id}
                    className={`border rounded-lg p-5 hover:shadow-lg transition-shadow relative flex flex-col min-h-[180px] ${
                      companion.isMyself
                        ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-dusk-700 bg-white dark:bg-dusk-800"
                    }`}
                  >
                    {/* Add to Trip button in top right corner */}
                    <button
                      onClick={() => handleOpenAddToTrip(companion)}
                      aria-label={`Add ${companion.name} to trip`}
                      className="absolute top-3 right-3 px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 font-medium transition-colors"
                    >
                      + Add to trip
                    </button>

                    <div className="flex-1 flex flex-col">
                      <div className="flex items-start gap-3 mb-3 pr-20">
                        <CompanionAvatar
                          companion={companion}
                          size="lg"
                          editable
                          onUpdate={handleAvatarUpdate}
                          showImmichOption={immichConfigured}
                          onOpenImmichBrowser={() => handleOpenImmichBrowser(companion)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
                              {companion.name}
                            </h4>
                            {companion.isMyself && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full flex-shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          {companion._count &&
                            companion._count.tripAssignments > 0 && (
                              <button
                                onClick={() => handleShowTrips(companion.id)}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                {companion._count.tripAssignments}{" "}
                                {companion._count.tripAssignments === 1
                                  ? "trip"
                                  : "trips"}
                              </button>
                            )}
                          {companion._count &&
                            companion._count.tripAssignments === 0 && (
                              <p className="text-sm text-gray-500 dark:text-dusk-400">
                                0 trips
                              </p>
                            )}
                          {companion.dietaryPreferences && companion.dietaryPreferences.length > 0 && (
                            <div className="mt-1">
                              <DietaryBadges tags={companion.dietaryPreferences} maxDisplay={3} size="sm" />
                            </div>
                          )}
                        </div>
                      </div>

                      {(companion.email ||
                        companion.phone ||
                        companion.notes) && (
                        <div className="mb-3">
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : companion.id)
                            }
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            {isExpanded ? "↑ Hide details" : "↓ Show details"}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-dusk-700 space-y-2 text-sm">
                              {companion.email && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-dusk-400">
                                    Email:{" "}
                                  </span>
                                  <a
                                    href={`mailto:${companion.email}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                                  >
                                    {companion.email}
                                  </a>
                                </div>
                              )}
                              {companion.phone && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-dusk-400">
                                    Phone:{" "}
                                  </span>
                                  <a
                                    href={`tel:${companion.phone}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {companion.phone}
                                  </a>
                                </div>
                              )}
                              {companion.notes && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-dusk-400 block mb-1">
                                    Notes:
                                  </span>
                                  <p className="text-gray-700 dark:text-dusk-300 whitespace-pre-wrap">
                                    {companion.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mt-auto">
                      <button
                        onClick={() => startEdit(companion)}
                        aria-label={`Edit ${companion.name}`}
                        className="flex-1 px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCompanion(companion.id)}
                        aria-label={`Delete ${companion.name}`}
                        className="flex-1 px-3 py-2 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Trips Modal */}
      <Modal
        isOpen={showTripsModal}
        onClose={closeTripsModal}
        title={`${selectedCompanionTrips?.name}'s Trips`}
        maxWidth="2xl"
        footer={
          <button onClick={closeTripsModal} className="w-full btn btn-secondary">
            Close
          </button>
        }
      >
        {loadingTrips ? (
          <div className="text-center py-8">
            <LoadingSpinner label="Loading trips..." />
          </div>
        ) : selectedCompanionTrips?.tripAssignments &&
          selectedCompanionTrips.tripAssignments.length > 0 ? (
          <div className="space-y-3">
            {selectedCompanionTrips.tripAssignments.map((assignment) => (
              <div
                key={assignment.trip.id}
                className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-dusk-700 rounded-lg border border-gray-200 dark:border-dusk-600"
              >
                {/* Trash icon button on left */}
                <button
                  onClick={(e) =>
                    handleRemoveFromTrip(
                      assignment.trip.id,
                      selectedCompanionTrips.id,
                      e
                    )
                  }
                  className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
                  title="Remove companion from this trip"
                  aria-label="Remove companion from this trip"
                >
                  <TrashIcon />
                </button>

                <Link
                  to={`/trips/${assignment.trip.id}`}
                  onClick={closeTripsModal}
                  className="flex-1 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {assignment.trip.title}
                      </h4>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-dusk-400">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getTripStatusColor(assignment.trip.status)}`}>
                          {assignment.trip.status}
                        </span>
                        {assignment.trip.startDate && (
                          <span>
                            {formatDate(assignment.trip.startDate)}
                            {assignment.trip.endDate &&
                              ` - ${formatDate(assignment.trip.endDate)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState.Compact icon="🏝️" message="No trips found" />
        )}
      </Modal>

      {/* Add to Trip Modal */}
      <Modal
        isOpen={showAddToTripModal}
        onClose={closeAddToTripModal}
        title={`Add ${selectedCompanionForTrip?.name} to Trip`}
        maxWidth="2xl"
        footer={
          <button onClick={closeAddToTripModal} className="w-full btn btn-secondary">
            Cancel
          </button>
        }
      >
        {loadingAllTrips ? (
          <div className="text-center py-8">
            <LoadingSpinner label="Loading available trips..." />
          </div>
        ) : allTrips.length > 0 ? (
          <div className="space-y-3">
            {allTrips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => handleAddToTrip(trip.id)}
                className="w-full text-left p-4 bg-gray-50 dark:bg-dusk-700 rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-600 transition-colors border border-gray-200 dark:border-dusk-600"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {trip.title}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-dusk-400">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTripStatusColor(trip.status)}`}>
                        {trip.status}
                      </span>
                      {trip.startDate && (
                        <span>
                          {formatDate(trip.startDate)}
                          {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <PlusIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 ml-2" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-900 dark:text-white font-semibold mb-1">
              All caught up!
            </p>
            <p className="text-gray-600 dark:text-dusk-400">
              {selectedCompanionForTrip?.name} is already added to all
              your trips
            </p>
          </div>
        )}
      </Modal>

      {/* Immich Browser Modal for Avatar Selection */}
      <Modal
        isOpen={showImmichBrowser}
        onClose={() => {
          setShowImmichBrowser(false);
          setImmichTargetCompanion(null);
        }}
        title="Choose Avatar from Immich"
        maxWidth="6xl"
      >
        <ImmichBrowser
          onSelect={handleImmichSelect}
          onClose={() => {
            setShowImmichBrowser(false);
            setImmichTargetCompanion(null);
          }}
        />
      </Modal>
    </div>
  );
}
