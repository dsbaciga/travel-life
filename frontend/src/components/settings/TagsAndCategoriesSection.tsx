import { useState, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import userService from "../../services/user.service";
import tagService from "../../services/tag.service";
import type { ActivityCategory, TripTypeCategory } from "../../types/user";
import type { TripTag } from "../../types/tag";
import type { ConfirmDialogProps } from "../ConfirmDialog";
import EmojiPicker from "../EmojiPicker";
import { getRandomTagColor } from "../../utils/tagColors";

type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "isOpen" | "onClose" | "onConfirm" | "isLoading"
>;

interface TagsAndCategoriesSectionProps {
  categories: ActivityCategory[];
  onCategoriesChange: React.Dispatch<React.SetStateAction<ActivityCategory[]>>;
  persistedCategoryNames: React.MutableRefObject<Set<string>>;
  onSaveCategories: () => Promise<void>;
  tripTypes: TripTypeCategory[];
  onTripTypesChange: React.Dispatch<React.SetStateAction<TripTypeCategory[]>>;
  persistedTripTypeNames: React.MutableRefObject<Set<string>>;
  tags: TripTag[];
  onTagsChange: React.Dispatch<React.SetStateAction<TripTag[]>>;
  onReloadTags: () => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function TagsAndCategoriesSection({
  categories,
  onCategoriesChange,
  persistedCategoryNames,
  onSaveCategories,
  tripTypes,
  onTripTypesChange,
  persistedTripTypeNames,
  tags,
  onTagsChange,
  onReloadTags,
  confirm,
}: TagsAndCategoriesSectionProps) {
  const queryClient = useQueryClient();

  const [newCategory, setNewCategory] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("😀");
  const [newTripType, setNewTripType] = useState("");
  const [newTripTypeEmoji, setNewTripTypeEmoji] = useState("🌍");
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(
    null
  );
  const [editingCategoryNewName, setEditingCategoryNewName] = useState("");
  const [editingTripTypeName, setEditingTripTypeName] = useState<string | null>(
    null
  );
  const [editingTripTypeNewName, setEditingTripTypeNewName] = useState("");
  const [editingTagName, setEditingTagName] = useState<number | null>(null);
  const [editingTagNewName, setEditingTagNewName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(getRandomTagColor);
  const [newTagTextColor, setNewTagTextColor] = useState("#FFFFFF");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagColor, setEditingTagColor] = useState("#3B82F6");
  const [editingTagTextColor, setEditingTagTextColor] = useState("#FFFFFF");

  const newTagColorId = useId();
  const newTagTextColorId = useId();

  // Tag edits (delete/rename/recolor) change tagAssignments embedded in the
  // cached trip and trips-list queries, which are persisted offline. Invalidate
  // them so the Trips page reflects the change instead of serving stale tags.
  const invalidateTripTagCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["trips"] });
    queryClient.invalidateQueries({ queryKey: ["trip"] });
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await tagService.createTag({
        name: newTagName.trim(),
        color: newTagColor,
        textColor: newTagTextColor,
      });
      setNewTagName("");
      setNewTagColor(getRandomTagColor());
      setNewTagTextColor("#FFFFFF");
      await onReloadTags();
      toast.success("Tag created");
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    const confirmed = await confirm({
      title: "Delete Tag",
      message: "Delete this tag? It will be removed from all trips.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await tagService.deleteTag(tagId);
      await onReloadTags();
      invalidateTripTagCaches();
      toast.success("Tag deleted");
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  const handleStartRenameTag = (tag: TripTag) => {
    setEditingTagName(tag.id);
    setEditingTagNewName(tag.name);
  };

  const handleCancelRenameTag = () => {
    setEditingTagName(null);
    setEditingTagNewName("");
  };

  const handleSaveRenameTag = async (tagId: number) => {
    const newName = editingTagNewName.trim();
    if (!newName) {
      handleCancelRenameTag();
      return;
    }
    const currentTag = tags.find((t) => t.id === tagId);
    if (currentTag && newName === currentTag.name) {
      handleCancelRenameTag();
      return;
    }
    if (
      tags.some(
        (t) =>
          t.name.toLowerCase() === newName.toLowerCase() && t.id !== tagId
      )
    ) {
      toast.error("A tag with that name already exists");
      return;
    }

    try {
      await tagService.updateTag(tagId, { name: newName });
      await onReloadTags();
      invalidateTripTagCaches();
      setEditingTagName(null);
      setEditingTagNewName("");
      toast.success("Tag renamed");
    } catch {
      toast.error("Failed to rename tag");
    }
  };

  const handleMoveTagUp = async (index: number) => {
    if (index === 0) return;
    const newTags = [...tags];
    [newTags[index - 1], newTags[index]] = [newTags[index], newTags[index - 1]];
    onTagsChange(newTags);
    try {
      await tagService.reorderTags(newTags.map((t) => t.id));
    } catch {
      toast.error("Failed to reorder tags");
      await onReloadTags();
    }
  };

  const handleMoveTagDown = async (index: number) => {
    if (index === tags.length - 1) return;
    const newTags = [...tags];
    [newTags[index], newTags[index + 1]] = [newTags[index + 1], newTags[index]];
    onTagsChange(newTags);
    try {
      await tagService.reorderTags(newTags.map((t) => t.id));
    } catch {
      toast.error("Failed to reorder tags");
      await onReloadTags();
    }
  };

  const handleStartEditTag = (tag: TripTag) => {
    setEditingTagId(tag.id);
    setEditingTagColor(tag.color || "#3B82F6");
    setEditingTagTextColor(tag.textColor || "#FFFFFF");
  };

  const handleCancelEditTag = () => {
    setEditingTagId(null);
    setEditingTagColor("#3B82F6");
    setEditingTagTextColor("#FFFFFF");
  };

  const handleSaveTagColors = async (tagId: number) => {
    try {
      await tagService.updateTag(tagId, {
        color: editingTagColor,
        textColor: editingTagTextColor,
      });
      await onReloadTags();
      invalidateTripTagCaches();
      setEditingTagId(null);
      toast.success("Tag colors updated");
    } catch {
      toast.error("Failed to update tag colors");
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (
      categories.some(
        (c) => c.name.toLowerCase() === newCategory.trim().toLowerCase()
      )
    ) {
      toast.error("Category already exists");
      return;
    }
    onCategoriesChange([
      ...categories,
      { name: newCategory.trim(), emoji: newCategoryEmoji },
    ]);
    setNewCategory("");
    setNewCategoryEmoji("😀");
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const confirmed = await confirm({
      title: "Delete Category",
      message: `Delete "${categoryName}"? It will be removed from all activities that use it.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      if (persistedCategoryNames.current.has(categoryName)) {
        await userService.deleteCategory(categoryName);
        persistedCategoryNames.current.delete(categoryName);
      }
      onCategoriesChange((prev) =>
        prev.filter((c) => c.name !== categoryName)
      );
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const handleStartRenameCategory = (categoryName: string) => {
    setEditingCategoryName(categoryName);
    setEditingCategoryNewName(categoryName);
  };

  const handleCancelRenameCategory = () => {
    setEditingCategoryName(null);
    setEditingCategoryNewName("");
  };

  const handleSaveRenameCategory = async (oldName: string) => {
    const newName = editingCategoryNewName.trim();
    if (!newName || newName === oldName) {
      handleCancelRenameCategory();
      return;
    }
    if (
      categories.some(
        (c) =>
          c.name.toLowerCase() === newName.toLowerCase() && c.name !== oldName
      )
    ) {
      toast.error("A category with that name already exists");
      return;
    }

    try {
      if (persistedCategoryNames.current.has(oldName)) {
        await userService.renameCategory(oldName, newName);
        persistedCategoryNames.current.delete(oldName);
        persistedCategoryNames.current.add(newName);
      }
      onCategoriesChange((prev) =>
        prev.map((c) => (c.name === oldName ? { ...c, name: newName } : c))
      );
      setEditingCategoryName(null);
      setEditingCategoryNewName("");
      toast.success("Category renamed");
    } catch {
      toast.error("Failed to rename category");
    }
  };

  const handleMoveCategoryUp = (index: number) => {
    if (index === 0) return;
    const newCategories = [...categories];
    [newCategories[index - 1], newCategories[index]] = [
      newCategories[index],
      newCategories[index - 1],
    ];
    onCategoriesChange(newCategories);
  };

  const handleMoveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return;
    const newCategories = [...categories];
    [newCategories[index], newCategories[index + 1]] = [
      newCategories[index + 1],
      newCategories[index],
    ];
    onCategoriesChange(newCategories);
  };

  const handleUpdateCategoryEmoji = (
    categoryName: string,
    newEmoji: string
  ) => {
    onCategoriesChange(
      categories.map((c) =>
        c.name === categoryName ? { ...c, emoji: newEmoji } : c
      )
    );
  };

  const handleAddTripType = () => {
    if (!newTripType.trim()) return;
    if (
      tripTypes.some(
        (t) => t.name.toLowerCase() === newTripType.trim().toLowerCase()
      )
    ) {
      toast.error("Trip type already exists");
      return;
    }
    onTripTypesChange([
      ...tripTypes,
      { name: newTripType.trim(), emoji: newTripTypeEmoji },
    ]);
    setNewTripType("");
    setNewTripTypeEmoji("🌍");
  };

  const handleRemoveTripType = async (typeName: string) => {
    const confirmed = await confirm({
      title: "Delete Trip Type",
      message: `Delete "${typeName}"? It will be removed from all trips that use it.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      if (persistedTripTypeNames.current.has(typeName)) {
        await userService.deleteTripType(typeName);
        persistedTripTypeNames.current.delete(typeName);
      }
      onTripTypesChange((prev) => prev.filter((t) => t.name !== typeName));
      toast.success("Trip type deleted");
    } catch {
      toast.error("Failed to delete trip type");
    }
  };

  const handleUpdateTripTypeEmoji = (typeName: string, newEmoji: string) => {
    onTripTypesChange(
      tripTypes.map((t) =>
        t.name === typeName ? { ...t, emoji: newEmoji } : t
      )
    );
  };

  const handleStartRenameTripType = (typeName: string) => {
    setEditingTripTypeName(typeName);
    setEditingTripTypeNewName(typeName);
  };

  const handleCancelRenameTripType = () => {
    setEditingTripTypeName(null);
    setEditingTripTypeNewName("");
  };

  const handleSaveRenameTripType = async (oldName: string) => {
    const newName = editingTripTypeNewName.trim();
    if (!newName || newName === oldName) {
      handleCancelRenameTripType();
      return;
    }
    if (
      tripTypes.some(
        (t) =>
          t.name.toLowerCase() === newName.toLowerCase() && t.name !== oldName
      )
    ) {
      toast.error("A trip type with that name already exists");
      return;
    }

    try {
      if (persistedTripTypeNames.current.has(oldName)) {
        await userService.renameTripType(oldName, newName);
        persistedTripTypeNames.current.delete(oldName);
        persistedTripTypeNames.current.add(newName);
      }
      onTripTypesChange((prev) =>
        prev.map((t) => (t.name === oldName ? { ...t, name: newName } : t))
      );
      setEditingTripTypeName(null);
      setEditingTripTypeNewName("");
      toast.success("Trip type renamed");
    } catch {
      toast.error("Failed to rename trip type");
    }
  };

  const handleMoveTripTypeUp = (index: number) => {
    if (index === 0) return;
    const newTypes = [...tripTypes];
    [newTypes[index - 1], newTypes[index]] = [
      newTypes[index],
      newTypes[index - 1],
    ];
    onTripTypesChange(newTypes);
  };

  const handleMoveTripTypeDown = (index: number) => {
    if (index === tripTypes.length - 1) return;
    const newTypes = [...tripTypes];
    [newTypes[index], newTypes[index + 1]] = [
      newTypes[index + 1],
      newTypes[index],
    ];
    onTripTypesChange(newTypes);
  };

  const handleSaveTripTypes = async () => {
    try {
      await userService.updateSettings({
        tripTypes,
      });
      persistedTripTypeNames.current = new Set(tripTypes.map((t) => t.name));
      toast.success("Trip types saved");
    } catch {
      toast.error("Failed to save trip types");
    }
  };

  return (
    <div className="space-y-6">
      {/* Activity Categories */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Activity Categories
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Customize the activity categories available when creating activities in
          your trips. Each category requires a name and an emoji.
        </p>

        {/* Add New Category */}
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3">
            <EmojiPicker
              value={newCategoryEmoji}
              onChange={setNewCategoryEmoji}
            />
          </div>
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            placeholder="New category name"
            aria-label="New category name"
            className="input flex-1"
          />
          <button
            onClick={handleAddCategory}
            type="button"
            className="btn btn-primary"
          >
            Add Category
          </button>
        </div>

        {/* Categories List */}
        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No categories yet. Add your first category above.
            </p>
          ) : (
            categories.map((category, index) => (
              <div
                key={category.name}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col">
                    <button
                      onClick={() => handleMoveCategoryUp(index)}
                      type="button"
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                      title="Move up"
                      aria-label={`Move ${category.name} up`}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveCategoryDown(index)}
                      type="button"
                      disabled={index === categories.length - 1}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                      title="Move down"
                      aria-label={`Move ${category.name} down`}
                    >
                      ▼
                    </button>
                  </div>
                  <EmojiPicker
                    value={category.emoji}
                    onChange={(emoji) =>
                      handleUpdateCategoryEmoji(category.name, emoji)
                    }
                  />
                  {editingCategoryName === category.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingCategoryNewName}
                        onChange={(e) =>
                          setEditingCategoryNewName(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleSaveRenameCategory(category.name);
                          if (e.key === "Escape")
                            handleCancelRenameCategory();
                        }}
                        className="input flex-1"
                        aria-label="Edit category name"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRenameCategory(category.name)}
                        type="button"
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelRenameCategory}
                        type="button"
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 bg-transparent border-none p-0 text-left font-inherit"
                      onClick={() => handleStartRenameCategory(category.name)}
                      title="Click to rename"
                    >
                      {category.name}
                    </button>
                  )}
                </div>
                {editingCategoryName !== category.name && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartRenameCategory(category.name)}
                      type="button"
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.name)}
                      type="button"
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Save Button */}
        <div className="mt-6">
          <button
            onClick={onSaveCategories}
            type="button"
            className="btn btn-primary"
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* Trip Types */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Trip Types
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Customize the trip types available when creating trips. Each type
          requires a name and an emoji.
        </p>

        {/* Add New Trip Type */}
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3">
            <EmojiPicker
              value={newTripTypeEmoji}
              onChange={setNewTripTypeEmoji}
            />
          </div>
          <input
            type="text"
            value={newTripType}
            onChange={(e) => setNewTripType(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTripType()}
            placeholder="New trip type name"
            aria-label="New trip type name"
            className="input flex-1"
          />
          <button
            onClick={handleAddTripType}
            type="button"
            className="btn btn-primary"
          >
            Add Type
          </button>
        </div>

        {/* Trip Types List */}
        <div className="space-y-2">
          {tripTypes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No trip types yet. Add your first trip type above.
            </p>
          ) : (
            tripTypes.map((tripType, index) => (
              <div
                key={tripType.name}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col">
                    <button
                      onClick={() => handleMoveTripTypeUp(index)}
                      type="button"
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                      title="Move up"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveTripTypeDown(index)}
                      type="button"
                      disabled={index === tripTypes.length - 1}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                      title="Move down"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <EmojiPicker
                    value={tripType.emoji}
                    onChange={(emoji) =>
                      handleUpdateTripTypeEmoji(tripType.name, emoji)
                    }
                  />
                  {editingTripTypeName === tripType.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingTripTypeNewName}
                        onChange={(e) =>
                          setEditingTripTypeNewName(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleSaveRenameTripType(tripType.name);
                          if (e.key === "Escape")
                            handleCancelRenameTripType();
                        }}
                        className="input flex-1"
                        aria-label="Edit trip type name"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRenameTripType(tripType.name)}
                        type="button"
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelRenameTripType}
                        type="button"
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 bg-transparent border-none p-0 text-left font-inherit"
                      onClick={() => handleStartRenameTripType(tripType.name)}
                      title="Click to rename"
                    >
                      {tripType.name}
                    </button>
                  )}
                </div>
                {editingTripTypeName !== tripType.name && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartRenameTripType(tripType.name)}
                      type="button"
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleRemoveTripType(tripType.name)}
                      type="button"
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Save Button */}
        <div className="mt-6">
          <button
            onClick={handleSaveTripTypes}
            type="button"
            className="btn btn-primary"
          >
            Save Trip Types
          </button>
        </div>
      </div>

      {/* Global Tag Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Trip Tags
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Create and manage tags that can be assigned to trips. Tags help
          organize and categorize your trips.
        </p>

        {/* Create New Tag */}
        <div className="space-y-3 mb-4">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            placeholder="New tag name"
            aria-label="New tag name"
            className="input w-full"
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                htmlFor={newTagColorId}
              >
                Background Color
              </label>
              <input
                type="color"
                id={newTagColorId}
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="flex-1">
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                htmlFor={newTagTextColorId}
              >
                Text Color
              </label>
              <input
                type="color"
                id={newTagTextColorId}
                value={newTagTextColor}
                onChange={(e) => setNewTagTextColor(e.target.value)}
                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>
          <button
            onClick={handleCreateTag}
            type="button"
            className="btn btn-primary w-full"
          >
            Create Tag
          </button>
        </div>

        {/* Tags List */}
        <div className="space-y-2">
          {tags.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No tags yet. Create your first tag above.
            </p>
          ) : (
            tags.map((tag, index) => (
              <div
                key={tag.id}
                className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
              >
                {editingTagId === tag.id ? (
                  // Edit colors mode
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="px-3 py-1 rounded-full text-sm font-medium truncate max-w-full"
                        style={{
                          backgroundColor: editingTagColor,
                          color: editingTagTextColor,
                        }}
                      >
                        {tag.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                        (Preview)
                      </span>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                          htmlFor={`edit-tag-bg-${tag.id}`}
                        >
                          Background Color
                        </label>
                        <input
                          type="color"
                          id={`edit-tag-bg-${tag.id}`}
                          value={editingTagColor}
                          onChange={(e) => setEditingTagColor(e.target.value)}
                          className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                          htmlFor={`edit-tag-text-${tag.id}`}
                        >
                          Text Color
                        </label>
                        <input
                          type="color"
                          id={`edit-tag-text-${tag.id}`}
                          value={editingTagTextColor}
                          onChange={(e) =>
                            setEditingTagTextColor(e.target.value)
                          }
                          className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveTagColors(tag.id)}
                        type="button"
                        className="btn btn-primary text-sm"
                      >
                        Save Colors
                      </button>
                      <button
                        onClick={handleCancelEditTag}
                        type="button"
                        className="btn btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : editingTagName === tag.id ? (
                  // Rename mode
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <button
                        onClick={() => handleMoveTagUp(index)}
                        type="button"
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                        title="Move up"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveTagDown(index)}
                        type="button"
                        disabled={index === tags.length - 1}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                        title="Move down"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <span
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: tag.color || "#3B82F6",
                        color: tag.textColor || "#FFFFFF",
                      }}
                    >
                      {editingTagNewName || tag.name}
                    </span>
                    <input
                      type="text"
                      value={editingTagNewName}
                      onChange={(e) => setEditingTagNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRenameTag(tag.id);
                        if (e.key === "Escape") handleCancelRenameTag();
                      }}
                      className="input flex-1"
                      aria-label="Edit tag name"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRenameTag(tag.id)}
                      type="button"
                      className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelRenameTag}
                      type="button"
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMoveTagUp(index)}
                          type="button"
                          disabled={index === 0}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                          title="Move up"
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveTagDown(index)}
                          type="button"
                          disabled={index === tags.length - 1}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                          title="Move down"
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1 rounded-full text-sm font-medium cursor-pointer bg-transparent border-none p-0"
                        style={{
                          backgroundColor: tag.color || "#3B82F6",
                          color: tag.textColor || "#FFFFFF",
                        }}
                        onClick={() => handleStartRenameTag(tag)}
                        title="Click to rename"
                      >
                        {tag.name}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartRenameTag(tag)}
                        type="button"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleStartEditTag(tag)}
                        type="button"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                      >
                        Edit Colors
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        type="button"
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
