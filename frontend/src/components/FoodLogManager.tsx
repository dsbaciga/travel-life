import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import foodLogService from "../services/foodLog.service";
import activityService from "../services/activity.service";
import locationService from "../services/location.service";
import { FOOD_RATINGS, type FoodLogEntry } from "../types/foodLog";
import { groupByRestaurant, ratingStars } from "../utils/foodLog";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import EmptyState from "./EmptyState";

/**
 * FoodLogManager - dishes eaten on a trip with a 1-5 rating, notes and an
 * "order again" flag. An entry can optionally point at one of the trip's
 * activities or locations; the restaurant name is stored on the entry itself,
 * so it survives if that activity or location is later deleted.
 */
interface FoodLogManagerProps {
  tripId: number;
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

export default function FoodLogManager({ tripId, onUpdate }: FoodLogManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

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

  const linkOptions = useMemo(
    () => [
      ...activities.map((a) => ({ key: `activity:${a.id}`, label: `Activity: ${a.name}`, name: a.name })),
      ...locations.map((l) => ({ key: `location:${l.id}`, label: `Location: ${l.name}`, name: l.name })),
    ],
    [activities, locations]
  );
  const groups = useMemo(() => groupByRestaurant(entries), [entries]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["food-log"] });
    onUpdate?.();
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (entry: FoodLogEntry) => {
    setEditingId(entry.id);
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
      if (editingId) {
        await foodLogService.updateEntry(tripId, editingId, payload);
        toast.success("Entry updated");
      } else {
        await foodLogService.createEntry(tripId, payload);
        toast.success("Dish logged");
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
      <ConfirmDialogComponent />
    </div>
  );
}
