import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import customItemService from "../services/customItem.service";
import type { CustomItemType } from "../types/customItem";
import { useConfirmDialog } from "../hooks/useConfirmDialog";

/**
 * Manages the user's custom item type registry.
 *
 * Types are user-level, not trip-level — the same "Reservation" is reused
 * across every trip. Seeded starter types are fully editable: `isDefault` is
 * provenance only and never gates editing or deletion.
 */
interface CustomItemTypeManagerProps {
  onUpdate?: () => void;
}

const DEFAULT_COLOR = "#4F46E5";

export default function CustomItemTypeManager({ onUpdate }: CustomItemTypeManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: types, isLoading } = useQuery({
    queryKey: ["customItemTypes"],
    queryFn: () => customItemService.getTypes(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["customItemTypes"] });
    onUpdate?.();
  };

  const reset = () => {
    setName("");
    setColor(DEFAULT_COLOR);
    setEditingId(null);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("A name is required");
      return;
    }

    setSaving(true);
    try {
      if (editingId !== null) {
        await customItemService.updateType(editingId, { name: trimmed, color });
        toast.success("Type updated");
      } else {
        await customItemService.createType({ name: trimmed, color });
        toast.success("Type created");
      }
      reset();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save type");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (type: CustomItemType) => {
    setEditingId(type.id);
    setName(type.name);
    setColor(type.color ?? DEFAULT_COLOR);
  };

  const handleDelete = async (type: CustomItemType) => {
    const confirmed = await confirm({
      title: "Delete type?",
      message: `"${type.name}" will be removed. Items using it are kept and become untyped.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await customItemService.deleteType(type.id);
      toast.success("Type deleted");
      if (editingId === type.id) reset();
      refresh();
    } catch {
      toast.error("Failed to delete type");
    }
  };

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-medium text-charcoal dark:text-dusk-100">Item types</h3>
        <p className="text-xs text-slate dark:text-dusk-400">
          Shared across all your trips. Deleting a type never deletes its items.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <label className="label label-required" htmlFor="custom-item-type-name">
            Name
          </label>
          <input
            id="custom-item-type-name"
            type="text"
            className="input"
            placeholder="Reservation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="custom-item-type-color">
            Colour
          </label>
          <input
            id="custom-item-type-color"
            type="color"
            className="h-10 w-16 rounded border border-primary-200 dark:border-gold/30 bg-transparent"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          {editingId !== null && (
            <button
              type="button"
              className="btn-secondary"
              onClick={reset}
              disabled={saving}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : editingId !== null ? "Save" : "Add Type"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate dark:text-dusk-400">Loading types…</p>
      ) : !types || types.length === 0 ? (
        <p className="text-sm text-slate dark:text-dusk-400">No types yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {types.map((type) => (
            <li
              key={type.id}
              className="flex items-center gap-2 rounded-full border border-primary-100 dark:border-gold/20 px-3 py-1"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: type.color ?? DEFAULT_COLOR }}
                aria-hidden="true"
              />
              <span className="text-sm text-charcoal dark:text-dusk-200">{type.name}</span>
              <button
                type="button"
                className="text-xs text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-gold"
                onClick={() => startEdit(type)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                onClick={() => handleDelete(type)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
