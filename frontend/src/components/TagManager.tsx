import { useState, useEffect, useId, useCallback } from "react";
import tagService from "../services/tag.service";
import type { Tag, TripTag } from "../types/tag";
import toast from "react-hot-toast";
import { useManagerCRUD } from "../hooks/useManagerCRUD";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useFormReset } from "../hooks/useFormReset";
import Modal from "./Modal";
import {
  DEFAULT_TAG_COLORS,
  DEFAULT_TAG_COLOR,
  DEFAULT_TEXT_COLOR,
  getRandomTagColor,
} from "../utils/tagColors";

interface TagFormData {
  name: string;
  color: string;
}

interface TagManagerProps {
  tripId: number;
}

export default function TagManager({ tripId }: TagManagerProps) {
  // Service adapter for trip tags (tags linked to this trip)
  const tripTagServiceAdapter = {
    getByTrip: tagService.getTagsByTrip,
    create: async () => { throw new Error("Use handleCreateTag instead"); },
    update: async () => { throw new Error("Use handleUpdateTag instead"); },
    delete: async () => { throw new Error("Use handleDeleteTag instead"); },
  };

  // Initialize CRUD hook for trip tags
  const manager = useManagerCRUD<TripTag>(tripTagServiceAdapter, tripId, {
    itemName: "tag",
  });

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [tags, setTags] = useState<Tag[]>([]);
  const tagNameId = useId();
  const tagColorId = useId();

  // Form state management using useFormReset hook
  const initialFormState: TagFormData = { name: "", color: getRandomTagColor() };
  const [formData, setFormData] = useState<TagFormData>(initialFormState);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);

  const { resetForm, openEditForm } = useFormReset({
    initialState: initialFormState,
    setFormData,
    setEditingId: setEditingTagId,
    setShowForm: setShowTagForm,
  });

  // Custom openCreateForm that generates a new random color each time
  const openCreateFormWithRandomColor = useCallback(() => {
    setFormData({ name: "", color: getRandomTagColor() });
    setEditingTagId(null);
    setShowTagForm(true);
  }, []);

  // Reload tags when navigating between trips to ensure fresh data
  useEffect(() => {
    loadAllTags();
  }, [tripId]);

  const loadAllTags = async () => {
    try {
      const allTags = await tagService.getTagsByUser();
      setTags(allTags);
    } catch {
      toast.error("Failed to load tags");
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newTag = await tagService.createTag({
        name: formData.name,
        color: formData.color,
        textColor: DEFAULT_TEXT_COLOR,
      });
      toast.success("Tag created");
      resetForm();
      await loadAllTags();
      // Automatically link the new tag to this trip
      await handleLinkTag(newTag.id);
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTagId) return;

    try {
      await tagService.updateTag(editingTagId, {
        name: formData.name,
        color: formData.color,
      });
      toast.success("Tag updated");
      resetForm();
      loadAllTags();
      manager.loadItems();
    } catch {
      toast.error("Failed to update tag");
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    const confirmed = await confirm({
      title: 'Delete Tag',
      message: 'Delete this tag? It will be removed from all trips.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await tagService.deleteTag(tagId);
      toast.success("Tag deleted");
      loadAllTags();
      manager.loadItems();
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  const handleLinkTag = async (tagId: number) => {
    try {
      await tagService.linkTagToTrip(tripId, tagId);
      toast.success("Tag added to trip");
      manager.loadItems();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (error.response?.data?.message?.includes("already linked")) {
        toast.error("Tag already added to this trip");
      } else {
        toast.error("Failed to add tag");
      }
    }
  };

  const handleUnlinkTag = async (tagId: number) => {
    try {
      await tagService.unlinkTagFromTrip(tripId, tagId);
      toast.success("Tag removed from trip");
      manager.loadItems();
    } catch {
      toast.error("Failed to remove tag");
    }
  };

  // startEdit now uses openEditForm from useFormReset hook - reduces 4 lines to 1 call
  const startEdit = (tag: Tag | TripTag) => {
    openEditForm(tag.id, { name: tag.name, color: tag.color || DEFAULT_TAG_COLOR });
  };

  // cancelForm is now just resetForm from useFormReset hook - reduces 4 lines to 1 call
  const cancelForm = resetForm;

  if (manager.loading) {
    return <div className="text-center py-4">Loading tags...</div>;
  }

  const availableTags = tags.filter(
    (tag) => !manager.items.find((tt) => tt.id === tag.id)
  );

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white min-w-0 flex-1 truncate">
          Tags
        </h2>
        <button
          onClick={openCreateFormWithRandomColor}
          className="btn btn-primary whitespace-nowrap flex-shrink-0"
        >
          + Create Tag
        </button>
      </div>

      {/* Create/Edit Tag Form Modal */}
      <Modal
        isOpen={showTagForm}
        onClose={cancelForm}
        title={editingTagId ? "Edit Tag" : "Create Tag"}
        icon="🏷️"
        maxWidth="lg"
        formId="tag-form"
        focusFirstInput
        animate
        footer={
          <>
            <button
              type="button"
              onClick={cancelForm}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="tag-form"
              className="btn btn-primary"
            >
              {editingTagId ? "Update" : "Create"} Tag
            </button>
          </>
        }
      >
        <form
          id="tag-form"
          onSubmit={editingTagId ? handleUpdateTag : handleCreateTag}
          className="space-y-4"
        >
          <div>
            <label htmlFor={tagNameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tag Name *
            </label>
            <input
              type="text"
              id={tagNameId}
              name="tag-name"
              autoComplete="off"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="Adventure, Beach, Food\u2026"
              maxLength={50}
              required
            />
          </div>
          <div>
            <label htmlFor={tagColorId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {DEFAULT_TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-10 h-10 rounded-full border-2 ${
                    formData.color === color ? "border-gray-900 dark:border-white" : "border-gray-300 dark:border-gray-600"
                  }`}
                  aria-label={`Select color ${color}`}
                  title={`Select color ${color}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <input
              type="color"
              id={tagColorId}
              name="tag-color"
              autoComplete="off"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="mt-2 h-10 w-32 cursor-pointer"
              aria-label="Custom color picker"
            />
          </div>
        </form>
      </Modal>

      {/* Trip Tags */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Tags on this trip</h3>
        {manager.items.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            No tags added yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {manager.items.map((tag) => (
              <div
                key={tag.id}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-medium"
                style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }}
              >
                <span>{tag.name}</span>
                <button
                  onClick={() => startEdit(tag)}
                  className="hover:opacity-75"
                  title="Edit tag"
                  aria-label={`Edit tag ${tag.name}`}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleUnlinkTag(tag.id)}
                  className="hover:opacity-75"
                  title="Remove from trip"
                  aria-label={`Remove tag ${tag.name} from trip`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Tags */}
      {availableTags.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Add existing tags</h3>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleLinkTag(tag.id)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-medium hover:opacity-80"
                style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }}
                aria-label={`Add tag ${tag.name} to trip`}
              >
                <span>{tag.name}</span>
                <span aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All User Tags */}
      {tags.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">All your tags</h3>
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR, color: DEFAULT_TEXT_COLOR }}
                  >
                    {tag.name}
                  </span>
                  {tag._count && (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ({tag._count.trips}{" "}
                      {tag._count.trips === 1 ? "trip" : "trips"})
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(tag)}
                    className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                    aria-label={`Edit tag ${tag.name}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
                    aria-label={`Delete tag ${tag.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialogComponent />
    </div>
  );
}
