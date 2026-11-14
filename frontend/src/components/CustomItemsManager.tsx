import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import customItemService from "../services/customItem.service";
import locationService from "../services/location.service";
import type { CustomItem } from "../types/customItem";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import BulkActionBar from "./BulkActionBar";
import EmptyState from "./EmptyState";
import LinkButton from "./LinkButton";
import { ListItemSkeleton } from "./SkeletonLoader";
import CustomItemTypeManager from "./CustomItemTypeManager";
import { formatCurrency } from "../utils/formatCurrency";

/**
 * CustomItemsManager handles the trip "Custom" tab.
 *
 * Custom items are the escape hatch for trip content that fits none of the
 * first-class entities — a parking reservation, a rental-agency contact, a
 * reminder. Types are presentation-only and shared across the user's trips;
 * they are managed in the collapsible panel at the top.
 *
 * See docs/development/CUSTOM_ITEM_SPEC.md
 */
interface CustomItemsManagerProps {
  tripId: number;
  tripTimezone?: string | null;
  /** Item id to open for editing, from the ?edit= URL parameter */
  editId?: number | null;
  onUpdate?: () => void;
}

interface ItemFormState {
  typeId: string;
  name: string;
  notes: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
  locationId: string;
  cost: string;
  currency: string;
  url: string;
  confirmationNumber: string;
}

const EMPTY_FORM: ItemFormState = {
  typeId: "",
  name: "",
  notes: "",
  allDay: false,
  startTime: "",
  endTime: "",
  timezone: "",
  locationId: "",
  cost: "",
  currency: "",
  url: "",
  confirmationNumber: "",
};

/** ISO string -> the `datetime-local` input's expected `YYYY-MM-DDTHH:mm`. */
function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function CustomItemsManager({
  tripId,
  tripTimezone,
  editId,
  onUpdate,
}: CustomItemsManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { getLinkSummary } = useTripLinkSummary(tripId);
  const resolveTz = useTimezoneResolver();

  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const bulkSelection = useBulkSelection<CustomItem>();
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["customItems", tripId],
    queryFn: () => customItemService.getCustomItemsByTrip(tripId),
    enabled: !!tripId,
  });

  // The registry is user-level, not trip-level, so it is cached independently.
  const { data: types } = useQuery({
    queryKey: ["customItemTypes"],
    queryFn: () => customItemService.getTypes(),
  });

  const { data: locations } = useQuery({
    queryKey: ["locations", tripId],
    queryFn: () => locationService.getLocationsByTrip(tripId),
    enabled: !!tripId,
  });

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["customItems", tripId] });
    queryClient.invalidateQueries({ queryKey: ["tripLinkSummary", tripId] });
    onUpdate?.();
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const startEdit = (item: CustomItem) => {
    setEditingId(item.id);
    setIsAdding(true);
    setForm({
      typeId: item.typeId != null ? String(item.typeId) : "",
      name: item.name,
      notes: item.notes ?? "",
      allDay: item.allDay,
      startTime: toDateTimeLocal(item.startTime),
      endTime: toDateTimeLocal(item.endTime),
      timezone: item.timezone ?? "",
      locationId: item.locationId != null ? String(item.locationId) : "",
      cost: item.cost != null ? String(item.cost) : "",
      currency: item.currency ?? "",
      url: item.url ?? "",
      confirmationNumber: item.confirmationNumber ?? "",
    });
  };

  // Open the editor when arrived at via ?edit=<id> (timeline/daily-view "Edit").
  useEffect(() => {
    if (editId == null || !items) return;
    const target = items.find((item) => item.id === editId);
    if (target) startEdit(target);
    // Intentionally keyed on editId/items only: startEdit is recreated each
    // render, and including it would reopen the editor mid-edit.
  }, [editId, items]);

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("A name is required");
      return;
    }

    const cost = form.cost.trim() === "" ? null : Number(form.cost);
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
      toast.error("Cost must be a number of 0 or more");
      return;
    }

    const currency = form.currency.trim().toUpperCase();
    if (currency && currency.length !== 3) {
      toast.error("Currency must be a 3-letter code, e.g. USD");
      return;
    }
    // The health check flags this too, but catching it here saves a round trip.
    if (cost !== null && !currency) {
      toast.error("Set a currency so the cost counts towards the trip budget");
      return;
    }

    setSaving(true);
    try {
      // `|| null` rather than `??` throughout: the form holds "" for an empty
      // input and the API must store null, not an empty string.
      if (editingId !== null) {
        await customItemService.updateCustomItem(editingId, {
          typeId: form.typeId ? Number(form.typeId) : null,
          name,
          notes: form.notes.trim() || null,
          allDay: form.allDay,
          startTime: form.startTime ? new Date(form.startTime).toISOString() : null,
          endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
          timezone: form.timezone.trim() || null,
          locationId: form.locationId ? Number(form.locationId) : null,
          cost,
          currency: currency || null,
          url: form.url.trim() || null,
          confirmationNumber: form.confirmationNumber.trim() || null,
        });
        toast.success("Custom item updated");
      } else {
        await customItemService.createCustomItem({
          tripId,
          typeId: form.typeId ? Number(form.typeId) : null,
          name,
          notes: form.notes.trim() || undefined,
          allDay: form.allDay,
          startTime: form.startTime
            ? new Date(form.startTime).toISOString()
            : undefined,
          endTime: form.endTime ? new Date(form.endTime).toISOString() : undefined,
          timezone: form.timezone.trim() || undefined,
          locationId: form.locationId ? Number(form.locationId) : null,
          cost: cost ?? undefined,
          currency: currency || undefined,
          url: form.url.trim() || undefined,
          confirmationNumber: form.confirmationNumber.trim() || undefined,
        });
        toast.success("Custom item saved");
      }
      resetForm();
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save custom item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CustomItem) => {
    const confirmed = await confirm({
      title: "Delete custom item?",
      message: `"${item.name}" will be removed, along with any links to it.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await customItemService.deleteCustomItem(item.id);
      toast.success("Custom item deleted");
      refreshData();
    } catch {
      toast.error("Failed to delete custom item");
    }
  };

  const handleBulkDelete = async () => {
    const ids = bulkSelection.getSelectedIds();
    if (ids.length === 0) return;

    const confirmed = await confirm({
      title: "Delete Custom Items",
      message: `Delete ${ids.length} selected item${ids.length === 1 ? "" : "s"}? Any links to them will be removed too.`,
      confirmLabel: "Delete All",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      const { deletedCount } = await customItemService.bulkDeleteCustomItems(tripId, ids);
      toast.success(`Deleted ${deletedCount} items`);
      bulkSelection.exitSelectionMode();
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete items");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const formatWhen = (item: CustomItem): string => {
    if (!item.startTime) return "Not scheduled";
    const effectiveTz = resolveTz(item.timezone, tripTimezone);
    const date = new Date(item.startTime);
    if (item.allDay) {
      return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: effectiveTz,
      });
    }
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: effectiveTz,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-charcoal dark:text-dusk-100">
            Custom
          </h2>
          <p className="text-sm text-slate dark:text-dusk-400">
            Anything that does not fit the other tabs — reservations, contacts,
            reminders. Scheduled items also appear on the timeline.
          </p>
        </div>
        {!isAdding && (
          <div className="flex items-center gap-2">
            {!!items?.length && !bulkSelection.selectionMode && (
              <button
                type="button"
                className="btn btn-secondary text-sm whitespace-nowrap"
                onClick={bulkSelection.enterSelectionMode}
              >
                Select
              </button>
            )}
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={() => setIsAdding(true)}
            >
              Add Item
            </button>
          </div>
        )}
      </div>

      {/* Type registry, collapsed by default — it is shared across all trips. */}
      <div>
        <button
          type="button"
          className="text-sm text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
          onClick={() => setShowTypeManager((open) => !open)}
        >
          {showTypeManager ? "Hide item types" : "Manage item types"}
        </button>
        {showTypeManager && (
          <div className="mt-3">
            <CustomItemTypeManager
              onUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ["customItemTypes"] });
                refreshData();
              }}
            />
          </div>
        )}
      </div>

      {isAdding && (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label label-required" htmlFor="custom-item-name">
                Name
              </label>
              <input
                id="custom-item-name"
                type="text"
                className="input"
                placeholder="Airport parking"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="custom-item-type">
                Type
              </label>
              <select
                id="custom-item-type"
                className="input"
                value={form.typeId}
                onChange={(e) => setForm({ ...form, typeId: e.target.value })}
              >
                <option value="">No type</option>
                {types?.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="custom-item-all-day"
              type="checkbox"
              className="w-4 h-4 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
            />
            <label className="label mb-0" htmlFor="custom-item-all-day">
              All day
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="custom-item-start">
                Start
              </label>
              <input
                id="custom-item-start"
                type="datetime-local"
                className="input"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate dark:text-dusk-400">
                Leave blank to keep the item off the timeline.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="custom-item-end">
                End
              </label>
              <input
                id="custom-item-end"
                type="datetime-local"
                className="input"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="custom-item-location">
                Location
              </label>
              <select
                id="custom-item-location"
                className="input"
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                <option value="">No location</option>
                {locations?.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="custom-item-timezone">
                Timezone
              </label>
              <input
                id="custom-item-timezone"
                type="text"
                className="input"
                placeholder="Leave blank to use the trip's"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="custom-item-cost">
                Cost
              </label>
              <input
                id="custom-item-cost"
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="custom-item-currency">
                Currency
              </label>
              <input
                id="custom-item-currency"
                type="text"
                maxLength={3}
                className="input uppercase"
                placeholder="USD"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate dark:text-dusk-400">
                Required with a cost, so it counts towards the trip budget.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="custom-item-url">
                URL
              </label>
              <input
                id="custom-item-url"
                type="url"
                className="input"
                placeholder="https://…"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="custom-item-confirmation">
                Confirmation number
              </label>
              <input
                id="custom-item-confirmation"
                type="text"
                className="input"
                value={form.confirmationNumber}
                onChange={(e) =>
                  setForm({ ...form, confirmationNumber: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="custom-item-notes">
              Notes
            </label>
            <textarea
              id="custom-item-notes"
              className="input"
              rows={3}
              placeholder="Markdown supported"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : editingId !== null ? "Save Changes" : "Save Item"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <ListItemSkeleton count={3} />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon="📌"
          message="No custom items yet"
          subMessage="Track anything that does not fit the other tabs"
          actionLabel="Add Item"
          onAction={() => setIsAdding(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item, index) => (
            <div key={item.id} className="card flex gap-4">
              {bulkSelection.selectionMode && (
                <input
                  type="checkbox"
                  checked={bulkSelection.isSelected(item.id)}
                  onChange={() => {}} // Selection handled by onClick to support shiftKey
                  onClick={(e) =>
                    bulkSelection.toggleItemSelection(item.id, index, e.shiftKey, items)
                  }
                  aria-label="Select custom item"
                  className="w-5 h-5 mt-1 flex-shrink-0 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5" aria-hidden="true">
                    📌
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal dark:text-dusk-100 line-clamp-2">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate dark:text-dusk-400 mt-0.5">
                      {item.type?.name ? `${item.type.name} · ` : ""}
                      {formatWhen(item)}
                    </p>
                  </div>
                </div>

                {item.location?.name && (
                  <p className="text-sm text-slate dark:text-dusk-400 mt-2 truncate">
                    📍 {item.location.name}
                  </p>
                )}

                {item.cost != null && (
                  <p className="text-sm text-charcoal dark:text-dusk-300 mt-1">
                    {formatCurrency(item.cost, item.currency)}
                  </p>
                )}

                {item.confirmationNumber && (
                  <p className="text-xs text-slate dark:text-dusk-400 mt-1 font-mono truncate">
                    {item.confirmationNumber}
                  </p>
                )}

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="block text-sm text-primary-600 dark:text-gold hover:underline mt-1 truncate"
                  >
                    {item.url}
                  </a>
                )}

                {item.notes && (
                  <p className="text-sm text-charcoal dark:text-dusk-300 mt-2 line-clamp-2 italic">
                    {item.notes}
                  </p>
                )}

                <div className="flex items-center gap-1 mt-3 flex-wrap">
                  <LinkButton
                    tripId={tripId}
                    entityType="CUSTOM_ITEM"
                    entityId={item.id}
                    linkSummary={getLinkSummary("CUSTOM_ITEM", item.id)}
                    onUpdate={refreshData}
                    size="sm"
                  />
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:underline"
                    onClick={() => handleDelete(item)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {bulkSelection.selectionMode && (
        <BulkActionBar
          entityType="customItem"
          selectedCount={bulkSelection.selectedCount}
          totalCount={items?.length ?? 0}
          onSelectAll={() => bulkSelection.selectAll(items ?? [])}
          onDeselectAll={bulkSelection.deselectAll}
          onExitSelectionMode={bulkSelection.exitSelectionMode}
          onBulkDelete={handleBulkDelete}
          isDeleting={isBulkDeleting}
        />
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
