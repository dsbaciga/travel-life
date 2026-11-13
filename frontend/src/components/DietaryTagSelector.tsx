import { DIETARY_TAGS, type DietaryTagId } from "../constants/dietaryTags";

interface DietaryTagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  showLabels?: boolean;
  className?: string;
  compact?: boolean;
  id?: string;
  /** Show the "Select all" shortcut. Defaults to true. */
  showSelectAll?: boolean;
}

/**
 * Multi-select component for dietary tags.
 * Displays a grid of checkbox items showing emoji + label.
 */
export default function DietaryTagSelector({
  selectedTags,
  onChange,
  showLabels = true,
  className = "",
  compact = false,
  id,
  showSelectAll = true,
}: DietaryTagSelectorProps) {
  const toggleTag = (tagId: DietaryTagId) => {
    if (selectedTags.includes(tagId)) {
      onChange(selectedTags.filter((t) => t !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(DIETARY_TAGS.map((t) => t.id));
  };

  return (
    <div className={className}>
      {/* Header with count and actions */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-dusk-400">
          {selectedTags.length > 0
            ? `${selectedTags.length} selected`
            : "None selected"}
        </span>
        <div className="flex gap-2">
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-600 dark:text-dusk-400 hover:text-gray-900 dark:hover:text-dusk-200 underline"
            >
              Clear
            </button>
          )}
          {showSelectAll && selectedTags.length < DIETARY_TAGS.length && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary-600 dark:text-gold hover:text-primary-800 dark:hover:text-yellow-300 underline"
            >
              Select all
            </button>
          )}
        </div>
      </div>

      {/* Grid of tags */}
      <span id="dietary-tags-description" className="sr-only">
        Select dietary preferences by clicking the options below. Use arrow keys to navigate.
      </span>
      <div
        id={id}
        role="group"
        aria-label="Dietary preference options"
        aria-describedby="dietary-tags-description"
        className={`grid gap-2 ${
          compact
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
        }`}
      >
        {DIETARY_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag.id);
          return (
            <label
              key={tag.id}
              className={`
                flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-150
                ${
                  isSelected
                    ? "bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500 dark:border-gold"
                    : "bg-gray-50 dark:bg-dusk-800 border-2 border-transparent hover:border-gray-300 dark:hover:border-dusk-600"
                }
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleTag(tag.id)}
                className="sr-only"
              />
              <span className="text-lg flex-shrink-0">{tag.emoji}</span>
              {showLabels && (
                <span
                  className={`text-sm truncate ${
                    isSelected
                      ? "text-primary-800 dark:text-gold font-medium"
                      : "text-gray-700 dark:text-dusk-300"
                  }`}
                >
                  {tag.label}
                </span>
              )}
              {isSelected && (
                <span className="ml-auto text-primary-600 dark:text-gold">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
