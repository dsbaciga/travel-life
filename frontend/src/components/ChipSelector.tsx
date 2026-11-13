import { useState, useMemo } from "react";

interface ChipSelectorProps<T> {
  items: T[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  getId: (item: T) => number;
  getLabel: (item: T) => string;
  label: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  className?: string;
}

export default function ChipSelector<T>({
  items,
  selectedIds,
  onChange,
  getId,
  getLabel,
  label,
  emptyMessage = "No items available",
  searchPlaceholder = "Search...",
  className = "",
}: ChipSelectorProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      getLabel(item).toLowerCase().includes(query)
    );
  }, [items, searchQuery, getLabel]);

  const toggleSelection = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(filteredItems.map(getId));
  };

  if (items.length === 0) {
    return (
      <div className={className}>
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
          {label}
        </label>
        <p className="text-sm text-gray-500 dark:text-dusk-400 italic">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300">
          {label} ({selectedIds.length} selected)
        </label>
        <div className="flex gap-1">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-600 dark:text-dusk-400 hover:text-gray-900 dark:hover:text-dusk-200 underline px-2 py-2 min-h-[44px] flex items-center"
            >
              Clear all
            </button>
          )}
          {filteredItems.length > 0 && selectedIds.length < filteredItems.length && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline px-2 py-2 min-h-[44px] flex items-center"
            >
              Select all
            </button>
          )}
        </div>
      </div>

      {items.length > 5 && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="input mb-2 text-sm"
        />
      )}

      <div className="border border-gray-300 dark:border-dusk-600 rounded-lg p-3 bg-gray-50 dark:bg-dusk-900 max-h-48 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dusk-400 italic text-center py-2">
            No items match your search
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredItems.map((item) => {
              const id = getId(item);
              const isSelected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSelection(id)}
                  className={`
                    inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium
                    transition-all duration-150 ease-in-out max-w-full
                    ${
                      isSelected
                        ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                        : "bg-white dark:bg-dusk-800 text-gray-700 dark:text-dusk-300 border border-gray-300 dark:border-dusk-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow"
                    }
                  `}
                >
                  {isSelected && <span className="mr-1 shrink-0">✓</span>}
                  <span className="truncate">{getLabel(item)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
