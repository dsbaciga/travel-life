import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import tripService from "../../services/trip.service";

interface DuplicateOptions {
  locations: boolean;
  photos: boolean;
  activities: boolean;
  transportation: boolean;
  lodging: boolean;
  journalEntries: boolean;
  photoAlbums: boolean;
  tags: boolean;
  companions: boolean;
  checklists: boolean;
}

const DEFAULT_DUPLICATE_OPTIONS: DuplicateOptions = {
  locations: true,
  photos: false,
  activities: true,
  transportation: false,
  lodging: false,
  journalEntries: false,
  photoAlbums: false,
  tags: true,
  companions: true,
  checklists: false,
};

interface DuplicateTripModalProps {
  isOpen: boolean;
  tripId: number;
  tripTitle: string;
  onClose: () => void;
  onDuplicated: (newTripId: number) => void;
}

export default function DuplicateTripModal({
  isOpen,
  tripId,
  tripTitle,
  onClose,
  onDuplicated,
}: DuplicateTripModalProps) {
  const [duplicateTripTitle, setDuplicateTripTitle] = useState(`${tripTitle} (Copy)`);
  const [duplicateOptions, setDuplicateOptions] = useState<DuplicateOptions>(
    DEFAULT_DUPLICATE_OPTIONS
  );

  useEffect(() => {
    if (isOpen) {
      setDuplicateTripTitle(`${tripTitle} (Copy)`);
    }
  }, [isOpen, tripTitle]);

  if (!isOpen) {
    return null;
  }

  const handleDuplicateTrip = async () => {
    if (!duplicateTripTitle.trim()) {
      toast.error("Please enter a title for the duplicated trip");
      return;
    }

    try {
      const duplicatedTrip = await tripService.duplicateTrip(tripId, {
        title: duplicateTripTitle,
        copyEntities: duplicateOptions,
      });
      toast.success("Trip duplicated successfully!");
      onClose();
      onDuplicated(duplicatedTrip.id);
    } catch (error) {
      console.error("Failed to duplicate trip:", error);
      toast.error("Failed to duplicate trip");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-xl border border-primary-100 dark:border-gold/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            Duplicate Trip
          </h2>

          <div className="mb-6">
            <label
              htmlFor="duplicate-trip-title"
              className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2"
            >
              New Trip Title
            </label>
            <input
              id="duplicate-trip-title"
              type="text"
              value={duplicateTripTitle}
              onChange={(e) => setDuplicateTripTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dusk-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-dusk-700 dark:text-white"
              placeholder="Enter title for duplicated trip"
            />
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              Select What to Copy
            </h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.locations}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      locations: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Locations</strong> - All locations and points of interest
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.photos}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      photos: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Photos</strong> - All trip photos (local uploads and Immich references)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.activities}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      activities: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Activities</strong> - Planned and completed activities (dates will be cleared)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.transportation}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      transportation: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Transportation</strong> - Flights, trains, buses (dates will be cleared)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.lodging}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      lodging: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Lodging</strong> - Hotels, Airbnb, camping (dates will be cleared)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.journalEntries}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      journalEntries: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Journal Entries</strong> - All journal entries with their associations
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.photoAlbums}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      photoAlbums: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Photo Albums</strong> - Album organization (requires photos to be copied)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.tags}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      tags: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Tags</strong> - Trip tags and categories
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.companions}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      companions: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Companions</strong> - Travel companions (defaults to "Myself" if unchecked)
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 hover:bg-parchment dark:hover:bg-navy-700 rounded">
                <input
                  type="checkbox"
                  checked={duplicateOptions.checklists}
                  onChange={(e) =>
                    setDuplicateOptions({
                      ...duplicateOptions,
                      checklists: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-dusk-300">
                  <strong>Checklists</strong> - Packing lists and todo items (checked state will be reset)
                </span>
              </label>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Note:</strong> The duplicated trip will have status "Dream" with all dates cleared.
              You can update dates and details after creation.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDuplicateTrip}
              disabled={!duplicateTripTitle.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Duplicate Trip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
