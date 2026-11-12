import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import foodLogService from "../services/foodLog.service";
import photoService from "../services/photo.service";
import immichService from "../services/immich.service";
import activityService from "../services/activity.service";
import locationService from "../services/location.service";
import { FOOD_RATINGS, MAX_FOOD_PHOTOS, type FoodLogEntry } from "../types/foodLog";
import { groupByRestaurant, ratingStars } from "../utils/foodLog";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import EmptyState from "./EmptyState";
import FoodLogPhotoStrip from "./FoodLogPhotoStrip";
import FoodLogThumb from "./FoodLogThumb";
import ImmichBrowser from "./ImmichBrowser";
import type { ImmichAsset } from "../types/immich";
import {
  foodPhotoThumbPath,
  immichAssetPayload,
  immichThumbPath,
} from "../utils/foodLogPhotos";

/**
 * FoodLogManager - dishes eaten on a trip with a 1-5 rating, notes and an
 * "order again" flag. An entry can optionally point at one of the trip's
 * activities or locations; the restaurant name is stored on the entry itself,
 * so it survives if that activity or location is later deleted.
 *
 * Photos: an entry can carry up to MAX_FOOD_PHOTOS photos. They are uploaded as
 * ordinary trip photos (so they also appear in the gallery) and attached to the
 * entry after it is saved. Removing one detaches it; the photo stays in the gallery.
 * Photos can also be picked from Immich (when configured); the server links each
 * one to the trip first. Only still images are accepted, never videos.
 */
interface FoodLogManagerProps {
  tripId: number;
  /** Trip dates, used to pre-filter the Immich browser to the trip. */
  tripStartDate?: string;
  tripEndDate?: string;
  onUpdate?: () => void;
}

interface FormState {
  /** "activity:<id>" | "location:<id>" | "" */
  link: string;
  restaurantName: string;
  dish: string;
  rating: number;
  notes: string;
  orderAgain: boolean;
}

const EMPTY_FORM: FormState = {
  link: "",
  restaurantName: "",
  dish: "",
  rating: 4,
  notes: "",
  orderAgain: false,
};

function linkKeyOf(entry: FoodLogEntry): string {
  if (entry.activityId) return `activity:${entry.activityId}`;
  if (entry.locationId) return `location:${entry.locationId}`;
  return "";
}

export default function FoodLogManager({
  tripId,
  tripStartDate,
  tripEndDate,
  onUpdate,
}: FoodLogManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  // Photo edits are staged until Save so Cancel discards them.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([]);
  const [immichAssets, setImmichAssets] = useState<ImmichAsset[]>([]);
  const [showImmichBrowser, setShowImmichBrowser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["food-log", "trip", tripId],
    queryFn: () => foodLogService.getEntriesByTrip(tripId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", tripId],
    queryFn: () => activityService.getActivitiesByTrip(tripId),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations", tripId],
    queryFn: () => locationService.getLocationsByTrip(tripId),
  });

  const { data: immichSettings } = useQuery({
    queryKey: ["immich", "settings"],
    queryFn: () => immichService.getSettings(),
    staleTime: 5 * 60 * 1000,
  });
  const immichConfigured = immichSettings?.immichConfigured === true;

  const linkOptions = useMemo(
    () => [
      ...activities.map((a) => ({ key: `activity:${a.id}`, label: `Activity: ${a.name}`, name: a.name })),
      ...locations.map((l) => ({ key: `location:${l.id}`, label: `Location: ${l.name}`, name: l.name })),
    ],
    [activities, locations]
  );
  const groups = useMemo(() => groupByRestaurant(entries), [entries]);

  const editingEntry = useMemo(
    () => (editingId ? entries.find((e) => e.id === editingId) ?? null : null),
    [entries, editingId]
  );
  const keptPhotos = useMemo(
    () => (editingEntry?.photos ?? []).filter((p) => !removedPhotoIds.includes(p.id)),
    [editingEntry, removedPhotoIds]
  );
  const photoCount = keptPhotos.length + newFiles.length + immichAssets.length;
  const photoSlotsLeft = MAX_FOOD_PHOTOS - photoCount;

  // Immich assets already on this entry or already picked: hidden in the browser so
  // the same photo cannot be chosen twice.
  const takenAssetIds = useMemo(() => {
    const ids = new Set<string>(immichAssets.map((a) => a.id));
    keptPhotos.forEach((p) => {
      if (p.immichAssetId) ids.add(p.immichAssetId);
    });
    return ids;
  }, [immichAssets, keptPhotos]);

  const handleImmichSelect = async (assets: ImmichAsset[]) => {
    // The browser already hides videos; filter again so a stray one can never be staged.
    const fresh = assets.filter((a) => a.type !== "VIDEO" && !takenAssetIds.has(a.id));
    if (fresh.length > photoSlotsLeft) {
      toast.error(`An entry can have at most ${MAX_FOOD_PHOTOS} photos`);
    }
    setImmichAssets((prev) => [...prev, ...fresh.slice(0, Math.max(photoSlotsLeft, 0))]);
    setShowImmichBrowser(false);
  };

  // Object URLs for the not-yet-uploaded files; revoked when the selection changes.
  const previews = useMemo(
    () => newFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [newFiles]
  );
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    // Reset so choosing the same file again still fires onChange.
    e.target.value = "";
    if (picked.length === 0) return;
    if (picked.length > photoSlotsLeft) {
      toast.error(`An entry can have at most ${MAX_FOOD_PHOTOS} photos`);
    }
    setNewFiles((prev) => [...prev, ...picked.slice(0, Math.max(photoSlotsLeft, 0))]);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["food-log"] });
    onUpdate?.();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setNewFiles([]);
    setRemovedPhotoIds([]);
    setImmichAssets([]);
    setShowImmichBrowser(false);
  };

  const startEdit = (entry: FoodLogEntry) => {
    setEditingId(entry.id);
    setNewFiles([]);
    setRemovedPhotoIds([]);
    setImmichAssets([]);
    setForm({
      link: linkKeyOf(entry),
      restaurantName: entry.restaurantName,
      dish: entry.dish,
      rating: entry.rating,
      notes: entry.notes ?? "",
      orderAgain: entry.orderAgain,
    });
    setShowForm(true);
  };

  const handleLinkChange = (key: string) => {
    const option = linkOptions.find((o) => o.key === key);
    // Pre-fill the restaurant name from the chosen stop, but never overwrite what was typed.
    setForm((prev) => ({
      ...prev,
      link: key,
      restaurantName: prev.restaurantName.trim() || !option ? prev.restaurantName : option.name,
    }));
  };

  /** Applies staged photo removals and uploads; returns how many operations failed. */
  const syncPhotos = async (entryId: number): Promise<number> => {
    let failures = 0;

    for (const photoId of removedPhotoIds) {
      try {
        await foodLogService.removePhoto(tripId, entryId, photoId);
      } catch {
        failures++;
      }
    }

    // Upload one at a time: keeps memory and server load bounded for phone-sized batches.
    const uploadedIds: number[] = [];
    for (const file of newFiles) {
      try {
        const photo = await photoService.uploadPhoto(file, { tripId });
        uploadedIds.push(photo.id);
      } catch {
        failures++;
      }
    }
    if (uploadedIds.length > 0) {
      try {
        await foodLogService.attachPhotos(tripId, entryId, uploadedIds);
      } catch {
        failures += uploadedIds.length;
      }
    }

    if (immichAssets.length > 0) {
      try {
        await foodLogService.attachImmichAssets(
          tripId,
          entryId,
          immichAssets.map(immichAssetPayload)
        );
      } catch {
        failures += immichAssets.length;
      }
    }
    return failures;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const restaurantName = form.restaurantName.trim();
    const dish = form.dish.trim();
    if (!restaurantName || !dish) {
      toast.error("Enter a restaurant and a dish");
      return;
    }
    const [kind, rawId] = form.link.split(":");
    const linkedId = rawId ? Number(rawId) : null;
    const payload = {
      restaurantName,
      dish,
      rating: form.rating,
      notes: form.notes.trim() || null,
      orderAgain: form.orderAgain,
      activityId: kind === "activity" ? linkedId : null,
      locationId: kind === "location" ? linkedId : null,
    };
    setIsSaving(true);
    try {
      const saved = editingId
        ? await foodLogService.updateEntry(tripId, editingId, payload)
        : await foodLogService.createEntry(tripId, payload);

      // The entry is saved at this point; a photo problem must not lose it, so
      // photo failures are reported separately instead of aborting the save.
      const photoFailures = await syncPhotos(saved.id);

      if (photoFailures > 0) {
        toast.error(
          `Saved, but ${photoFailures} photo change${photoFailures === 1 ? "" : "s"} failed. Edit the entry to retry.`
        );
      } else {
        toast.success(editingId ? "Entry updated" : "Dish logged");
      }
      closeForm();
      refresh();
    } catch {
      toast.error("Could not save entry");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (entry: FoodLogEntry) => {
    const confirmed = await confirm({
      title: "Delete Entry",
      message: `Delete "${entry.dish}" at ${entry.restaurantName}?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await foodLogService.deleteEntry(tripId, entry.id);
      toast.success("Entry deleted");
      refresh();
    } catch {
      toast.error("Could not delete entry");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-white">Food Log</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Dishes, ratings and what to order again
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
        >
          {showForm ? "Cancel" : "Log a Dish"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {linkOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="food-link">
                Dining stop (optional)
              </label>
              <select
                id="food-link"
                className="input w-full"
                value={form.link}
                onChange={(e) => handleLinkChange(e.target.value)}
              >
                <option value="">Not linked</option>
                {linkOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="food-restaurant">Restaurant</label>
              <input
                id="food-restaurant"
                className="input w-full"
                maxLength={200}
                value={form.restaurantName}
                onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="food-dish">Dish</label>
              <input
                id="food-dish"
                className="input w-full"
                maxLength={200}
                value={form.dish}
                onChange={(e) => setForm({ ...form, dish: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="food-rating">Rating</label>
              <select
                id="food-rating"
                className="input w-full"
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
              >
                {FOOD_RATINGS.map((r) => (
                  <option key={r} value={r}>{ratingStars(r)} ({r})</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium sm:mt-6">
              <input
                type="checkbox"
                checked={form.orderAgain}
                onChange={(e) => setForm({ ...form, orderAgain: e.target.checked })}
              />
              Would order again
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="food-notes">Notes (optional)</label>
            <textarea
              id="food-notes"
              className="input w-full"
              rows={2}
              maxLength={2000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <span className="block text-sm font-medium mb-1" id="food-photos-label">
              Photos (optional)
            </span>
            {(keptPhotos.length > 0 || previews.length > 0 || immichAssets.length > 0) && (
              <ul className="mb-2 flex flex-wrap gap-2" aria-labelledby="food-photos-label">
                {keptPhotos.map((photo) => {
                  const thumb = foodPhotoThumbPath(photo);
                  return (
                    <li key={`photo-${photo.id}`} className="relative">
                      {thumb ? (
                        <FoodLogThumb
                          thumbnailPath={thumb}
                          source={photo.source}
                          alt={photo.caption || "Attached photo"}
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500">
                          Photo
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemovedPhotoIds((prev) => [...prev, photo.id])}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-sm leading-none shadow"
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
                {previews.map(({ file, url }) => (
                  <li key={`new-${file.name}-${file.size}-${file.lastModified}`} className="relative">
                    <img
                      src={url}
                      alt={`New photo ${file.name}`}
                      className="h-16 w-16 rounded-lg object-cover border-2 border-dashed border-primary-500/50 dark:border-gold/50"
                    />
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((f) => f !== file))}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-sm leading-none shadow"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {immichAssets.map((asset) => (
                  <li key={`immich-${asset.id}`} className="relative">
                    <FoodLogThumb
                      thumbnailPath={immichThumbPath(asset.id)}
                      source="immich"
                      alt={`Immich photo ${asset.originalFileName}`}
                      className="h-16 w-16 rounded-lg object-cover border-2 border-dashed border-primary-500/50 dark:border-gold/50"
                    />
                    <button
                      type="button"
                      onClick={() => setImmichAssets((prev) => prev.filter((a) => a.id !== asset.id))}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-sm leading-none shadow"
                      aria-label={`Remove ${asset.originalFileName}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              id="food-photos"
              aria-labelledby="food-photos-label"
              onChange={handlePickFiles}
              disabled={photoSlotsLeft <= 0 || isSaving}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoSlotsLeft <= 0 || isSaving}
            >
              {photoCount > 0 ? "Add more photos" : "Add photos"}
            </button>
            {immichConfigured && (
              <button
                type="button"
                className="btn-secondary ml-2"
                onClick={() => setShowImmichBrowser(true)}
                disabled={photoSlotsLeft <= 0 || isSaving}
              >
                Add from Immich
              </button>
            )}
            <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
              {photoCount}/{MAX_FOOD_PHOTOS}
            </span>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save Changes" : "Save Dish"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? null : entries.length === 0 ? (
        <EmptyState
          icon="🍽️"
          message="No dishes logged yet"
          subMessage="Rate what you eat so you remember what to order again"
          actionLabel="Log a Dish"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.restaurantName.toLowerCase()}>
              <h3 className="mb-2 flex items-baseline gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                {group.restaurantName}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  avg {group.averageRating.toFixed(1)}
                </span>
              </h3>
              <ul className="space-y-3">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {entry.dish}
                        {entry.orderAgain && (
                          <span className="ml-2 text-xs text-green-600 dark:text-green-400">Order again</span>
                        )}
                      </p>
                      <p className="text-amber-500" aria-label={`${entry.rating} out of 5`}>
                        {ratingStars(entry.rating)}
                      </p>
                      {entry.notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">{entry.notes}</p>
                      )}
                      <FoodLogPhotoStrip photos={entry.photos} label={entry.dish} />
                    </div>
                    <div className="flex shrink-0 gap-3 text-sm">
                      <button type="button" onClick={() => startEdit(entry)} className="text-primary-600 dark:text-gold hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(entry)} className="text-red-600 dark:text-red-400 hover:underline">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {/* Rendered outside the form so none of its buttons can submit the entry. */}
      {showImmichBrowser && (
        <ImmichBrowser
          imagesOnly
          onSelect={handleImmichSelect}
          onClose={() => setShowImmichBrowser(false)}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          excludeAssetIds={takenAssetIds}
        />
      )}
      <ConfirmDialogComponent />
    </div>
  );
}
