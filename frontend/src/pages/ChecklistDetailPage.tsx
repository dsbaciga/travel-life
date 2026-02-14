import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Checklist, ChecklistItem } from "../types/checklist";
import checklistService from "../services/checklist.service";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import Breadcrumbs from "../components/Breadcrumbs";

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [checklistName, setChecklistName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadChecklist = useCallback(async () => {
    if (!id) return;

    try {
      const data = await checklistService.getChecklistById(parseInt(id));
      setChecklist(data);
      setChecklistName(data.name);
    } catch (err) {
      console.error("Failed to load checklist:", err);
      alert("Failed to load checklist");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const handleToggleItem = async (item: ChecklistItem) => {
    try {
      await checklistService.updateChecklistItem(item.id, {
        isChecked: !item.isChecked,
      });
      await loadChecklist();
    } catch (err) {
      console.error("Failed to update item:", err);
      alert("Failed to update item");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newItemName.trim()) return;

    try {
      await checklistService.addChecklistItem(parseInt(id), {
        name: newItemName,
        description: newItemDescription || null,
      });

      setNewItemName("");
      setNewItemDescription("");
      setShowAddForm(false);
      await loadChecklist();
    } catch (err) {
      console.error("Failed to add item:", err);
      alert("Failed to add item");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    const confirmed = await confirm({
      title: "Delete Item",
      message: "Are you sure you want to delete this item?",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await checklistService.deleteChecklistItem(itemId);
      await loadChecklist();
    } catch (err) {
      console.error("Failed to delete item:", err);
      alert("Failed to delete item");
    }
  };

  const handleSaveName = async () => {
    if (!id || !checklistName.trim()) return;

    try {
      await checklistService.updateChecklist(parseInt(id), {
        name: checklistName,
      });
      setEditingName(false);
      await loadChecklist();
    } catch (err) {
      console.error("Failed to update checklist name:", err);
      alert("Failed to update checklist name");
    }
  };

  const getFilteredItems = () => {
    if (!checklist) return { unchecked: [], checked: [] };

    let items = checklist.items;

    // Filter by search query
    if (searchQuery) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Separate into unchecked and checked
    const unchecked = items.filter((item) => !item.isChecked);
    const checked = items.filter((item) => item.isChecked);

    return { unchecked, checked };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
          Loading...
        </div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
          Checklist not found
        </div>
      </div>
    );
  }

  const { unchecked, checked } = getFilteredItems();

  const renderItem = (item: ChecklistItem, isChecked: boolean) => (
    <div
      key={item.id}
      className={`flex items-start gap-3 p-4 rounded-lg transition-colors ${
        isChecked
          ? "bg-blue-50 dark:bg-blue-900/20"
          : "bg-white dark:bg-gray-700"
      } hover:shadow-md`}
    >
      <input
        type="checkbox"
        checked={item.isChecked}
        onChange={() => handleToggleItem(item)}
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
        aria-label={`Toggle ${item.name}`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 dark:text-white">
          {item.name}
        </div>
        {item.description && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {item.description}
          </div>
        )}
        {item.checkedAt && (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Checked: {new Date(item.checkedAt).toLocaleDateString()}
          </div>
        )}
      </div>
      {!item.isDefault && (
        <button
          onClick={() => handleDeleteItem(item.id)}
          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 flex-shrink-0"
          title="Delete item"
        >
          🗑️
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="mb-8">
          <Breadcrumbs
            items={[
              { label: 'Checklists', href: '/checklists' },
              { label: checklist?.name || 'Checklist' }
            ]}
          />

          <div className="flex justify-between items-start">
            <div className="flex-1">
              {editingName ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={checklistName}
                    onChange={(e) => setChecklistName(e.target.value)}
                    className="input text-3xl font-bold"
                    autoFocus
                    aria-label="Checklist name"
                    placeholder="Enter checklist name"
                  />
                  <button onClick={handleSaveName} className="btn btn-primary">
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setChecklistName(checklist.name);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {checklist.name}
                  </h1>
                  {!checklist.isDefault && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              )}
              {checklist.description && (
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  {checklist.description}
                </p>
              )}
            </div>
          </div>

          {checklist.stats && (
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>
                  {checklist.stats.checked} / {checklist.stats.total} completed
                </span>
                <span className="font-semibold">
                  {checklist.stats.percentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${checklist.stats.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input flex-1"
              placeholder="Search items..."
              aria-label="Search checklist items"
            />
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn btn-primary"
            >
              {showAddForm ? "Cancel" : "+ Add Item"}
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleAddItem}
              className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
            >
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Item Name*
                </label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="input"
                  placeholder="e.g., Grand Canyon"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  className="input"
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Add Item
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {unchecked.length === 0 && checked.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "No items match your search"
                : "No items in this checklist yet"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Unchecked Items Column */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  To Do ({unchecked.length})
                </h2>
                <div className="space-y-3">
                  {unchecked.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      All items checked!
                    </div>
                  ) : (
                    unchecked.map((item) => renderItem(item, false))
                  )}
                </div>
              </div>

              {/* Checked Items Column */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Completed ({checked.length})
                </h2>
                <div className="space-y-3">
                  {checked.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No completed items yet
                    </div>
                  ) : (
                    checked.map((item) => renderItem(item, true))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <ConfirmDialogComponent />
      </div>
    </div>
  );
}
